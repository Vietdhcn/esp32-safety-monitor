const measured = (value, min, max) =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;
const boolean = value => typeof value === 'boolean' ? value : null;
const modes = ['auto', 'on', 'off'];
export const modeKeys = ['alarmLedMode', 'statusLedMode', 'buzzerMode'];
const mode = value => modes.includes(value) ? value : null;

export function normalizeTelemetry(value = {}) {
  const data = value && typeof value === 'object' ? value : {};
  return {
    flameDetected: boolean(data.flameDetected), gasAlarm: boolean(data.gasAlarm), fanOn: boolean(data.fanOn),
    alarmLedOn: boolean(data.alarmLedOn), statusLedOn: boolean(data.statusLedOn), buzzerOn: boolean(data.buzzerOn),
    alarmLedMode: mode(data.alarmLedMode), statusLedMode: mode(data.statusLedMode), buzzerMode: mode(data.buzzerMode),
    fanSpeedSupported: boolean(data.fanSpeedSupported), fanSpeedPct: measured(data.fanSpeedPct, 0, 100),
    controlsVersion: data.controlsVersion === 2 ? 2 : null,
    alarmDisabled: boolean(data.alarmDisabled), muteUntil: measured(data.muteUntil, 0, Number.MAX_SAFE_INTEGER),
    appliedCommandId: typeof data.appliedCommandId === 'string' ? data.appliedCommandId : null,
    gasRaw: measured(data.gasRaw, 0, 4095), temperatureC: measured(data.temperatureC, -40, 80),
    humidityPct: measured(data.humidityPct, 0, 100), updatedAt: measured(data.updatedAt, 1, Number.MAX_SAFE_INTEGER)
  };
}

export function gasPercent(raw) {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  return Math.round(Math.max(0, Math.min(4095, raw)) * 100 / 4095);
}
export function isStale(updatedAt, now = Date.now()) {
  return typeof updatedAt !== 'number' || !Number.isFinite(updatedAt) || updatedAt <= 0 ||
    now - updatedAt > 15_000 || updatedAt - now > 5_000;
}
export const hasAlarm = telemetry => telemetry?.flameDetected === true || telemetry?.gasAlarm === true;
export const isMuted = (telemetry, now = Date.now()) => telemetry?.alarmDisabled !== true && telemetry?.muteUntil > now;
export function canSetFan(telemetry, now = Date.now()) {
  return !isStale(telemetry?.updatedAt, now) && !isMuted(telemetry, now) &&
    (telemetry?.alarmDisabled === true || (telemetry?.flameDetected === false && telemetry?.gasAlarm === false));
}
export function validCommand(key, value) {
  if (modeKeys.includes(key)) return modes.includes(value);
  if (key === 'fanOn') return typeof value === 'boolean';
  if (key === 'fanSpeedPct') return Number.isInteger(value) && value >= 0 && value <= 100;
  return false;
}
export function canControl(telemetry, key, now = Date.now()) {
  if (!['fanOn', 'fanSpeedPct', ...modeKeys].includes(key) || !canSetFan(telemetry, now)) return false;
  if (key === 'fanOn') return telemetry.fanOn != null;
  return telemetry.controlsVersion === 2 && (key !== 'fanSpeedPct' || telemetry.fanSpeedSupported === true);
}
export function canMute(telemetry, now = Date.now()) {
  return telemetry?.controlsVersion === 2 && !isStale(telemetry.updatedAt, now) &&
    hasAlarm(telemetry) && telemetry.alarmDisabled !== true && !isMuted(telemetry, now);
}
export function commandProgress(pending, telemetry, now = Date.now()) {
  if (!pending) return 'idle';
  if (telemetry?.appliedCommandId === pending.id) return 'applied';
  return now - pending.sentAt >= 20_000 ? 'timeout' : 'waiting';
}
export function isLocalDemo(url) {
  return ['localhost', '127.0.0.1'].includes(url.hostname) && url.searchParams.get('demo') === '1';
}
export function createDemoTelemetry(state = {}, now = Date.now()) {
  const { manualFan = false, gasAlarm = false, flameDetected = false, fanSpeedPct = 100,
    alarmLedMode = 'auto', statusLedMode = 'auto', buzzerMode = 'auto', alarmDisabled = false, muteUntil = 0 } = state;
  const muted = !alarmDisabled && muteUntil > now;
  const alarm = (gasAlarm || flameDetected) && !alarmDisabled;
  const output = (setting, automatic) => !muted && (alarm ? automatic : setting === 'on' ||
    (setting === 'auto' && !alarmDisabled && automatic));
  const fanOn = !muted && (manualFan || (gasAlarm && !alarmDisabled));
  return normalizeTelemetry({
    flameDetected, gasAlarm, fanOn, alarmLedMode, statusLedMode, buzzerMode, alarmDisabled, muteUntil,
    alarmLedOn: output(alarmLedMode, alarm), statusLedOn: output(statusLedMode, !alarm),
    buzzerOn: output(buzzerMode, alarm || !alarmDisabled),
    fanSpeedPct: fanOn ? gasAlarm && !alarmDisabled ? 100 : fanSpeedPct : 0,
    controlsVersion: 2, fanSpeedSupported: true, appliedCommandId: state.appliedCommandId ?? '',
    gasRaw: gasAlarm ? 3072 : 1430, temperatureC: 28.3, humidityPct: 64.2, updatedAt: now
  });
}
