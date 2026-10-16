#pragma once

#include "secrets.h"

#include <Arduino.h>
#include <DHT.h>
#include <math.h>

// Các chân đọc cảm biến; hai ngõ DO báo động ở mức LOW.
constexpr uint8_t FLAME_SENSOR_PIN = 16;  // DO cảm biến lửa.
constexpr uint8_t GAS_SENSOR_PIN = 17;    // DO cảm biến khí MQ-2.
constexpr uint8_t DHT_PIN = 27;           // DATA cảm biến DHT11.

struct DigitalSensors {
  bool flame;
  bool gas;
};

struct DhtMeasurement {
  bool valid;
  float temperatureC;
  float humidityPercent;
};

// Chỉ đọc và kiểm tra dữ liệu cảm biến; quyết định an toàn nằm trong SafetyLogic.
class Sensors {
 public:
  // Khởi tạo DHT11 chỉ khi phần cứng được bật trong secrets.h.
  void begin() {
    pinMode(FLAME_SENSOR_PIN, INPUT);
    pinMode(GAS_SENSOR_PIN, INPUT);
    if (DHT11_CONNECTED) dht_.begin();
  }

  // Đổi tín hiệu active-low thành true khi cảm biến phát hiện nguy hiểm.
  DigitalSensors readDigital() const {
    return {digitalRead(FLAME_SENSOR_PIN) == LOW, digitalRead(GAS_SENSOR_PIN) == LOW};
  }

  // DHT11 không đọc được sẽ trả valid=false và hai giá trị NAN.
  DhtMeasurement readDht() {
    if (!DHT11_CONNECTED) return {false, NAN, NAN};

    const float humidity = dht_.readHumidity();
    const float temperature = dht_.readTemperature();
    // Loại bỏ NAN và các giá trị nằm ngoài phạm vi vật lý hợp lệ.
    const bool valid = !isnan(humidity) && humidity >= 0 && humidity <= 100 &&
                       !isnan(temperature) && temperature >= -40 && temperature <= 80;
    // Chỉ ghi log khi trạng thái đọc DHT thay đổi để tránh tràn Serial Monitor.
    if (lastDhtStatus_ != static_cast<int8_t>(valid)) {
      if (valid) Serial.printf("DHT11 D27 ready: %.1f C, %.1f %%\n", temperature, humidity);
      else Serial.println("DHT11 D27: read failed; check power, DATA and GND");
      lastDhtStatus_ = valid;
    }
    return {valid, valid ? temperature : NAN, valid ? humidity : NAN};
  }

 private:
  DHT dht_{DHT_PIN, DHT11};
  int8_t lastDhtStatus_ = -1;
};
