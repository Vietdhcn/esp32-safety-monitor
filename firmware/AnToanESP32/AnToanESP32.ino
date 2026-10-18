#include "secrets.h"
#include "Controls.h"
#include "DhtSample.h"
#include "SafetyLogic.h"
#include "Sensors.h"
#include "TelemetryTiming.h"
#include "WifiCredentials.h"

#include <Arduino.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <esp_system.h>
#include <esp_task_wdt.h>
#include <sys/time.h>
#include <time.h>

// ===== Chu ky, don vi ms =====
constexpr uint64_t MUTE_DURATION_MS = 30000ULL;
constexpr unsigned long SENSOR_INTERVAL_MS = 20;
constexpr unsigned long DHT_INTERVAL_MS = 2500;
constexpr unsigned long LOG_INTERVAL_MS = 5000;
constexpr int FIRMWARE_LOGIC_VERSION = 4;  // Uu tien bao lua hon quạt va thong gio them 3 giay.

Sensors sensors;
Controls controls;

struct ControlCommand {
  bool fanOn = false;
  int redLedMode = MODE_AUTO;
  int greenLedMode = MODE_AUTO;
  int buzzerMode = MODE_AUTO;
  uint64_t muteRequestedAt = 0;
  char commandId[65] = "";
};

// Trang thai thiet bi gui len Firebase.
struct DeviceState {
  bool flame = false;
  bool gas = false;
  bool fanOn = false;
  bool redLedOn = false;
  bool greenLedOn = false;
  bool buzzerOn = false;
  int redLedMode = MODE_AUTO;
  int greenLedMode = MODE_AUTO;
  int buzzerMode = MODE_AUTO;
  uint64_t muteUntil = 0;
  const char* fanReason = "off";
  bool gasWarmup = true;
  bool flameNoise = false;
  uint32_t flameGlitches = 0;
  uint32_t alarmEdgeAtMs = 0;  // Thoi diem DO bat dau doi; chi dung de do tre, khong gui len Firebase.
  char commandId[65] = "";
};

// Chi cac thay doi nay moi can gui telemetry ngay; bo dem xung nhieu gui theo chu ky.
bool sameTelemetry(const DeviceState& a, const DeviceState& b) {
  return a.flame == b.flame && a.gas == b.gas && a.fanOn == b.fanOn && a.redLedOn == b.redLedOn &&
         a.greenLedOn == b.greenLedOn && a.buzzerOn == b.buzzerOn && a.redLedMode == b.redLedMode &&
         a.greenLedMode == b.greenLedMode && a.buzzerMode == b.buzzerMode && a.muteUntil == b.muteUntil &&
         strcmp(a.fanReason, b.fanReason) == 0 && a.gasWarmup == b.gasWarmup &&
         a.flameNoise == b.flameNoise && strcmp(a.commandId, b.commandId) == 0;
}

// Du lieu dung chung giua cac task, luon doc/ghi trong stateLock.
portMUX_TYPE stateLock = portMUX_INITIALIZER_UNLOCKED;
ControlCommand controlCommand;
DeviceState deviceState;
uint32_t dataVersion = 0;
float temperatureC = NAN;
float humidityPercent = NAN;
TaskHandle_t firebaseTaskHandle = nullptr;
const char* resetReason = "other";
char activeWifiSsid[33] = WIFI_SSID;
char activeWifiPassword[65] = WIFI_PASSWORD;
constexpr size_t MAX_WIFI_NETWORKS = 8;
struct WifiProfile {
  char ssid[33] = "";
  char password[65] = "";
};
WifiProfile wifiProfiles[MAX_WIFI_NETWORKS];
size_t wifiProfileCount = 0;
uint8_t failedWifiBssid[6] = {};
bool hasFailedWifiBssid = false;
char wifiChangeId[65] = "";
char wifiChangeStatus[16] = "";
bool wifiSwitchInProgress = false;
String lastWifiRequestId;

void setActiveWifi(const char* ssid, const char* password) {
  portENTER_CRITICAL(&stateLock);
  const bool changed = strcmp(activeWifiSsid, ssid) != 0;
  strlcpy(activeWifiSsid, ssid, sizeof(activeWifiSsid));
  strlcpy(activeWifiPassword, password, sizeof(activeWifiPassword));
  if (changed) ++dataVersion;
  portEXIT_CRITICAL(&stateLock);
  if (changed) notifyFirebaseTask();
}

void addLoadedWifi(const char* ssid, const char* password) {
  if (!wifiCredentialsValid(ssid, password)) return;
  size_t index = 0;
  while (index < wifiProfileCount && strcmp(wifiProfiles[index].ssid, ssid) != 0) ++index;
  if (index == wifiProfileCount) {
    if (wifiProfileCount == MAX_WIFI_NETWORKS) return;
    ++wifiProfileCount;
  }
  strlcpy(wifiProfiles[index].ssid, ssid, sizeof(wifiProfiles[index].ssid));
  strlcpy(wifiProfiles[index].password, password, sizeof(wifiProfiles[index].password));
}

void loadSavedWifi() {
  addLoadedWifi(WIFI_SSID, WIFI_PASSWORD);
  Preferences preferences;
  if (!preferences.begin("safety-wifi", true)) return;
  lastWifiRequestId = preferences.getString("last-wifi-id", "");
  const String networks = preferences.getString("networks", "");
  const String saved = preferences.getString("credentials", "");
  preferences.end();
  JsonDocument list;
  if (deserializeJson(list, networks) == DeserializationError::Ok && list.is<JsonArray>()) {
    wifiProfileCount = 0;
    for (JsonObjectConst profile : list.as<JsonArrayConst>()) {
      addLoadedWifi(profile["ssid"] | "", profile["password"] | "");
    }
    if (wifiProfileCount > 0) {
      setActiveWifi(wifiProfiles[wifiProfileCount - 1].ssid, wifiProfiles[wifiProfileCount - 1].password);
      Serial.printf("Loaded %u saved WiFi networks\n", static_cast<unsigned>(wifiProfileCount));
      return;
    }
    addLoadedWifi(WIFI_SSID, WIFI_PASSWORD);
  }
  JsonDocument credentials;
  if (deserializeJson(credentials, saved) != DeserializationError::Ok) return;
  const char* ssid = credentials["ssid"] | "";
  const char* password = credentials["password"] | "";
  if (!wifiCredentialsValid(ssid, password)) return;
  addLoadedWifi(ssid, password);
  setActiveWifi(ssid, password);
  Serial.printf("Migrated %u WiFi networks\n", static_cast<unsigned>(wifiProfileCount));
}

