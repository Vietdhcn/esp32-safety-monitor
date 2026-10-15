#define ERA_LOCATION_VN

#include "secrets.h"

#include <Arduino.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <ERa.hpp>
#include <Automation/ERaSmart.hpp>
#include <Time/ERaEspTime.hpp>
#include <HTTPClient.h>
#include <Preferences.h>
#include <sys/time.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <time.h>

// ESP32S 30P pin map retained from the original Viet.ino sketch.
constexpr uint8_t FLAME_DO_PIN = 16;
constexpr uint8_t MQ2_DO_PIN = 17;
constexpr uint8_t BUZZER_PIN = 13;
constexpr uint8_t ALARM_LED_PIN = 22;
constexpr uint8_t STATUS_LED_PIN = 23;
constexpr uint8_t FAN_ON_PIN = 32;
constexpr uint8_t FAN_OFF_PIN = 33;
constexpr uint8_t DHT11_PIN = 27;   // New wire; change here if GPIO27 is occupied.
constexpr uint8_t MQ2_AO_PIN = 34;  // New wire, through a 5 V -> 3.3 V divider.
constexpr char DEVICE_ID[] = "esp32s-30p-01";

ERaEspTime syncTime;
ERaSmart smart(ERa, syncTime);
DHT dht(DHT11_PIN, DHT11);

volatile int flame_sensor = 0;
volatile int flame_time_detect = 0;
volatile int gas_sensor = 0;
volatile int state_pan = 0;
volatile int manual_pan = 0;
volatile int gasRaw = -1;
volatile float temperatureC = NAN;
volatile float humidityPct = NAN;

String firebaseIdToken;
unsigned long authenticatedAt = 0;

// The installed 5 V relay supports on/off only. Never send PWM to this relay.
constexpr bool FAN_SPEED_SUPPORTED = false;
constexpr int MODE_AUTO = 0;
constexpr int MODE_ON = 1;
constexpr int MODE_OFF = 2;
struct ControlCommands {
  bool fanOn = false;
  int alarmLedMode = MODE_AUTO;
  int statusLedMode = MODE_AUTO;
  int buzzerMode = MODE_AUTO;
  bool alarmDisabled = false;
  uint64_t muteRequestedAt = 0;
  char commandId[65] = "";
};
struct AppliedOutputs {
  bool fanOn = false;
  bool alarmLedOn = false;
  bool statusLedOn = true;
  bool buzzerOn = true;
  bool alarmDisabled = false;
  int alarmLedMode = MODE_AUTO;
  int statusLedMode = MODE_AUTO;
  int buzzerMode = MODE_AUTO;
  uint64_t muteUntil = 0;
  char commandId[65] = "";
};
ControlCommands controls;
AppliedOutputs outputs;
portMUX_TYPE controlMux = portMUX_INITIALIZER_UNLOCKED;
Preferences controlPreferences;

uint64_t epochMillis() {
  timeval current;
  gettimeofday(&current, nullptr);
  return static_cast<uint64_t>(current.tv_sec) * 1000ULL + current.tv_usec / 1000;
}
int parseOutputMode(const char* value, int fallback) {
  if (strcmp(value, "auto") == 0) return MODE_AUTO;
  if (strcmp(value, "on") == 0) return MODE_ON;
  if (strcmp(value, "off") == 0) return MODE_OFF;
  return fallback;
}
const char* outputModeName(int value) {
  return value == MODE_ON ? "on" : value == MODE_OFF ? "off" : "auto";
}
bool manualOutput(int mode, bool automatic) {
  return mode == MODE_ON || (mode == MODE_AUTO && automatic);
}

ERA_WRITE_SMS() {
  ERA_LOG("ERa", "SMS to %s: %s", to, message);
  return true;
}

ERA_CONNECTED() {
  ERA_LOG("ERa", "ERa connected!");
}

ERA_DISCONNECTED() {
  ERA_LOG("ERa", "ERa disconnected!");
}

void onPan() {
  digitalWrite(FAN_ON_PIN, HIGH);
  digitalWrite(FAN_OFF_PIN, LOW);
  state_pan = 1;
}

void offPan() {
  digitalWrite(FAN_ON_PIN, LOW);
  digitalWrite(FAN_OFF_PIN, LOW);
  state_pan = 0;
}

void readDht() {
  if (!DHT11_CONNECTED) return;
  const float humidity = dht.readHumidity();
  const float temperature = dht.readTemperature();
  if (!isnan(humidity) && humidity >= 0 && humidity <= 100) humidityPct = humidity;
  if (!isnan(temperature) && temperature >= -40 && temperature <= 80) temperatureC = temperature;
}

