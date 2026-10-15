import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../docs/dashboard-model.js';

const safe = now => model.normalizeTelemetry({ flameDetected: false, gasAlarm: false,
  fanOn: false, controlsVersion: 2, fanSpeedSupported: false, updatedAt: now });

test('automatic buzzer stays quiet without an alarm and stops after an alarm clears', () => {
  assert.equal(model.createDemoTelemetry({}, 100_000).buzzerOn, false);
  assert.equal(model.createDemoTelemetry({ flameDetected: true }, 101_000).buzzerOn, true);
  assert.equal(model.createDemoTelemetry({ flameDetected: false }, 102_000).buzzerOn, false);
  assert.equal(model.createDemoTelemetry({ buzzerMode: 'on' }, 103_000).buzzerOn, true);
});

test('old firmware cannot enable new controls and unsupported speed stays locked', () => {
  const now = 100_000;
  assert.equal(model.canControl?.(safe(now), 'buzzerMode', now), true);
  assert.equal(model.canControl?.(safe(now), 'fanSpeedPct', now), false);
  assert.equal(model.canControl?.({ ...safe(now), controlsVersion: null }, 'buzzerMode', now), false);
  assert.equal(model.canControl?.({ ...safe(now), fanSpeedSupported: true }, 'fanSpeedPct', now), true);
  assert.equal(model.canControl?.(safe(now), 'unknown', now), false);
});

test('alarm and stale telemetry lock every manual actuator command', () => {
  const now = 100_000;
  for (const key of ['fanOn', 'fanSpeedPct', 'alarmLedMode', 'statusLedMode', 'buzzerMode']) {
    assert.equal(model.canControl?.({ ...safe(now), fanSpeedSupported: true, gasAlarm: true }, key, now), false);
    assert.equal(model.canControl?.(safe(now), key, now + 16_000), false);
  }
});

test('commands reject wrong modes and unsafe speed values', () => {
  assert.equal(model.validCommand?.('buzzerMode', 'off'), true);
  assert.equal(model.validCommand?.('alarmLedMode', 'auto'), true);
  assert.equal(model.validCommand?.('statusLedMode', 'on'), true);
  assert.equal(model.validCommand?.('fanSpeedPct', 50), true);
  for (const value of [-1, 101, 3.5, '50', NaN]) assert.equal(model.validCommand?.('fanSpeedPct', value), false);
  assert.equal(model.validCommand?.('fanOn', 1), false);
  assert.equal(model.validCommand?.('buzzerMode', 'mute-forever'), false);
});

test('command success needs receipt of this command ID from ESP32', () => {
  const pending = { id: 'new-command', sentAt: 100_000 };
  assert.equal(model.commandProgress?.(pending, { appliedCommandId: 'old-command' }, 101_000), 'waiting');
  assert.equal(model.commandProgress?.(pending, { appliedCommandId: 'new-command' }, 101_000), 'applied');
  assert.equal(model.commandProgress?.(pending, {}, 121_000), 'timeout');
});

test('demo actuators honor manual modes, gas override and PWM capability', () => {
  const reading = model.createDemoTelemetry({ manualFan: true, fanSpeedPct: 40,
    alarmLedMode: 'on', statusLedMode: 'off', buzzerMode: 'off' }, 100_000);
  assert.equal(reading.alarmLedOn, true);
  assert.equal(reading.statusLedOn, false);
  assert.equal(reading.buzzerOn, false);
  assert.equal(reading.fanSpeedPct, 40);
  const alarm = model.createDemoTelemetry({ gasAlarm: true, fanSpeedPct: 20,
    alarmLedMode: 'off', buzzerMode: 'off' }, 100_000);
  assert.equal(alarm.fanSpeedPct, 100);
  assert.equal(alarm.alarmLedOn, true);
  assert.equal(alarm.buzzerOn, true);
});

test('temporary mute locks outputs until expiry; admin disable allows manual operation', () => {
  const now = 100_000;
  const alarm = { ...safe(now), gasAlarm: true, fanSpeedSupported: true };
  assert.equal(model.canControl?.({ ...alarm, alarmDisabled: true }, 'buzzerMode', now), true);
  assert.equal(model.canControl?.({ ...alarm, muteUntil: now + 10_000 }, 'fanOn', now), false);
  assert.equal(model.canMute?.(alarm, now), true);
  assert.equal(model.canMute?.({ ...alarm, alarmDisabled: true }, now), false);
  assert.equal(model.canMute?.({ ...alarm, muteUntil: now + 10_000 }, now), false);
  const muted = model.createDemoTelemetry({ gasAlarm: true, manualFan: true,
    muteUntil: now + 30_000 }, now);
  assert.equal(muted.fanOn, false);
  assert.equal(muted.alarmLedOn, false);
  assert.equal(muted.statusLedOn, false);
  assert.equal(muted.buzzerOn, false);
  const resumed = model.createDemoTelemetry({ gasAlarm: true, muteUntil: now + 30_000 }, now + 30_001);
  assert.equal(resumed.fanOn, true);
  assert.equal(resumed.buzzerOn, true);
  const disabled = model.createDemoTelemetry({ gasAlarm: true, alarmDisabled: true }, now);
  assert.equal(disabled.fanOn, false);
  assert.equal(disabled.buzzerOn, false);
});

test('Admin disable overrides an earlier temporary mute immediately', () => {
  const now = 100_000;
  const state = { ...safe(now), gasAlarm: true, alarmDisabled: true, muteUntil: now + 20_000 };
  assert.equal(model.canControl(state, 'fanOn', now), true);
  const demo = model.createDemoTelemetry({ gasAlarm: true, alarmDisabled: true,
    muteUntil: now + 20_000, manualFan: true }, now);
  assert.equal(demo.fanOn, true);
});