bool saveWifi(const char* ssid, const char* password) {
  WifiProfile updated[MAX_WIFI_NETWORKS];
  size_t count = 0;
  // The newest network goes last. When full, keep the seven most recent others.
  for (size_t index = 0; index < wifiProfileCount; ++index) {
    if (strcmp(wifiProfiles[index].ssid, ssid) == 0) continue;
    if (count == MAX_WIFI_NETWORKS - 1) {
      memmove(updated, updated + 1, sizeof(WifiProfile) * (MAX_WIFI_NETWORKS - 2));
      --count;
    }
    updated[count++] = wifiProfiles[index];
  }
  strlcpy(updated[count].ssid, ssid, sizeof(updated[count].ssid));
  strlcpy(updated[count].password, password, sizeof(updated[count].password));
  ++count;
  JsonDocument credentials;
  JsonArray list = credentials.to<JsonArray>();
  for (size_t index = 0; index < count; ++index) {
    JsonObject profile = list.add<JsonObject>();
    profile["ssid"] = updated[index].ssid;
    profile["password"] = updated[index].password;
  }
  String saved;
  serializeJson(credentials, saved);
  Preferences preferences;
  if (!preferences.begin("safety-wifi", false)) return false;
  const bool stored = preferences.putString("networks", saved) == saved.length();
  preferences.end();
  if (stored) {
    portENTER_CRITICAL(&stateLock);
    memcpy(wifiProfiles, updated, sizeof(WifiProfile) * count);
    wifiProfileCount = count;
    ++dataVersion;
    portEXIT_CRITICAL(&stateLock);
    notifyFirebaseTask();
  }
  return stored;
}

void rememberWifiRequest(const char* requestId) {
  Preferences preferences;
  if (!preferences.begin("safety-wifi", false)) return;
  preferences.putString("last-wifi-id", requestId);
  preferences.end();
}

void setWifiChange(const char* requestId, const char* status, bool inProgress) {
  portENTER_CRITICAL(&stateLock);
  strlcpy(wifiChangeId, requestId, sizeof(wifiChangeId));
  strlcpy(wifiChangeStatus, status, sizeof(wifiChangeStatus));
  wifiSwitchInProgress = inProgress;
  ++dataVersion;
  portEXIT_CRITICAL(&stateLock);
  notifyFirebaseTask();
}

bool changingWifi() {
  portENTER_CRITICAL(&stateLock);
  const bool changing = wifiSwitchInProgress;
  portEXIT_CRITICAL(&stateLock);
  return changing;
}

void notifyFirebaseTask() {
  if (firebaseTaskHandle) xTaskNotifyGive(firebaseTaskHandle);
}

const char* resetReasonName(esp_reset_reason_t reason) {
  switch (reason) {
    case ESP_RST_POWERON: return "power-on";
    case ESP_RST_BROWNOUT: return "brownout";   // Sut ap nguon, thuong gap khi cap tu cong USB may tinh.
    case ESP_RST_PANIC: return "panic";
    case ESP_RST_INT_WDT:
    case ESP_RST_TASK_WDT:
    case ESP_RST_WDT: return "watchdog";
    case ESP_RST_SW: return "software";
    case ESP_RST_EXT: return "external";
    default: return "other";
  }
}

// ===== Task an toan: noi cam bien, logic va dau ra =====

// Thoi gian Unix (ms) cho lenh tat tieng coi.
uint64_t getEpochMs() {
  timeval current;
  gettimeofday(&current, nullptr);
  return static_cast<uint64_t>(current.tv_sec) * 1000ULL + current.tv_usec / 1000;
}

void updateDhtTelemetry() {
  if (!DHT11_CONNECTED) return;
  const DhtMeasurement sample = sensors.readDht();
  bool changed;
  portENTER_CRITICAL(&stateLock);
  changed = dhtSampleChanged(!isnan(temperatureC), temperatureC, humidityPercent,
                             sample.valid, sample.temperatureC, sample.humidityPercent);
  temperatureC = sample.temperatureC;
  humidityPercent = sample.humidityPercent;
  if (changed) ++dataVersion;
  portEXIT_CRITICAL(&stateLock);
  if (changed) notifyFirebaseTask();
}