void send_data_period() {
  ERa.virtualWrite(V0, flame_sensor);
  ERa.virtualWrite(V1, gas_sensor);
  ERa.virtualWrite(V2, state_pan);
  if (DHT11_CONNECTED && !isnan(temperatureC)) ERa.virtualWrite(V3, temperatureC);
  if (DHT11_CONNECTED && !isnan(humidityPct)) ERa.virtualWrite(V4, humidityPct);
  if (MQ2_AO_CONNECTED && gasRaw >= 0) ERa.virtualWrite(V5, gasRaw);
}

ERA_WRITE(V2) {
  // ERa retains its toggle action; the sensor task owns all GPIO writes.
  portENTER_CRITICAL(&controlMux);
  controls.fanOn = state_pan == 0;
  portEXIT_CRITICAL(&controlMux);
}

// Every Firebase request uses HTTPS with certificate validation.
int firebaseHttp(const String& url, const char* method, const String& body, String& response) {
  WiFiClientSecure client;
  client.useBuiltinCACertBundle();
  HTTPClient http;
  if (!http.begin(client, url)) return -1;
  http.setTimeout(3500);
  if (strcmp(method, "GET") != 0) http.addHeader("Content-Type", "application/json");
  int status = -1;
  if (strcmp(method, "POST") == 0) status = http.POST(body);
  else if (strcmp(method, "PUT") == 0) status = http.PUT(body);
  else status = http.GET();
  if (status > 0) response = http.getString();
  http.end();
  return status;
}

bool ensureFirebaseAuth() {
  if (firebaseIdToken.length() && millis() - authenticatedAt < 45UL * 60UL * 1000UL) return true;
  JsonDocument request;
  request["email"] = DEVICE_EMAIL;
  request["password"] = DEVICE_PASSWORD;
  request["returnSecureToken"] = true;
  String body;
  serializeJson(request, body);
  String response;
  const String url = String("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=") + FIREBASE_API_KEY;
  const int authStatus = firebaseHttp(url, "POST", body, response);
  if (authStatus != 200) {
    Serial.printf("Firebase auth HTTP %d\n", authStatus);
    return false;
  }
  Serial.println("Firebase auth OK");
  JsonDocument result;
  if (deserializeJson(result, response) != DeserializationError::Ok) return false;
  const char* token = result["idToken"] | "";
  if (!token[0]) return false;
  firebaseIdToken = token;
  authenticatedAt = millis();
  return true;
}

String firebasePath(const char* path) {
  String base = FIREBASE_DATABASE_URL;
  while (base.endsWith("/")) base.remove(base.length() - 1);
  return base + "/devices/" + DEVICE_ID + "/" + path + ".json?auth=" + firebaseIdToken;
}

void pollCommands() {
  String response;
  const int status = firebaseHttp(firebasePath("commands"), "GET", "", response);
  if (status != 200 || response == "null") {
    if (status != 200) Serial.printf("Firebase commands HTTP %d\n", status);
    return;
  }
  JsonDocument value;
  if (deserializeJson(value, response) != DeserializationError::Ok || !value.is<JsonObject>()) return;
  ControlCommands next;
  portENTER_CRITICAL(&controlMux);
  next = controls;
  portEXIT_CRITICAL(&controlMux);
  if (value["fanOn"].is<bool>()) next.fanOn = value["fanOn"].as<bool>();
  if (value["alarmLedMode"].is<const char*>()) next.alarmLedMode = parseOutputMode(value["alarmLedMode"], next.alarmLedMode);
  if (value["statusLedMode"].is<const char*>()) next.statusLedMode = parseOutputMode(value["statusLedMode"], next.statusLedMode);
  if (value["buzzerMode"].is<const char*>()) next.buzzerMode = parseOutputMode(value["buzzerMode"], next.buzzerMode);
  if (value["muteRequestedAt"].is<uint64_t>()) next.muteRequestedAt = value["muteRequestedAt"].as<uint64_t>();
  bool persistDisabled = false;
  if (value["alarmDisabled"].is<bool>()) {
    const bool disabled = value["alarmDisabled"].as<bool>();
    persistDisabled = disabled != next.alarmDisabled;
    next.alarmDisabled = disabled;
  }
  const char* commandId = value["commandId"] | "";
  strlcpy(next.commandId, commandId, sizeof(next.commandId));
  if (persistDisabled) controlPreferences.putBool("alarmDisabled", next.alarmDisabled);
  portENTER_CRITICAL(&controlMux);
  controls = next;
  portEXIT_CRITICAL(&controlMux);
}

