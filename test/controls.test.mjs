import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../docs/dashboard-model.js';

const safe = now => model.chuanHoaDuLieu({ flameDetected: false, gasAlarm: false,
  fanOn: false, controlsVersion: 2, updatedAt: now });

test('automatic buzzer stays quiet without an alarm and stops after an alarm clears', () => {
  assert.equal(model.taoDuLieuMoPhong({}, 100_000).buzzerOn, false);
  assert.equal(model.taoDuLieuMoPhong({ flameDetected: true }, 101_000).buzzerOn, true);
  assert.equal(model.taoDuLieuMoPhong({ flameDetected: false }, 102_000).buzzerOn, false);
  assert.equal(model.taoDuLieuMoPhong({ buzzerMode: 'on' }, 103_000).buzzerOn, true);
});

test('one bicolor LED shows green when safe and red for either hazard', () => {
  const safe = model.taoDuLieuMoPhong({}, 100_000);
  assert.equal(safe.alarmLedOn, false);
  assert.equal(safe.statusLedOn, true);
  for (const hazard of [{ gasAlarm: true }, { flameDetected: true }, { gasAlarm: true, flameDetected: true }]) {
    const reading = model.taoDuLieuMoPhong(hazard, 100_000);
    assert.equal(reading.alarmLedOn, true);
    assert.equal(reading.statusLedOn, false);
  }
  assert.deepEqual(model.lenhDen('auto'), { alarmLedMode: 'auto', statusLedMode: 'auto' });
  assert.deepEqual(model.lenhDen('red'), { alarmLedMode: 'on', statusLedMode: 'off' });
  assert.deepEqual(model.lenhDen('green'), { alarmLedMode: 'off', statusLedMode: 'on' });
  assert.deepEqual(model.lenhDen('off'), { alarmLedMode: 'off', statusLedMode: 'off' });
  assert.equal(model.luaChonMauDen({ alarmLedMode: 'on', statusLedMode: 'off' }), 'red');
  assert.equal(model.luaChonMauDen({ alarmLedMode: 'off', statusLedMode: 'on' }), 'green');
  assert.equal(model.coTheDieuKhien(safe, 'ledMode', 100_000), true);
  assert.equal(model.coTheDieuKhien(model.taoDuLieuMoPhong({ flameDetected: true }, 100_000), 'ledMode', 100_000), false);
});

test('fan accepts only on/off commands', () => {
  const now = 100_000;
  assert.equal(model.coTheDieuKhien?.(safe(now), 'buzzerMode', now), true);
  assert.equal(model.coTheDieuKhien?.(safe(now), 'fanSpeedPct', now), false);
  assert.equal(model.lenhHopLe?.('fanSpeedPct', 30), false);
  assert.equal(model.lenhHopLe?.('fanOn', true), true);
  assert.equal(model.lenhHopLe?.('fanOn', false), true);
  const oldPwmFirmware = model.chuanHoaDuLieu({ ...safe(now), fanSpeedSupported: true });
  assert.equal(model.coTheDieuKhien(oldPwmFirmware, 'fanOn', now), false,
    'on/off web must wait for firmware without PWM');
  assert.equal(model.coTheDieuKhien?.({ ...safe(now), controlsVersion: null }, 'buzzerMode', now), false);
  assert.equal(model.coTheDieuKhien?.(safe(now), 'unknown', now), false);
});

test('stale telemetry locks commands, and either alarm locks the bicolor LED', () => {
  const now = 100_000;
  for (const key of ['fanOn', 'ledMode', 'buzzerMode']) {
    assert.equal(model.coTheDieuKhien?.(safe(now), key, now + 16_000), false);
  }
  const gas = { ...safe(now), gasAlarm: true, fanOn: true };
  assert.equal(model.coTheDieuKhien(gas, 'fanOn', now), false);
  assert.equal(model.coTheDieuKhien(gas, 'ledMode', now), false);
  assert.equal(model.coTheDieuKhien(gas, 'buzzerMode', now), false);
  const flame = { ...safe(now), flameDetected: true };
  assert.equal(model.coTheDieuKhien(flame, 'fanOn', now), true);
  assert.equal(model.coTheDieuKhien(flame, 'ledMode', now), false);
});

test('commands reject wrong modes and nonboolean fan values', () => {
  assert.equal(model.lenhHopLe?.('buzzerMode', 'off'), true);
  assert.equal(model.lenhHopLe?.('ledMode', 'auto'), true);
  assert.equal(model.lenhHopLe?.('ledMode', 'green'), true);
  assert.equal(model.lenhHopLe?.('alarmLedMode', 'on'), false);
  assert.equal(model.lenhHopLe?.('fanOn', 1), false);
  assert.equal(model.lenhHopLe?.('buzzerMode', 'mute-forever'), false);
});

