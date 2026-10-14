import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTelemetry, gasPercent, isStale, canSetFan } from '../docs/dashboard-model.js';

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