// Task an toan: chay tren core 1, tach khoi Wi-Fi/TLS o core 0, co watchdog.
void sensorTask(void*) {
  const esp_err_t watchdog = esp_task_wdt_add(nullptr);
  Serial.printf("Sensor task on core %d, watchdog=%s\n", xPortGetCoreID(), watchdog == ESP_OK ? "on" : "off");

  DebouncedInput flameInput;
  DebouncedInput gasInput;
  bool fanWasOn = false;
  bool fanEverChanged = false;
  bool fanEverStopped = false;
  uint32_t fanChangedAt = 0;
  uint32_t fanStoppedAt = 0;
  PurgeTimer purge;
  bool fanBlocked = false;
  char blockedCommandId[65] = "";
  bool flameStartedWithFan = false;
  bool noiseActive = false;
  uint32_t noiseUntil = 0;
  uint32_t seenGlitches = 0;
  uint32_t lastAlarmEdgeAtMs = 0;
  unsigned long lastDhtReadAt = 0;
  unsigned long lastLogAt = 0;

  for (;;) {
    if (watchdog == ESP_OK) esp_task_wdt_reset();
    const uint32_t nowMs = millis();

    // 1. Doc tin hieu tho va lenh moi nhat.
    const DigitalSensors raw = sensors.readDigital();
    const bool rawFlame = raw.flame;
    const bool rawGas = raw.gas;
    ControlCommand command;
    portENTER_CRITICAL(&stateLock);
    command = controlCommand;
    portEXIT_CRITICAL(&stateLock);

    // 2. Loc nhieu. Khi quat dang chay hoac vua bat/tat, nguon 5V dao dong nen can xac nhan lau hon.
    const bool fanNoiseWindow = fanWasOn || (fanEverChanged && nowMs - fanChangedAt < FAN_SWITCH_GUARD_MS);
    const bool flameChanged = flameInput.update(rawFlame, nowMs,
        fanNoiseWindow ? FLAME_CONFIRM_FAN_MS : FLAME_CONFIRM_MS, FLAME_RELEASE_MS);
    const bool gasChanged = gasInput.update(rawGas, nowMs, GAS_CONFIRM_MS, GAS_RELEASE_MS);
    const bool flame = flameInput.state;
    const bool gas = gasInput.state;
    if (flameChanged || gasChanged)
      lastAlarmEdgeAtMs = gasChanged ? gasInput.candidateSince : flameInput.candidateSince;

    // 3. Thong gio them sau khi het gas; dung ngay neu co lua.
    purge.update(gasChanged && !gas, gas, flame, nowMs);

    // 4. Quat tay bi dung khi bao lua, cho den khi nguoi dung gui lenh moi.
    if (fanBlocked && strcmp(command.commandId, blockedCommandId) != 0) fanBlocked = false;
    if (flame && command.fanOn && !fanBlocked) {
      fanBlocked = true;
      strlcpy(blockedCommandId, command.commandId, sizeof(blockedCommandId));
    }

    // 5. Nhan biet bao lua gia do nhieu nguon khi quat chay (khong tat canh bao, chi goi y tren web).
    if (flameChanged && flame) flameStartedWithFan = fanNoiseWindow;
    if (flameChanged && !flame && flameStartedWithFan && fanEverStopped &&
        nowMs - fanStoppedAt <= NOISE_AFTER_STOP_MS + FLAME_RELEASE_MS) {
      noiseActive = true;
      noiseUntil = nowMs + NOISE_HINT_MS;
      Serial.println("Flame alarm cleared right after the fan stopped: likely 5V supply noise");
    }
    if (flameInput.glitches != seenGlitches) {
      seenGlitches = flameInput.glitches;
      if (fanNoiseWindow) {
        noiseActive = true;
        noiseUntil = nowMs + NOISE_HINT_MS;
      }
    }
    if (noiseActive && !beforeDeadline(nowMs, noiseUntil)) noiseActive = false;

    // 6. Tat tieng coi 30 giay (chi coi; den do va quat van hoat dong).
    const uint64_t epochMs = getEpochMs();
    const uint64_t muteUntil = command.muteRequestedAt > 0 ? command.muteRequestedAt + MUTE_DURATION_MS : 0;
    const bool muted = epochMs > 1700000000000ULL &&
        command.muteRequestedAt <= epochMs + 5000ULL && epochMs < muteUntil;

    // 7. Quyet dinh va ghi dau ra.
    SafetyInputs inputs;
    inputs.flame = flame;
    inputs.gas = gas;
    inputs.buzzerMuted = muted;
    inputs.manualFan = command.fanOn;
    inputs.fanBlockedByFlame = fanBlocked;
    inputs.purging = purge.active;
    inputs.redLedMode = command.redLedMode;
    inputs.greenLedMode = command.greenLedMode;
    inputs.buzzerMode = command.buzzerMode;
    const SafetyOutputs outputs = decideOutputs(inputs);
    controls.apply(outputs);

    if (outputs.fan != fanWasOn) {
      fanEverChanged = true;
      fanChangedAt = nowMs;
      if (!outputs.fan) {
        fanEverStopped = true;
        fanStoppedAt = nowMs;
      }
      fanWasOn = outputs.fan;
    }

    // 8. Cap nhat trang thai chung cho task Firebase.
    DeviceState next;
    next.flame = flame;
    next.gas = gas;
    next.fanOn = outputs.fan;
    next.redLedOn = outputs.redLed;
    next.greenLedOn = outputs.greenLed;
    next.buzzerOn = outputs.buzzer;
    next.redLedMode = command.redLedMode;
    next.greenLedMode = command.greenLedMode;
    next.buzzerMode = command.buzzerMode;
    next.muteUntil = muted ? muteUntil : 0;
    next.fanReason = fanReason(inputs, outputs);
    next.gasWarmup = nowMs < GAS_WARMUP_MS;
    next.flameNoise = noiseActive;
    next.flameGlitches = flameInput.glitches;
    next.alarmEdgeAtMs = lastAlarmEdgeAtMs;
    strlcpy(next.commandId, command.commandId, sizeof(next.commandId));

    bool changed;
    portENTER_CRITICAL(&stateLock);
    changed = !sameTelemetry(deviceState, next);
    deviceState = next;
    if (changed) ++dataVersion;
    portEXIT_CRITICAL(&stateLock);
    if (changed) notifyFirebaseTask();

    if (flameChanged || gasChanged) {
      Serial.printf("Alarm changed: flame=%d gas=%d fan=%d (%s) glitches=%lu\n", flame, gas,
                    outputs.fan, next.fanReason, static_cast<unsigned long>(flameInput.glitches));
    }
    if (nowMs - lastLogAt >= LOG_INTERVAL_MS) {
      lastLogAt = nowMs;
      Serial.printf("Monitor WiFi=%d rawFlame=%d rawGas=%d flame=%d gas=%d fan=%d buzzer=%d noise=%d heap=%u\n",
                    static_cast<int>(WiFi.status()), rawFlame, rawGas, flame, gas, outputs.fan,
                    outputs.buzzer, noiseActive, ESP.getFreeHeap());
    }
    if (DHT11_CONNECTED && nowMs - lastDhtReadAt >= DHT_INTERVAL_MS) {
      lastDhtReadAt = nowMs;
      updateDhtTelemetry();
    }
    vTaskDelay(pdMS_TO_TICKS(SENSOR_INTERVAL_MS));
  }
}

