import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = name => readFile(new URL(`../firmware/AnToanESP32/${name}`, import.meta.url), 'utf8');

test('sensor and actuator GPIO stay outside the Firebase sketch', async () => {
  const sketch = await read('AnToanESP32.ino');
  assert.doesNotMatch(sketch, /\b(?:pinMode|digitalRead|digitalWrite)\s*\(/,
    'the sketch should orchestrate sensors and controls through their modules');
  const sensors = await read('Sensors.h');
  const controls = await read('Controls.h');
  assert.match(sensors, /digitalRead\s*\(/);
  assert.match(sensors, /readHumidity\s*\(/);
  assert.match(controls, /digitalWrite\s*\(/);
});

test('ESP32 switches fan fully on/off without PWM and never pulses the alarm buzzer', async () => {
  const source = await read('AnToanESP32.ino');
  const controls = await read('Controls.h');
  const logic = await read('SafetyLogic.h');
  assert.match(controls, /digitalWrite\s*\(\s*FAN_IN1_PIN\s*,\s*on\s*\?\s*HIGH\s*:\s*LOW\s*\)/);
  assert.doesNotMatch(source + controls + logic, /\b(?:ledcAttach|ledcWrite|fanSpeedPct)\b/);
  assert.doesNotMatch(source + controls + logic, /\b(?:analogWrite|tone)\s*\(/i);
  const buzzerDecision = logic.match(/out\.buzzer\s*=([^;]+);/)?.[1];
  assert.ok(buzzerDecision, 'alarm buzzer decision exists');
  assert.doesNotMatch(buzzerDecision, /millis\s*\(|\/\s*\d+|%/,
    'an active alarm must not repeatedly pulse the buzzer');
});

test('safety task runs on core 1 with a watchdog, and commands are serialized', async () => {
  const source = await read('AnToanESP32.ino');
  assert.match(source, /xTaskCreatePinnedToCore\(sensorTask,[^;]*,\s*1\);/);
  assert.match(source, /esp_task_wdt_add\(nullptr\)/);
  assert.match(source, /esp_task_wdt_reset\(\)/);
  assert.match(source, /xSemaphoreTake\(commandMutex/);
});

test('temporary mute only silences the buzzer', async () => {
  const logic = await read('SafetyLogic.h');
  assert.match(logic, /out\.buzzer\s*=\s*!in\.buzzerMuted/);
  assert.doesNotMatch(logic.match(/out\.fan\s*=([^;]+);/)[1], /Muted/);
  assert.doesNotMatch(logic.match(/out\.redLed\s*=([^;]+);/)[1], /Muted/);
});
