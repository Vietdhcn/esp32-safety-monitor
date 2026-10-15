import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTelemetry, gasPercent, isStale, canSetFan } from '../docs/dashboard-model.js';
import * as model from '../docs/dashboard-model.js';

test('normalizes a complete sensor reading for display', () => {
  assert.deepEqual(normalizeTelemetry({
    flameDetected: false, gasAlarm: true, fanOn: true,
    gasRaw: 2048, temperatureC: 27.4, humidityPct: 65.2,
    updatedAt: 1_700_000_000_000
  }), {
    flameDetected: false, gasAlarm: true, fanOn: true,
    gasRaw: 2048, temperatureC: 27.4, humidityPct: 65.2,
    updatedAt: 1_700_000_000_000
  });
});

test('missing or invalid measurements stay unavailable instead of becoming zero', () => {
  const result = normalizeTelemetry({ gasRaw: -1, temperatureC: '25', humidityPct: 110 });
  assert.equal(result.gasRaw, null);
  assert.equal(result.temperatureC, null);
  assert.equal(result.humidityPct, null);
  assert.equal(result.flameDetected, null);
});

test('gas percentage is a relative ADC scale and clamps at its limits', () => {
  assert.equal(gasPercent(0), 0);
  assert.equal(gasPercent(2048), 50);
  assert.equal(gasPercent(4095), 100);
  assert.equal(gasPercent(null), null);
});

test('telemetry older than 15 seconds is stale', () => {
  assert.equal(isStale(1_000, 16_001), true);
  assert.equal(isStale(1_000, 16_000), false);
  assert.equal(isStale(null, 16_000), true);
});

test('relay command is blocked on stale data or an active alarm', () => {
  const safe = { flameDetected: false, gasAlarm: false, updatedAt: 10_000 };
  assert.equal(canSetFan(safe, 20_000), true);
  assert.equal(canSetFan({ ...safe, gasAlarm: true }, 20_000), false);
  assert.equal(canSetFan({ ...safe, flameDetected: true }, 20_000), false);
  assert.equal(canSetFan(safe, 30_000), false);
});

test('demo mode is available only on local preview URLs', () => {
  assert.equal(model.isLocalDemo?.(new URL('http://localhost:8000/?demo=1')), true);
  assert.equal(model.isLocalDemo?.(new URL('http://127.0.0.1:8000/?demo=1')), true);
  assert.equal(model.isLocalDemo?.(new URL('https://vietdhcn.github.io/esp32-safety-monitor/?demo=1')), false);
  assert.equal(model.isLocalDemo?.(new URL('http://localhost:8000/')), false);
});

test('demo gas alarm forces fan while normal preview permits manual control', () => {
  const normal = model.createDemoTelemetry?.({ manualFan: false, gasAlarm: false, flameDetected: false }, 100_000);
  assert.equal(normal?.fanOn, false);
  assert.equal(normal?.gasAlarm, false);
  assert.equal(normal?.updatedAt, 100_000);
  assert.equal(canSetFan(normal, 100_000), true);

  const alarm = model.createDemoTelemetry?.({ manualFan: false, gasAlarm: true, flameDetected: false }, 101_000);
  assert.equal(alarm?.fanOn, true);
  assert.equal(alarm?.gasAlarm, true);
  assert.equal(canSetFan(alarm, 101_000), false);
});