// ===== Wi-Fi, lenh va telemetry Firebase =====

constexpr char DEVICE_ID[] = "esp32s-30p-01";
String firebaseToken;
unsigned long lastSignInAt = 0;
SemaphoreHandle_t commandMutex = nullptr;  // Hai task cung co the ap dung lenh.
String lastCommandId;
bool commandsInitialized = false;
struct WifiRequest {
  char requestId[65] = "";
  char ssid[33] = "";
  char password[65] = "";
};
WifiRequest pendingWifi;
bool wifiRequestPending = false;
bool wifiCleanupPending = false;
uint32_t lastWifiCleanupAt = 0;
char commandStreamToken[2048] = "";
uint32_t commandStreamGeneration = 0;
portMUX_TYPE commandStreamTokenLock = portMUX_INITIALIZER_UNLOCKED;

void connectWifi() {
  WifiProfile known[MAX_WIFI_NETWORKS];
  size_t knownCount;
  portENTER_CRITICAL(&stateLock);
  knownCount = wifiProfileCount;
  memcpy(known, wifiProfiles, sizeof(WifiProfile) * knownCount);
  portEXIT_CRITICAL(&stateLock);
  static bool eventHandlerInstalled = false;
  if (!eventHandlerInstalled) {
    WiFi.onEvent([](WiFiEvent_t event, WiFiEventInfo_t info) {
      if (event == ARDUINO_EVENT_WIFI_STA_DISCONNECTED) {
        Serial.printf("WiFi disconnect reason=%u\n", info.wifi_sta_disconnected.reason);
      }
    });
    eventHandlerInstalled = true;
  }
  // Dung lan ket noi dang chay truoc khi scan; neu khong scanNetworks tra -2.
  WiFi.setAutoReconnect(false);
  WiFi.disconnect(true, false);
  delay(250);
  WiFi.mode(WIFI_STA);
  const int networkCount = WiFi.scanNetworks(false, true);
  struct WifiNetwork { int32_t channel; int32_t rssi; uint8_t bssid[6]; uint8_t profileIndex; };
  WifiNetwork matchingNetworks[16];
  int matchCount = 0;
  for (int index = 0; index < networkCount; ++index) {
    for (size_t profile = 0; profile < knownCount; ++profile) {
      if (WiFi.SSID(index) != known[profile].ssid) continue;
      WifiNetwork candidate = { WiFi.channel(index), WiFi.RSSI(index), {}, static_cast<uint8_t>(profile) };
      memcpy(candidate.bssid, WiFi.BSSID(index), sizeof(candidate.bssid));
      int place = 0;
      while (place < matchCount && matchingNetworks[place].rssi >= candidate.rssi) ++place;
      if (place < 16) {
        if (matchCount < 16) ++matchCount;
        for (int move = matchCount - 1; move > place; --move) matchingNetworks[move] = matchingNetworks[move - 1];
        matchingNetworks[place] = candidate;
      }
      break;
    }
  }
  // An AP may keep Wi-Fi associated while its route to Firebase is broken.
  // Try every other visible saved AP before returning to that BSSID.
  if (hasFailedWifiBssid) {
    for (int index = 0; index < matchCount; ++index) {
      if (memcmp(matchingNetworks[index].bssid, failedWifiBssid, sizeof(failedWifiBssid)) != 0) continue;
      const WifiNetwork failed = matchingNetworks[index];
      for (int move = index; move < matchCount - 1; ++move) matchingNetworks[move] = matchingNetworks[move + 1];
      matchingNetworks[matchCount - 1] = failed;
      break;
    }
  }
  Serial.printf("WiFi scan count=%d targetCount=%d\n", networkCount, matchCount);
  WiFi.scanDelete();
  for (int index = 0; index < matchCount; ++index) {
    const WifiProfile& profile = known[matchingNetworks[index].profileIndex];
    WiFi.begin(profile.ssid, profile.password, matchingNetworks[index].channel, matchingNetworks[index].bssid);
    const unsigned long startedAt = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - startedAt < 6000) {
      delay(100);
    }
    const bool connected = WiFi.status() == WL_CONNECTED;
    Serial.printf("WiFi candidate SSID=%s channel=%d connected=%d\n",
                  profile.ssid, matchingNetworks[index].channel, connected);
    if (connected) {
      setActiveWifi(profile.ssid, profile.password);
      break;
    }
    WiFi.disconnect(false, false);
    delay(500);
  }
  if (WiFi.status() != WL_CONNECTED) WiFi.begin(activeWifiSsid, activeWifiPassword);
  WiFi.setAutoReconnect(true);
}

int parseMode(const char* value, int defaultMode) {
  if (strcmp(value, "auto") == 0) return MODE_AUTO;
  if (strcmp(value, "on") == 0) return MODE_ON;
  if (strcmp(value, "off") == 0) return MODE_OFF;
  return defaultMode;
}

const char* modeName(int value) {
  return value == MODE_ON ? "on" : value == MODE_OFF ? "off" : "auto";
}

