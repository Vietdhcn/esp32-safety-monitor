const measured = (value, min, max) =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value : null;

export function normalizeTelemetry(value = {}) {
  const data = value && typeof value === 'object' ? value : {};
  return {
    flameDetected: typeof data.flameDetected === 'boolean' ? data.flameDetected : null,
    gasAlarm: typeof data.gasAlarm === 'boolean' ? data.gasAlarm : null,
    fanOn: typeof data.fanOn === 'boolean' ? data.fanOn : null,
    gasRaw: measured(data.gasRaw, 0, 4095),
    temperatureC: measured(data.temperatureC, -40, 80),
    humidityPct: measured(data.humidityPct, 0, 100),
    updatedAt: measured(data.updatedAt, 1, Number.MAX_SAFE_INTEGER)
  };
}

export function gasPercent(raw) {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  return Math.round(Math.max(0, Math.min(4095, raw)) * 100 / 4095);
}

export function isStale(updatedAt, now = Date.now()) {
  return typeof updatedAt !== 'number' || !Number.isFinite(updatedAt) ||
    updatedAt <= 0 || now - updatedAt > 15_000 || updatedAt - now > 5_000;
}

export function canSetFan(telemetry, now = Date.now()) {
  return telemetry?.flameDetected === false && telemetry?.gasAlarm === false &&
    !isStale(telemetry.updatedAt, now);
}

export function isLocalDemo(url) {
  return ['localhost', '127.0.0.1'].includes(url.hostname) &&
    url.searchParams.get('demo') === '1';
}

export function createDemoTelemetry({ manualFan = false, gasAlarm = false, flameDetected = false } = {}, now = Date.now()) {
  return normalizeTelemetry({
    flameDetected,
    gasAlarm,
    fanOn: manualFan || gasAlarm,
    gasRaw: gasAlarm ? 3072 : 1430,
    temperatureC: 28.3,
    humidityPct: 64.2,
    updatedAt: now
  });
}
