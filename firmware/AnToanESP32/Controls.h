#pragma once

#include "SafetyLogic.h"

#include <Arduino.h>

constexpr uint8_t BUZZER_PIN = 13;    // Coi bat o muc LOW.
constexpr uint8_t RED_LED_PIN = 22;
constexpr uint8_t GREEN_LED_PIN = 23;
constexpr uint8_t FAN_IN1_PIN = 32;  // L9110S A-IA.
constexpr uint8_t FAN_IN2_PIN = 33;  // L9110S A-IB, luon LOW.

class Controls {
 public:
  void begin() {
    pinMode(BUZZER_PIN, OUTPUT);
    pinMode(RED_LED_PIN, OUTPUT);
    pinMode(GREEN_LED_PIN, OUTPUT);
    pinMode(FAN_IN1_PIN, OUTPUT);
    pinMode(FAN_IN2_PIN, OUTPUT);
    setBuzzer(false);
    setBicolorLed(false, false);
    setFan(false);
  }

  void apply(const SafetyOutputs& outputs) {
    setFan(outputs.fan);
    setBicolorLed(outputs.redLed, outputs.greenLed);
    setBuzzer(outputs.buzzer);
  }

 private:
  static void setBuzzer(bool on) {
    digitalWrite(BUZZER_PIN, on ? LOW : HIGH);
  }

  static void setFan(bool on) {
    digitalWrite(FAN_IN2_PIN, LOW);
    digitalWrite(FAN_IN1_PIN, on ? HIGH : LOW);
  }

  // Tat mau cu truoc de hai mau khong bao gio sang cung luc.
  static void setBicolorLed(bool red, bool green) {
    if (red) {
      digitalWrite(GREEN_LED_PIN, LOW);
      digitalWrite(RED_LED_PIN, HIGH);
    } else {
      digitalWrite(RED_LED_PIN, LOW);
      digitalWrite(GREEN_LED_PIN, green ? HIGH : LOW);
    }
  }
};