// HTTPS co kiem tra chung chi. Ket noi toi Realtime Database duoc giu lai (keep-alive)
// de khong phai bat tay TLS moi 2 giay; ket noi dang nhap dung xong thi dong.
int firebaseRequest(const String& url, const char* method, const String& body, String& response,
                    bool keepAlive, WiFiClientSecure* dedicatedClient = nullptr) {
  static WiFiClientSecure authClient;
  static WiFiClientSecure databaseClient;
  static bool clientsReady = false;
  if (!clientsReady) {
    authClient.useBuiltinCACertBundle();
    databaseClient.useBuiltinCACertBundle();
    // HTTP timeout khong gioi han TLS handshake; mac dinh cua core la 120 giay.
    authClient.setHandshakeTimeout(6);
    databaseClient.setHandshakeTimeout(6);
    clientsReady = true;
  }
  WiFiClientSecure& client = dedicatedClient ? *dedicatedClient : (keepAlive ? databaseClient : authClient);
  const bool connectedBefore = client.connected();
  HTTPClient http;
  http.setReuse(keepAlive);
  if (!http.begin(client, url)) return -1;
  http.setConnectTimeout(4000);
  http.setTimeout(3500);
  if (strcmp(method, "GET") != 0) http.addHeader("Content-Type", "application/json");
  int status = -1;
  const uint32_t requestAt = millis();
  if (strcmp(method, "POST") == 0) status = http.POST(body);
  else if (strcmp(method, "PUT") == 0) status = http.PUT(body);
  else status = http.GET();
  const uint32_t headersAt = millis();
  // Firebase print=silent tra 204 khong co body; getString() co the cho dong socket ~75 giay.
  if (status > 0 && status != HTTP_CODE_NO_CONTENT) response = http.getString();
  const uint32_t bodyAt = millis();
  http.end();
  if (keepAlive) {
    Serial.printf("RTDB link before=%d after=%d headers=%lu body=%lu ms\n",
                  connectedBefore, client.connected(),
                  static_cast<unsigned long>(headersAt - requestAt),
                  static_cast<unsigned long>(bodyAt - headersAt));
  }
  if (!keepAlive || status <= 0) client.stop();  // Loi mang: lan sau mo ket noi moi.
  return status;
}

bool signInFirebase() {
  Serial.println("Firebase auth request starting");
  JsonDocument request;
  request["email"] = DEVICE_EMAIL;
  request["password"] = DEVICE_PASSWORD;
  request["returnSecureToken"] = true;
  String body;
  serializeJson(request, body);
  String response;
  const String url = String("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=") + FIREBASE_API_KEY;
  const int authStatus = firebaseRequest(url, "POST", body, response, false);
  if (authStatus != 200) {
    Serial.printf("Firebase auth HTTP %d\n", authStatus);
    return false;
  }
  JsonDocument result;
  if (deserializeJson(result, response) != DeserializationError::Ok) return false;
  const char* newToken = result["idToken"] | "";
  if (!newToken[0]) return false;
  Serial.println("Firebase auth OK");
  firebaseToken = newToken;
  lastSignInAt = millis();
  portENTER_CRITICAL(&commandStreamTokenLock);
  strlcpy(commandStreamToken, newToken, sizeof(commandStreamToken));
  ++commandStreamGeneration;
  portEXIT_CRITICAL(&commandStreamTokenLock);
  return true;
}

String databaseBaseUrl() {
  String baseUrl = FIREBASE_DATABASE_URL;
  while (baseUrl.endsWith("/")) baseUrl.remove(baseUrl.length() - 1);
  return baseUrl;
}

String firebasePath(const char* path) {
  return databaseBaseUrl() + "/devices/" + DEVICE_ID + "/" + path + ".json?auth=" + firebaseToken;
}

// Ap dung lenh tu web. Bo qua lenh cu con luu tren Firebase sau khi khoi dong.
void applyFirebaseCommand(JsonVariantConst value) {
  if (xSemaphoreTake(commandMutex, pdMS_TO_TICKS(1000)) != pdTRUE) return;
  if (value.isNull()) {
    commandsInitialized = true;
  } else if (value.is<JsonObjectConst>()) {
    const char* commandId = value["commandId"] | "";
    if (!commandsInitialized) {
      lastCommandId = commandId;
      commandsInitialized = true;
      Serial.println("Ignoring retained commands on startup");
    } else if (commandId[0] && lastCommandId != commandId) {
      lastCommandId = commandId;
      ControlCommand newCommand;
      portENTER_CRITICAL(&stateLock);
      newCommand = controlCommand;
      portEXIT_CRITICAL(&stateLock);
      if (value["fanOn"].is<bool>()) newCommand.fanOn = value["fanOn"].as<bool>();
      if (value["alarmLedMode"].is<const char*>()) newCommand.redLedMode = parseMode(value["alarmLedMode"], newCommand.redLedMode);
      if (value["statusLedMode"].is<const char*>()) newCommand.greenLedMode = parseMode(value["statusLedMode"], newCommand.greenLedMode);
      if (value["buzzerMode"].is<const char*>()) newCommand.buzzerMode = parseMode(value["buzzerMode"], newCommand.buzzerMode);
      if (value["muteRequestedAt"].is<uint64_t>()) newCommand.muteRequestedAt = value["muteRequestedAt"].as<uint64_t>();
      strlcpy(newCommand.commandId, commandId, sizeof(newCommand.commandId));
      portENTER_CRITICAL(&stateLock);
      controlCommand = newCommand;
      portEXIT_CRITICAL(&stateLock);
      Serial.printf("Command applied: %s\n", commandId);
    }
  }
  const JsonVariantConst wifi = value["wifi"];
  const char* wifiRequestId = wifi["requestId"] | "";
  if (wifiRequestId[0] && lastWifiRequestId != wifiRequestId) {
    lastWifiRequestId = wifiRequestId;
    const char* ssid = wifi["ssid"] | "";
    const char* password = wifi["password"] | "";
    if (strlen(wifiRequestId) <= 64 && wifiCredentialsValid(ssid, password)) {
      strlcpy(pendingWifi.requestId, wifiRequestId, sizeof(pendingWifi.requestId));
      strlcpy(pendingWifi.ssid, ssid, sizeof(pendingWifi.ssid));
      strlcpy(pendingWifi.password, password, sizeof(pendingWifi.password));
      wifiRequestPending = true;
      Serial.printf("WiFi change requested for SSID=%s\n", pendingWifi.ssid);
    } else {
      Serial.println("Rejected invalid WiFi change request");
    }
  } else if (wifiRequestId[0] && lastWifiRequestId == wifiRequestId) {
    wifiCleanupPending = true;
  }
  xSemaphoreGive(commandMutex);
}

