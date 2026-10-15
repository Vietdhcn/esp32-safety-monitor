import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../docs/dashboard-model.js';

const safe = now => model.normalizeTelemetry({ flameDetected: false, gasAlarm: false,
  fanOn: false, controlsVersion: 2, updatedAt: now });

test('automatic buzzer stays quiet without an alarm and stops after an alarm clears', () => {
  assert.equal(model.createDemoTelemetry({}, 100_000).buzzerOn, false);
  assert.equal(model.createDemoTelemetry({ flameDetected: true }, 101_000).buzzerOn, true);
  assert.equal(model.createDemoTelemetry({ flameDetected: false }, 102_000).buzzerOn, false);
  assert.equal(model.createDemoTelemetry({ buzzerMode: 'on' }, 103_000).buzzerOn, true);
});

test('speed control is available only when firmware reports PWM support', () => {
  const now = 100_000;
  assert.equal(model.canControl?.(safe(now), 'buzzerMode', now), true);
  assert.equal(model.canControl?.(safe(now), 'fanSpeedPct', now), false);
  assert.equal(model.canControl?.({ ...safe(now), fanSpeedSupported: true }, 'fanSpeedPct', now), true);
  assert.equal(model.canControl?.({ ...safe(now), controlsVersion: null }, 'buzzerMode', now), false);
  assert.equal(model.canControl?.(safe(now), 'unknown', now), false);
});

test('stale telemetry locks commands, but an alarm only locks its automatic output', () => {
  const now = 100_000;
  for (const key of ['fanOn', 'alarmLedMode', 'statusLedMode', 'buzzerMode']) {
    assert.equal(model.canControl?.(safe(now), key, now + 16_000), false);
  }
  const gas = { ...safe(now), gasAlarm: true, fanOn: true };
  assert.equal(model.canControl(gas, 'fanOn', now), false);
  assert.equal(model.canControl(gas, 'alarmLedMode', now), true);
  assert.equal(model.canControl(gas, 'statusLedMode', now), false);
  assert.equal(model.canControl(gas, 'buzzerMode', now), false);
  const flame = { ...safe(now), flameDetected: true };
  assert.equal(model.canControl(flame, 'fanOn', now), true);
  assert.equal(model.canControl(flame, 'statusLedMode', now), true);
  assert.equal(model.canControl(flame, 'alarmLedMode', now), false);
});

test('commands reject wrong modes and invalid PWM percentages', () => {
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

test('demo actuators honor PWM setting and gas forces full ventilation', () => {
  const reading = model.createDemoTelemetry({ manualFan: true, fanSpeedPct: 40,
    alarmLedMode: 'on', statusLedMode: 'off', buzzerMode: 'off' }, 100_000);
  assert.equal(reading.alarmLedOn, true);
  assert.equal(reading.statusLedOn, false);
  assert.equal(reading.buzzerOn, false);
  assert.equal(reading.fanSpeedPct, 40);
  assert.equal(reading.fanSpeedSupported, true);
  assert.equal(model.createDemoTelemetry({ manualFan: true, fanSpeedPct: 0 }, 100_000).fanOn, false);
  assert.equal(model.createDemoTelemetry({ manualFan: false, fanSpeedPct: 40 }, 100_000).fanSpeedPct, 40);
  const alarm = model.createDemoTelemetry({ gasAlarm: true,
    alarmLedMode: 'off', buzzerMode: 'off' }, 100_000);
  assert.equal(alarm.fanOn, true);
  assert.equal(alarm.fanSpeedPct, 100);
  assert.equal(alarm.alarmLedOn, false);
  assert.equal(alarm.statusLedOn, true);
  assert.equal(alarm.buzzerOn, true);
});

test('flame and gas indicators follow only their own sensor', () => {
  const now = 100_000;
  const flame = model.createDemoTelemetry({ flameDetected: true }, now);
  assert.equal(flame.alarmLedOn, true);
  assert.equal(flame.statusLedOn, false);
  assert.equal(flame.fanOn, false);
  const gas = model.createDemoTelemetry({ gasAlarm: true }, now);
  assert.equal(gas.alarmLedOn, false);
  assert.equal(gas.statusLedOn, true);
  assert.equal(gas.fanOn, true);
  const both = model.createDemoTelemetry({ gasAlarm: true, flameDetected: true }, now);
  assert.equal(both.alarmLedOn, true);
  assert.equal(both.statusLedOn, true);
});

test('manual fan can turn on then off without changing buzzer or indicator modes', () => {
  const now = 100_000;
  const on = model.createDemoTelemetry({ manualFan: true, buzzerMode: 'on', alarmLedMode: 'off' }, now);
  assert.equal(on.fanOn, true);
  assert.equal(model.canControl(on, 'fanOn', now), true);
  const off = model.createDemoTelemetry({ manualFan: false, buzzerMode: 'on', alarmLedMode: 'off' }, now);
  assert.equal(off.fanOn, false);
  assert.equal(off.buzzerOn, true);
  assert.equal(off.alarmLedOn, false);
});

test('temporary mute stops automatic outputs until expiry', () => {
  const now = 100_000;
  const alarm = { ...safe(now), gasAlarm: true };
  assert.equal(model.canControl?.({ ...alarm, muteUntil: now + 10_000 }, 'fanOn', now), false);
  assert.equal(model.canMute?.(alarm, now), true);
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
});