void publishTelemetry() {
  JsonDocument data;
  data["flameDetected"] = flame_sensor == LOW;
  data["gasAlarm"] = gas_sensor == LOW;
  AppliedOutputs current;
  portENTER_CRITICAL(&controlMux);
  current = outputs;
  portEXIT_CRITICAL(&controlMux);
  data["fanOn"] = current.fanOn;
  data["alarmLedOn"] = current.alarmLedOn;
  data["statusLedOn"] = current.statusLedOn;
  data["buzzerOn"] = current.buzzerOn;
  data["alarmLedMode"] = outputModeName(current.alarmLedMode);
  data["statusLedMode"] = outputModeName(current.statusLedMode);
  data["buzzerMode"] = outputModeName(current.buzzerMode);
  data["controlsVersion"] = 2;
  data["fanSpeedSupported"] = FAN_SPEED_SUPPORTED;
  data["fanSpeedPct"] = current.fanOn ? 100 : 0;
  data["alarmDisabled"] = current.alarmDisabled;
  data["muteUntil"] = current.muteUntil;
  data["appliedCommandId"] = current.commandId;
  if (MQ2_AO_CONNECTED && gasRaw >= 0) data["gasRaw"] = gasRaw;
  if (DHT11_CONNECTED && !isnan(temperatureC)) data["temperatureC"] = temperatureC;
  if (DHT11_CONNECTED && !isnan(humidityPct)) data["humidityPct"] = humidityPct;
  data["updatedAt"][".sv"] = "timestamp";
  String body;
  serializeJson(data, body);
  String response;
  const int status = firebaseHttp(firebasePath("telemetry"), "PUT", body, response);
  if (status != 200) Serial.printf("Firebase telemetry HTTP %d\n", status);
}

void cloudTask(void*) {
  for (;;) {
    if (WiFi.status() == WL_CONNECTED && time(nullptr) > 1700000000 && ensureFirebaseAuth()) {
      pollCommands();
      publishTelemetry();
    }
    vTaskDelay(pdMS_TO_TICKS(2000));
  }
}

// Keep the local alarm responsive even while ERa.begin waits for Wi-Fi.
void task_1(void*) {
  unsigned long lastDhtSample = 0;
  unsigned long lastStatusLog = 0;
  for (;;) {
    flame_sensor = digitalRead(FLAME_DO_PIN);
    gas_sensor = digitalRead(MQ2_DO_PIN);
    ControlCommands command;
    portENTER_CRITICAL(&controlMux);
    command = controls;
    portEXIT_CRITICAL(&controlMux);
    manual_pan = command.fanOn ? 1 : 0;
    const uint64_t nowEpoch = epochMillis();
    const uint64_t muteUntil = command.muteRequestedAt > 0 ? command.muteRequestedAt + 30000ULL : 0;
    // A timestamp from the distant future never suppresses local alarms.
    const bool muted = !command.alarmDisabled && nowEpoch > 1700000000000ULL && command.muteRequestedAt <= nowEpoch + 5000ULL && nowEpoch < muteUntil;
    const bool alarm = flame_sensor == LOW || gas_sensor == LOW;
    const bool automaticAlarm = alarm && !command.alarmDisabled;
    if (flame_sensor == LOW && automaticAlarm) {
      if (flame_time_detect < 10) ++flame_time_detect;
    } else flame_time_detect = 0;

    if (muted) {
      offPan();
      digitalWrite(BUZZER_PIN, LOW);
      digitalWrite(ALARM_LED_PIN, LOW);
      digitalWrite(STATUS_LED_PIN, LOW);
    } else {
      if ((gas_sensor == LOW && !command.alarmDisabled) || manual_pan != 0) onPan();
      else offPan();
      if (automaticAlarm) {
        // Preserve the alert pulse sequence of the user's working sample.
        digitalWrite(BUZZER_PIN, !digitalRead(BUZZER_PIN));
        digitalWrite(ALARM_LED_PIN, !digitalRead(ALARM_LED_PIN));
        digitalWrite(STATUS_LED_PIN, LOW);
      } else {
        // AUTO keeps sample idle HIGH on D13. Explicit OFF is LOW for the
        // confirmed two-pin buzzer (+ D13, - GND). Admin-disabled AUTO is quiet.
        digitalWrite(BUZZER_PIN, manualOutput(command.buzzerMode, !command.alarmDisabled) ? HIGH : LOW);
        digitalWrite(ALARM_LED_PIN, manualOutput(command.alarmLedMode, false) ? HIGH : LOW);
        digitalWrite(STATUS_LED_PIN, manualOutput(command.statusLedMode, !command.alarmDisabled) ? HIGH : LOW);
      }
    }
    AppliedOutputs applied;
    applied.fanOn = state_pan != 0;
    applied.alarmLedOn = digitalRead(ALARM_LED_PIN) == HIGH;
    applied.statusLedOn = digitalRead(STATUS_LED_PIN) == HIGH;
    applied.buzzerOn = digitalRead(BUZZER_PIN) == HIGH;
    applied.alarmLedMode = command.alarmLedMode;
    applied.statusLedMode = command.statusLedMode;
    applied.buzzerMode = command.buzzerMode;
    applied.alarmDisabled = command.alarmDisabled;
    applied.muteUntil = muted ? muteUntil : 0;
    strlcpy(applied.commandId, command.commandId, sizeof(applied.commandId));
    portENTER_CRITICAL(&controlMux);
    outputs = applied;
    portEXIT_CRITICAL(&controlMux);
    if (MQ2_AO_CONNECTED) gasRaw = analogRead(MQ2_AO_PIN);
    const unsigned long now = millis();
    if (now - lastStatusLog >= 5000) {
      lastStatusLog = now;
      Serial.printf("Monitor WiFi=%d time=%lld flame=%d gas=%d fan=%d buzzer=%d\n",
                    static_cast<int>(WiFi.status()), static_cast<long long>(time(nullptr)),
                    flame_sensor == LOW, gas_sensor == LOW, state_pan != 0, digitalRead(BUZZER_PIN));
    }
    if (DHT11_CONNECTED && now - lastDhtSample >= 2500) {
      lastDhtSample = now;
      readDht();
    }
    delay(100);
    vTaskDelay(1);
  }
}