test('command success needs receipt of this command ID from ESP32', () => {
  const pending = { id: 'new-command', sentAt: 100_000 };
  assert.equal(model.tienDoLenh?.(pending, { appliedCommandId: 'old-command' }, 101_000), 'waiting');
  assert.equal(model.tienDoLenh?.(pending, { appliedCommandId: 'new-command' }, 101_000), 'applied');
  assert.equal(model.tienDoLenh?.(pending, {}, 121_000), 'timeout');
});

test('demo fan follows on/off, gas priority and temporary mute', () => {
  const reading = model.taoDuLieuMoPhong({ manualFan: true,
    alarmLedMode: 'on', statusLedMode: 'off', buzzerMode: 'off' }, 100_000);
  assert.equal(reading.alarmLedOn, true);
  assert.equal(reading.statusLedOn, false);
  assert.equal(reading.buzzerOn, false);
  assert.equal(reading.fanOn, true);
  assert.equal('fanSpeedPct' in reading, false);
  assert.equal(model.taoDuLieuMoPhong({ manualFan: false }, 100_000).fanOn, false);
  const alarm = model.taoDuLieuMoPhong({ gasAlarm: true,
    alarmLedMode: 'off', buzzerMode: 'off' }, 100_000);
  assert.equal(alarm.fanOn, true);
  assert.equal(alarm.alarmLedOn, true);
  assert.equal(alarm.statusLedOn, false);
  assert.equal(alarm.buzzerOn, true);
});

test('red D22 overrides green D23 for either hazard', () => {
  const now = 100_000;
  const flame = model.taoDuLieuMoPhong({ flameDetected: true }, now);
  assert.equal(flame.alarmLedOn, true);
  assert.equal(flame.statusLedOn, false);
  assert.equal(flame.fanOn, false);
  const gas = model.taoDuLieuMoPhong({ gasAlarm: true }, now);
  assert.equal(gas.alarmLedOn, true);
  assert.equal(gas.statusLedOn, false);
  assert.equal(gas.fanOn, true);
  const both = model.taoDuLieuMoPhong({ gasAlarm: true, flameDetected: true }, now);
  assert.equal(both.alarmLedOn, true);
  assert.equal(both.statusLedOn, false);
});

test('manual fan can turn on then off without changing buzzer or indicator modes', () => {
  const now = 100_000;
  const on = model.taoDuLieuMoPhong({ manualFan: true, buzzerMode: 'on', alarmLedMode: 'off' }, now);
  assert.equal(on.fanOn, true);
  assert.equal(model.coTheDieuKhien(on, 'fanOn', now), true);
  const off = model.taoDuLieuMoPhong({ manualFan: false, buzzerMode: 'on', alarmLedMode: 'off' }, now);
  assert.equal(off.fanOn, false);
  assert.equal(off.buzzerOn, true);
  assert.equal(off.alarmLedOn, false);
});

test('temporary mute stops automatic outputs until expiry', () => {
  const now = 100_000;
  const alarm = { ...safe(now), gasAlarm: true };
  assert.equal(model.coTheDieuKhien?.({ ...alarm, muteUntil: now + 10_000 }, 'fanOn', now), false);
  assert.equal(model.coTheTamTat?.(alarm, now), true);
  assert.equal(model.coTheTamTat?.({ ...alarm, muteUntil: now + 10_000 }, now), false);
  const muted = model.taoDuLieuMoPhong({ gasAlarm: true, manualFan: true,
    muteUntil: now + 30_000 }, now);
  assert.equal(muted.fanOn, true, 'muting the buzzer must keep gas ventilation running');
  assert.equal(muted.alarmLedOn, true, 'muting the buzzer keeps the red warning visible');
  assert.equal(muted.statusLedOn, false);
  assert.equal(muted.buzzerOn, false);
  assert.equal(model.coTheDieuKhien(muted, 'buzzerMode', now), false);
  assert.equal(model.coTheDieuKhien({ ...muted, gasAlarm: false, flameDetected: false }, 'fanOn', now), true,
    'new firmware keeps fan control available while only the buzzer is muted');
  const flame = model.taoDuLieuMoPhong({ flameDetected: true, manualFan: true }, now);
  assert.equal(flame.fanOn, false, 'a flame alarm stops the manual fan so it does not feed the fire');
  assert.equal(flame.fanReason, 'blocked');
  assert.equal(model.coTheDieuKhien(flame, 'fanOn', now), false);
  const resumed = model.taoDuLieuMoPhong({ gasAlarm: true, muteUntil: now + 30_000 }, now + 30_001);
  assert.equal(resumed.fanOn, true);
  assert.equal(resumed.buzzerOn, true);
});