void readFirebaseCommand(const char* token) {
  static WiFiClientSecure pollClient;
  static bool clientReady = false;
  if (!clientReady) {
    pollClient.useBuiltinCACertBundle();
    pollClient.setHandshakeTimeout(6);
    clientReady = true;
  }
  String response;
  const String url = databaseBaseUrl() + "/devices/" + DEVICE_ID + "/commands.json?auth=" + token;
  const uint32_t startedAt = millis();
  const int status = firebaseRequest(url, "GET", "", response, false, &pollClient);
  Serial.printf("Command fallback GET HTTP %d took %lu ms\n", status,
                static_cast<unsigned long>(millis() - startedAt));
  if (status != 200) {
    Serial.printf("Firebase commands HTTP %d\n", status);
    return;
  }
  JsonDocument value;
  if (deserializeJson(value, response) == DeserializationError::Ok) {
    applyFirebaseCommand(value.as<JsonVariantConst>());
  }
}

void clearWifiRequest(const char* token) {
  if (WiFi.status() != WL_CONNECTED ||
      !wifiCleanupDue(wifiCleanupPending, millis(), lastWifiCleanupAt)) return;
  lastWifiCleanupAt = millis();
  WiFiClientSecure cleanupClient;
  cleanupClient.useBuiltinCACertBundle();
  cleanupClient.setHandshakeTimeout(6);
  const String url = databaseBaseUrl() + "/devices/" + DEVICE_ID + "/commands/wifi.json?auth=" + token;
  HTTPClient get;
  if (!get.begin(cleanupClient, url)) return;
  get.setConnectTimeout(4000);
  get.setTimeout(3500);
  const char* etagHeader[] = {"ETag"};
  get.collectHeaders(etagHeader, 1);
  get.addHeader("X-Firebase-ETag", "true");
  const int readStatus = get.GET();
  const String etag = get.header("ETag");
  String response = readStatus == 200 ? get.getString() : "";
  get.end();
  cleanupClient.stop();
  if (readStatus != 200 || !etag.length()) {
    Serial.printf("WiFi request cleanup read HTTP %d\n", readStatus);
    return;
  }
  JsonDocument current;
  if (deserializeJson(current, response) != DeserializationError::Ok) return;
  if (current.isNull()) {
    wifiCleanupPending = false;
    return;
  }
  const char* cloudId = current["requestId"] | "";
  if (!wifiCleanupMatches(cloudId, lastWifiRequestId.c_str())) {
    wifiCleanupPending = false;  // A newer request must be handled by the next stream session.
    return;
  }
  HTTPClient put;
  // Firebase rejects conditional requests combined with print=silent.
  if (!put.begin(cleanupClient, url)) return;
  put.setConnectTimeout(4000);
  put.setTimeout(3500);
  put.addHeader("Content-Type", "application/json");
  put.addHeader("if-match", etag);
  const int deleteStatus = put.PUT("null");
  put.end();
  cleanupClient.stop();
  wifiCleanupPending = deleteStatus != 200 && deleteStatus != 412;
  if (wifiCleanupPending) Serial.printf("WiFi request cleanup write HTTP %d\n", deleteStatus);
}

void applyPendingWifiChange(const char* token) {
  if (!wifiRequestPending) return;
  WifiRequest request = pendingWifi;
  wifiRequestPending = false;
  setWifiChange(request.requestId, "connecting", true);
  WiFi.setAutoReconnect(false);
  WiFi.disconnect(false, false);
  vTaskDelay(pdMS_TO_TICKS(200));
  WiFi.begin(request.ssid, request.password);
  const uint32_t startedAt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startedAt < 15000) {
    vTaskDelay(pdMS_TO_TICKS(100));
  }

  bool verified = false;
  if (WiFi.status() == WL_CONNECTED) {
    WiFiClientSecure verifyClient;
    verifyClient.useBuiltinCACertBundle();
    verifyClient.setHandshakeTimeout(6);
    String response;
    const String url = databaseBaseUrl() + "/devices/" + DEVICE_ID + "/telemetry.json?auth=" + token + "&shallow=true";
    verified = firebaseRequest(url, "GET", "", response, false, &verifyClient) == 200;
  }

  if (verified && saveWifi(request.ssid, request.password)) {
    setActiveWifi(request.ssid, request.password);
    WiFi.setAutoReconnect(true);
    Serial.printf("WiFi network saved for SSID=%s (total=%u)\n", request.ssid,
                  static_cast<unsigned>(wifiProfileCount));
    setWifiChange(request.requestId, "applied", false);
  } else {
    Serial.println("WiFi change failed; trying saved networks");
    connectWifi();
    setWifiChange(request.requestId, "failed", false);
  }
  rememberWifiRequest(request.requestId);
  wifiCleanupPending = true;
  lastWifiCleanupAt = 0;
  memset(request.password, 0, sizeof(request.password));
  memset(pendingWifi.password, 0, sizeof(pendingWifi.password));
}

