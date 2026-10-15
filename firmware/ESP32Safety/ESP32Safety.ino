#define ERA_LOCATION_VN

#include "secrets.h"

#include <Arduino.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <ERa.hpp>
#include <Automation/ERaSmart.hpp>
#include <Time/ERaEspTime.hpp>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <time.h>

#include "gts_roots.h"

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

volatile bool flameDetected = false;
volatile bool gasAlarm = false;
volatile bool fanOn = false;
volatile bool manualFan = false;
volatile int gasRaw = -1;
volatile float temperatureC = NAN;
volatile float humidityPct = NAN;

String firebaseIdToken;
unsigned long authenticatedAt = 0;

ERA_WRITE_SMS() {
  ERA_LOG("ERa", "SMS to %s: %s", to, message);
  return true;
}

void updateFan() {
  const bool shouldRun = gasAlarm || manualFan;
  digitalWrite(FAN_ON_PIN, shouldRun ? HIGH : LOW);
  digitalWrite(FAN_OFF_PIN, LOW);
  fanOn = shouldRun;
}

void readSensors() {
  flameDetected = digitalRead(FLAME_DO_PIN) == LOW;
  gasAlarm = digitalRead(MQ2_DO_PIN) == LOW;
  if (MQ2_AO_CONNECTED) gasRaw = analogRead(MQ2_AO_PIN);
  updateFan();

  const bool alert = flameDetected || gasAlarm;
  digitalWrite(BUZZER_PIN, alert ? !digitalRead(BUZZER_PIN) : HIGH);
  digitalWrite(ALARM_LED_PIN, alert ? !digitalRead(ALARM_LED_PIN) : LOW);
  digitalWrite(STATUS_LED_PIN, alert ? LOW : HIGH);
}

void readDht() {
  if (!DHT11_CONNECTED) return;
  const float humidity = dht.readHumidity();
  const float temperature = dht.readTemperature();
  if (!isnan(humidity) && humidity >= 0 && humidity <= 100) humidityPct = humidity;
  if (!isnan(temperature) && temperature >= -40 && temperature <= 80) temperatureC = temperature;
}

void sendEraTelemetry() {
  ERa.virtualWrite(V0, flameDetected ? 0 : 1); // Original active-low sensor convention.
  ERa.virtualWrite(V1, gasAlarm ? 0 : 1);
  ERa.virtualWrite(V2, fanOn ? 1 : 0);
  if (DHT11_CONNECTED && !isnan(temperatureC)) ERa.virtualWrite(V3, temperatureC);
  if (DHT11_CONNECTED && !isnan(humidityPct)) ERa.virtualWrite(V4, humidityPct);
  if (MQ2_AO_CONNECTED && gasRaw >= 0) ERa.virtualWrite(V5, gasRaw);
}

ERA_WRITE(V2) {
  manualFan = param.getInt() != 0;
  // The local sensor task applies the new command within 100 ms.
}

// Every Firebase request uses HTTPS with certificate validation.
int firebaseHttp(const String& url, const char* method, const String& body, String& response) {
  WiFiClientSecure client;
  client.setCACert(GTS_ROOT_CAS);
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

void pollFanCommand() {
  String response;
  const int status = firebaseHttp(firebasePath("commands/fanOn"), "GET", "", response);
  if (status != 200 || response == "null") return;
  JsonDocument value;
  if (deserializeJson(value, response) == DeserializationError::Ok && value.is<bool>()) {
    manualFan = value.as<bool>();
  }
}

void publishTelemetry() {
  JsonDocument data;
  data["flameDetected"] = flameDetected;
  data["gasAlarm"] = gasAlarm;
  data["fanOn"] = fanOn;
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
      pollFanCommand();
      publishTelemetry();
    }
    vTaskDelay(pdMS_TO_TICKS(2000));
  }
}

// Keep the local alarm responsive even while ERa.begin waits for Wi-Fi.
void sensorTask(void*) {
  unsigned long lastDhtSample = 0;
  unsigned long lastStatusLog = 0;
  for (;;) {
    readSensors();
    const unsigned long now = millis();
    if (now - lastStatusLog >= 5000) {
      lastStatusLog = now;
      Serial.printf("Monitor WiFi=%d time=%lld flame=%d gas=%d fan=%d\n",
                    static_cast<int>(WiFi.status()), static_cast<long long>(time(nullptr)),
                    flameDetected, gasAlarm, fanOn);
    }
    if (DHT11_CONNECTED && now - lastDhtSample >= 2500) {
      lastDhtSample = now;
      readDht();
    }
    vTaskDelay(pdMS_TO_TICKS(100));
  }
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
  digitalWrite(BUZZER_PIN, HIGH);
  digitalWrite(ALARM_LED_PIN, LOW);
  digitalWrite(STATUS_LED_PIN, HIGH);
  digitalWrite(FAN_ON_PIN, LOW);
  digitalWrite(FAN_OFF_PIN, LOW);
  if (DHT11_CONNECTED) dht.begin();

  xTaskCreatePinnedToCore(sensorTask, "sensors", 6144, nullptr, 2, nullptr, 0);

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
  ERa.begin(WIFI_SSID, WIFI_PASSWORD);
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  ERa.addInterval(1000L, sendEraTelemetry);
  xTaskCreatePinnedToCore(cloudTask, "firebase", 10240, nullptr, 1, nullptr, 0);
}

void loop() {
  ERa.run();
  delay(1);
}