void connectConfiguredWiFi() {
  WiFi.onEvent([](WiFiEvent_t event, WiFiEventInfo_t info) {
    if (event == ARDUINO_EVENT_WIFI_STA_DISCONNECTED) {
      Serial.printf("WiFi disconnect reason=%u\n", info.wifi_sta_disconnected.reason);
    }
  });
  WiFi.mode(WIFI_STA);
  const int networkCount = WiFi.scanNetworks(false, true);
  struct WifiCandidate { int32_t channel; uint8_t bssid[6]; };
  WifiCandidate candidates[8];
  int candidateCount = 0;
  for (int i = 0; i < networkCount && candidateCount < 8; ++i) {
    if (WiFi.SSID(i) == WIFI_SSID) {
      candidates[candidateCount].channel = WiFi.channel(i);
      memcpy(candidates[candidateCount].bssid, WiFi.BSSID(i), 6);
      ++candidateCount;
    }
  }
  Serial.printf("WiFi scan count=%d targetCount=%d\n", networkCount, candidateCount);
  WiFi.scanDelete();
  for (int i = 0; i < candidateCount; ++i) {
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD, candidates[i].channel, candidates[i].bssid);
    const unsigned long started = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - started < 12000) {
      delay(100);
    }
    const bool connected = WiFi.status() == WL_CONNECTED;
    Serial.printf("WiFi candidate channel=%d connected=%d\n", candidates[i].channel, connected);
    if (connected) break;
    WiFi.disconnect(false, false);
    delay(500);
  }

  ERa.setScanWiFi(false);
}

void setup() {
  Serial.begin(115200);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(ALARM_LED_PIN, OUTPUT);
  pinMode(STATUS_LED_PIN, OUTPUT);
  pinMode(FAN_ON_PIN, OUTPUT);
  pinMode(FAN_OFF_PIN, OUTPUT);
  pinMode(FLAME_DO_PIN, INPUT);
  pinMode(MQ2_DO_PIN, INPUT);
  if (MQ2_AO_CONNECTED) {
    pinMode(MQ2_AO_PIN, INPUT);
    analogReadResolution(12);
    analogSetPinAttenuation(MQ2_AO_PIN, ADC_11db);
  }
  controlPreferences.begin("safety-control", false);
  controls.alarmDisabled = controlPreferences.getBool("alarmDisabled", false);
  digitalWrite(BUZZER_PIN, controls.alarmDisabled ? LOW : HIGH);
  digitalWrite(ALARM_LED_PIN, LOW);
  digitalWrite(STATUS_LED_PIN, controls.alarmDisabled ? LOW : HIGH);
  offPan();
  if (DHT11_CONNECTED) dht.begin();

  xTaskCreatePinnedToCore(task_1, "task_1", 6144, nullptr, 2, nullptr, 0);

  connectConfiguredWiFi();
  ERa.begin(WIFI_SSID, WIFI_PASSWORD);
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  ERa.addInterval(1000L, send_data_period);
  xTaskCreatePinnedToCore(cloudTask, "firebase", 10240, nullptr, 1, nullptr, 0);
}

void loop() {
  ERa.run();
  delay(1);
}