// Luong su kien (Server-Sent Events) de nhan lenh gan nhu tuc thi.
void commandStreamTask(void*) {
  char token[sizeof(commandStreamToken)];
  for (;;) {
    uint32_t generation;
    portENTER_CRITICAL(&commandStreamTokenLock);
    strlcpy(token, commandStreamToken, sizeof(token));
    generation = commandStreamGeneration;
    portEXIT_CRITICAL(&commandStreamTokenLock);
    if (WiFi.status() != WL_CONNECTED || !token[0]) {
      vTaskDelay(pdMS_TO_TICKS(500));
      continue;
    }

    const String url = databaseBaseUrl() + "/devices/" + DEVICE_ID + "/commands.json?auth=" + token;
    WiFiClientSecure streamClient;
    streamClient.useBuiltinCACertBundle();
    streamClient.setHandshakeTimeout(6);
    HTTPClient streamHttp;
    if (!streamHttp.begin(streamClient, url)) {
      streamClient.stop();
      readFirebaseCommand(token);
      applyPendingWifiChange(token);
      clearWifiRequest(token);
      vTaskDelay(pdMS_TO_TICKS(1000));
      continue;
    }
    streamHttp.addHeader("Accept", "text/event-stream");
    streamHttp.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
    streamHttp.setConnectTimeout(4000);
    streamHttp.setTimeout(4000);
    const int status = streamHttp.GET();
    if (status == 200) {
      Serial.println("Firebase command stream connected");
      JsonDocument commandCache;
      String eventName;
      String eventData;
      unsigned long lastEventAt = millis();
      NetworkClient* stream = streamHttp.getStreamPtr();
      while (WiFi.status() == WL_CONNECTED && streamHttp.connected()) {
        uint32_t latestGeneration;
        portENTER_CRITICAL(&commandStreamTokenLock);
        latestGeneration = commandStreamGeneration;
        portEXIT_CRITICAL(&commandStreamTokenLock);
        if (latestGeneration != generation || millis() - lastEventAt > 45000 ||
            wifiCleanupDue(wifiCleanupPending, millis(), lastWifiCleanupAt)) break;
        if (!stream->available()) {
          vTaskDelay(pdMS_TO_TICKS(10));
          continue;
        }
        String line = stream->readStringUntil('\n');
        line.trim();
        lastEventAt = millis();
        if (line.startsWith("event:")) {
          eventName = line.substring(6);
          eventName.trim();
        } else if (line.startsWith("data:")) {
          eventData = line.substring(5);
          eventData.trim();
        } else if (line.length() == 0 && eventName.length()) {
          if (eventName == "auth_revoked" || eventName == "cancel") break;
          if (eventName == "put" || eventName == "patch") {
            JsonDocument event;
            if (deserializeJson(event, eventData) == DeserializationError::Ok) {
              const char* path = event["path"] | "/";
              JsonVariantConst data = event["data"].as<JsonVariantConst>();
              if (strcmp(path, "/") == 0) {
                if (eventName == "put") commandCache.set(data);
                else if (data.is<JsonObjectConst>()) {
                  for (JsonPairConst entry : data.as<JsonObjectConst>()) {
                    commandCache[entry.key()].set(entry.value());
                  }
                }
              } else if (path[0] == '/' && strchr(path + 1, '/') == nullptr) {
                commandCache[path + 1].set(data);
              }
              applyFirebaseCommand(commandCache.as<JsonVariantConst>());
              if (wifiRequestPending || wifiCleanupDue(wifiCleanupPending, millis(), lastWifiCleanupAt)) break;
            }
          }
          eventName = "";
          eventData = "";
        }
      }
    } else {
      Serial.printf("Firebase command stream HTTP %d\n", status);
    }
    streamHttp.end();
    streamClient.stop();
    if (!wifiRequestPending && !wifiCleanupDue(wifiCleanupPending, millis(), lastWifiCleanupAt) &&
        WiFi.status() == WL_CONNECTED) readFirebaseCommand(token);
    applyPendingWifiChange(token);
    clearWifiRequest(token);
    vTaskDelay(pdMS_TO_TICKS(1000));
  }
}

int sendFirebaseData(const DeviceState& current) {
  JsonDocument data;
  char hardwareId[13];
  snprintf(hardwareId, sizeof(hardwareId), "%012llX",
           static_cast<unsigned long long>(ESP.getEfuseMac()));
  data["hardwareId"] = hardwareId;
  data["flameDetected"] = current.flame;
  data["gasAlarm"] = current.gas;
  data["fanOn"] = current.fanOn;
  data["fanReason"] = current.fanReason;
  data["alarmLedOn"] = current.redLedOn;
  data["statusLedOn"] = current.greenLedOn;
  data["buzzerOn"] = current.buzzerOn;
  data["alarmLedMode"] = modeName(current.redLedMode);
  data["statusLedMode"] = modeName(current.greenLedMode);
  data["buzzerMode"] = modeName(current.buzzerMode);
  data["controlsVersion"] = 2;
  data["wifiConfigVersion"] = 2;
  data["logicVersion"] = FIRMWARE_LOGIC_VERSION;
  data["muteUntil"] = current.muteUntil;
  data["gasWarmup"] = current.gasWarmup;
  data["flameNoise"] = current.flameNoise;
  data["flameGlitches"] = current.flameGlitches;
  data["resetReason"] = resetReason;
  data["uptimeS"] = millis() / 1000;
  data["appliedCommandId"] = current.commandId;
  char reportedSsid[sizeof(activeWifiSsid)];
  char reportedWifiChangeId[sizeof(wifiChangeId)];
  char reportedWifiChangeStatus[sizeof(wifiChangeStatus)];
  char reportedSavedSsids[MAX_WIFI_NETWORKS][33];
  size_t reportedNetworkCount;
  portENTER_CRITICAL(&stateLock);
  strlcpy(reportedSsid, activeWifiSsid, sizeof(reportedSsid));
  strlcpy(reportedWifiChangeId, wifiChangeId, sizeof(reportedWifiChangeId));
  strlcpy(reportedWifiChangeStatus, wifiChangeStatus, sizeof(reportedWifiChangeStatus));
  reportedNetworkCount = wifiProfileCount;
  for (size_t index = 0; index < reportedNetworkCount; ++index) {
    strlcpy(reportedSavedSsids[index], wifiProfiles[index].ssid, sizeof(reportedSavedSsids[index]));
  }
  portEXIT_CRITICAL(&stateLock);
  data["wifiSsid"] = reportedSsid;
  JsonArray savedSsids = data["wifiSavedSsids"].to<JsonArray>();
  for (size_t index = 0; index < reportedNetworkCount; ++index) savedSsids.add(reportedSavedSsids[index]);
  data["wifiChangeId"] = reportedWifiChangeId;
  if (reportedWifiChangeStatus[0]) data["wifiChangeStatus"] = reportedWifiChangeStatus;
  float currentTemperature;
  float currentHumidity;
  portENTER_CRITICAL(&stateLock);
  currentTemperature = temperatureC;
  currentHumidity = humidityPercent;
  portEXIT_CRITICAL(&stateLock);
  if (DHT11_CONNECTED && !isnan(currentTemperature) && !isnan(currentHumidity)) {
    data["temperatureC"] = currentTemperature;
    data["humidityPct"] = currentHumidity;
  }
  data["updatedAt"][".sv"] = "timestamp";
  String body;
  serializeJson(data, body);
  String response;
  const uint32_t startedAt = millis();
  const int status = firebaseRequest(firebasePath("telemetry") + "&print=silent", "PUT", body, response, true);
  Serial.printf("Telemetry PUT HTTP %d took %lu ms\n", status,
                static_cast<unsigned long>(millis() - startedAt));
  if (status != 204) Serial.printf("Firebase telemetry HTTP %d\n", status);
  return status;
}

