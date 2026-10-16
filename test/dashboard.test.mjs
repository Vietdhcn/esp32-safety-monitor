import test from 'node:test';
import assert from 'node:assert/strict';
import { chuanHoaDuLieu, duLieuCu, coTheDatQuat } from '../docs/dashboard-model.js';
import * as model from '../docs/dashboard-model.js';

test('normalizes digital sensor alarms without an analog gas level', () => {
  const reading = chuanHoaDuLieu({
    flameDetected: false, gasAlarm: true, fanOn: true,
    gasRaw: 2048, temperatureC: 27.4, humidityPct: 65.2,
    updatedAt: 1_700_000_000_000
  });
  assert.deepEqual(Object.fromEntries(Object.entries(reading).filter(([key]) => ['flameDetected', 'gasAlarm', 'fanOn', 'gasRaw', 'temperatureC', 'humidityPct', 'updatedAt'].includes(key))), {
    flameDetected: false, gasAlarm: true, fanOn: true,
    temperatureC: 27.4, humidityPct: 65.2,
    updatedAt: 1_700_000_000_000
  });
});

test('missing or invalid measurements stay unavailable instead of becoming zero', () => {
  const result = chuanHoaDuLieu({ gasRaw: -1, temperatureC: '25', humidityPct: 110 });
  assert.equal('gasRaw' in result, false);
  assert.equal(result.temperatureC, null);
  assert.equal(result.humidityPct, null);
  assert.equal(result.flameDetected, null);
});

test('device telemetry keeps only fan on/off even with legacy speed fields', () => {
  const reading = model.chuanHoaDuLieu({ fanOn: true, fanSpeedPct: 90,
    fanSpeedSupported: true, updatedAt: 1_700_000_000_000 });
  assert.equal(reading.fanOn, true);
  assert.equal('fanSpeedPct' in reading, false);
  assert.equal('fanSpeedSupported' in reading, false);
  assert.equal(reading.legacyPwmActive, true);
  assert.equal(model.chuanHoaDuLieu({ fanOn: false }).legacyPwmActive, false);
});

test('local demo has only separate digital gas and flame alarms', () => {
  const gasOnly = model.taoDuLieuMoPhong({ gasAlarm: true, flameDetected: false }, 101_000);
  assert.equal(gasOnly.gasAlarm, true);
  assert.equal(gasOnly.flameDetected, false);
  assert.equal('gasRaw' in gasOnly, false);
});

test('telemetry older than 15 seconds is stale', () => {
  assert.equal(duLieuCu(1_000, 16_001), true);
  assert.equal(duLieuCu(1_000, 16_000), false);
  assert.equal(duLieuCu(null, 16_000), true);
});

test('fan command is blocked on stale data or gas alarm, but not fire alone', () => {
  const safe = { flameDetected: false, gasAlarm: false, fanOn: false, updatedAt: 10_000 };
  assert.equal(coTheDatQuat(safe, 20_000), true);
  assert.equal(coTheDatQuat({ ...safe, gasAlarm: true }, 20_000), false);
  assert.equal(coTheDatQuat({ ...safe, flameDetected: true }, 20_000), true);
  assert.equal(coTheDatQuat(safe, 30_000), false);
});

test('demo mode is available only on local preview URLs', () => {
  assert.equal(model.laMoPhongNoiBo?.(new URL('http://localhost:8000/?demo=1')), true);
  assert.equal(model.laMoPhongNoiBo?.(new URL('http://127.0.0.1:8000/?demo=1')), true);
  assert.equal(model.laMoPhongNoiBo?.(new URL('https://vietdhcn.github.io/esp32-safety-monitor/?demo=1')), false);
  assert.equal(model.laMoPhongNoiBo?.(new URL('http://localhost:8000/')), false);
});

test('demo gas alarm forces fan while normal preview permits manual control', () => {
  const normal = model.taoDuLieuMoPhong?.({ manualFan: false, gasAlarm: false, flameDetected: false }, 100_000);
  assert.equal(normal?.fanOn, false);
  assert.equal(normal?.gasAlarm, false);
  assert.equal(normal?.updatedAt, 100_000);
  assert.equal(coTheDatQuat(normal, 100_000), true);

  const alarm = model.taoDuLieuMoPhong?.({ manualFan: false, gasAlarm: true, flameDetected: false }, 101_000);
  assert.equal(alarm?.fanOn, true);
  assert.equal(alarm?.gasAlarm, true);
  assert.equal(coTheDatQuat(alarm, 101_000), false);
});