void firebaseTask(void*) {
  Serial.println("Firebase task started");
  uint32_t lastSentVersion = UINT32_MAX;
  unsigned long lastSendAt = 0;
  unsigned long lastSendTryAt = 0;
  bool lastSendFailed = false;
  unsigned long lastSignInTryAt = 0;
  unsigned long lastWifiRecoveryAt = 0;
  unsigned long lastWifiScanAt = millis();
  uint8_t consecutiveNetworkFailures = 0;
  uint32_t lastPublishedAlarmEdgeAtMs = 0;
  for (;;) {
    if (changingWifi()) {
      vTaskDelay(pdMS_TO_TICKS(100));
      continue;
    }
    if (WiFi.status() != WL_CONNECTED && millis() - lastWifiScanAt >= 30000) {
      lastWifiScanAt = millis();
      Serial.println("WiFi offline; scanning known SSID again");
      connectWifi();
    }
    if (WiFi.status() == WL_CONNECTED && time(nullptr) > 1700000000) {
      bool signedIn = firebaseToken.length() && millis() - lastSignInAt < 45UL * 60UL * 1000UL;
      if (!signedIn && (lastSignInTryAt == 0 || millis() - lastSignInTryAt >= 2000)) {
        lastSignInTryAt = millis();
        signedIn = signInFirebase();
      }
      if (signedIn) {
        const unsigned long nowMs = millis();
        uint32_t version;
        DeviceState current;
        portENTER_CRITICAL(&stateLock);
        version = dataVersion;
        current = deviceState;
        portEXIT_CRITICAL(&stateLock);
        const bool alarmChanged = current.alarmEdgeAtMs != 0 &&
            current.alarmEdgeAtMs != lastPublishedAlarmEdgeAtMs;
        if (telemetrySendDue(version, lastSentVersion, nowMs, lastSendAt,
                             lastSendFailed, lastSendTryAt, alarmChanged)) {
          lastSendTryAt = nowMs;
          const int telemetryStatus = sendFirebaseData(current);
          lastSendFailed = telemetryStatus != 204;
          if (telemetryStatus < 0 && !changingWifi()) {
            if (consecutiveNetworkFailures < 3) ++consecutiveNetworkFailures;
            if (consecutiveNetworkFailures >= 2 &&
                (lastWifiRecoveryAt == 0 || millis() - lastWifiRecoveryAt >= 15000)) {
              lastWifiRecoveryAt = millis();
              lastWifiScanAt = lastWifiRecoveryAt;
              consecutiveNetworkFailures = 0;
              Serial.printf("WiFi recovery after HTTPS failures; RSSI=%d dBm channel=%d\n",
                            WiFi.RSSI(), WiFi.channel());
              if (WiFi.status() == WL_CONNECTED && WiFi.BSSID(failedWifiBssid) != nullptr) {
                hasFailedWifiBssid = true;
              }
              connectWifi();
            }
          } else {
            consecutiveNetworkFailures = 0;
            if (telemetryStatus == 204) hasFailedWifiBssid = false;
          }
          if (!lastSendFailed) {
            lastSentVersion = version;
            lastSendAt = millis();
            if (current.alarmEdgeAtMs != 0 && current.alarmEdgeAtMs != lastPublishedAlarmEdgeAtMs) {
              lastPublishedAlarmEdgeAtMs = current.alarmEdgeAtMs;
              Serial.printf("Alarm cloud ack gas=%d flame=%d raw-to-ack=%lu ms\n",
                            current.gas, current.flame,
                            static_cast<unsigned long>(millis() - current.alarmEdgeAtMs));
            }
          }
        }
      }
    }
    ulTaskNotifyTake(pdTRUE, pdMS_TO_TICKS(100));
  }
}

void setup() {
  Serial.begin(115200);
  loadSavedWifi();
  resetReason = resetReasonName(esp_reset_reason());
  Serial.printf("Boot reason: %s\n", resetReason);
  if (strcmp(resetReason, "brownout") == 0) {
    Serial.println("Brownout: nguon 5V bi sut ap (thuong do cong USB may tinh khi quat chay)");
  }
  controls.begin();
  sensors.begin();
  commandMutex = xSemaphoreCreateMutex();

  // Core 1: task an toan (uu tien cao) + luong lenh. Core 0: Wi-Fi va gui telemetry.
  xTaskCreatePinnedToCore(sensorTask, "sensorTask", 6144, nullptr, 3, nullptr, 1);

  connectWifi();
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  const BaseType_t firebaseTaskCreated = xTaskCreatePinnedToCore(firebaseTask, "firebase", 10240, nullptr, 1, &firebaseTaskHandle, 0);
  Serial.printf("Firebase task created=%d freeHeap=%u\n", firebaseTaskCreated == pdPASS, ESP.getFreeHeap());
  const BaseType_t streamTaskCreated = xTaskCreatePinnedToCore(commandStreamTask, "commandStream", 12288, nullptr, 1, nullptr, 1);
  Serial.printf("Command stream task created=%d freeHeap=%u\n", streamTaskCreated == pdPASS, ESP.getFreeHeap());
}

void loop() {
  vTaskDelay(pdMS_TO_TICKS(1000));
}
