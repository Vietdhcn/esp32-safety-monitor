const soDoHopLe = (giaTri, nhoNhat, lonNhat) =>
  typeof giaTri === 'number' && Number.isFinite(giaTri) && giaTri >= nhoNhat && giaTri <= lonNhat ? giaTri : null;
const giaTriBoolean = giaTri => typeof giaTri === 'boolean' ? giaTri : null;
const giaTriCheDo = ['auto', 'on', 'off'];
export const cacCheDo = ['buzzerMode'];
const cheDoHopLe = giaTri => giaTriCheDo.includes(giaTri) ? giaTri : null;
const lyDoQuat = ['gas', 'purge', 'manual', 'blocked', 'off'];
const lyDoKhoiDong = ['power-on', 'brownout', 'panic', 'watchdog', 'software', 'external', 'other'];
const trangThaiDoiWifi = ['connecting', 'applied', 'failed'];
// Firmware logicVersion 3: lọc nhiễu, tắt tiếng chỉ tắt còi, báo lửa dừng quạt tay.
export const LOGIC_MOI = 3;
export const laLogicMoi = duLieu => duLieu?.logicVersion >= LOGIC_MOI;
const cacLenhDen = {
  auto: { alarmLedMode: 'auto', statusLedMode: 'auto' },
  red: { alarmLedMode: 'on', statusLedMode: 'off' },
  green: { alarmLedMode: 'off', statusLedMode: 'on' },
  off: { alarmLedMode: 'off', statusLedMode: 'off' }
};
export const lenhDen = luaChon => cacLenhDen[luaChon] ? { ...cacLenhDen[luaChon] } : null;
export function luaChonMauDen(duLieu) {
  const denDo = duLieu?.alarmLedMode;
  const denXanh = duLieu?.statusLedMode;
  if (denDo === 'on') return 'red';
  if (denXanh === 'on') return 'green';
  if (denDo === 'off' && denXanh === 'off') return 'off';
  if (denDo === 'auto' && denXanh === 'auto') return 'auto';
  return null;
}

export function chuanHoaDuLieu(giaTri = {}) {
  const duLieu = giaTri && typeof giaTri === 'object' ? giaTri : {};
  return {
    flameDetected: giaTriBoolean(duLieu.flameDetected), gasAlarm: giaTriBoolean(duLieu.gasAlarm), fanOn: giaTriBoolean(duLieu.fanOn),
    legacyPwmActive: duLieu.fanSpeedSupported === true,
    alarmLedOn: giaTriBoolean(duLieu.alarmLedOn), statusLedOn: giaTriBoolean(duLieu.statusLedOn), buzzerOn: giaTriBoolean(duLieu.buzzerOn),
    alarmLedMode: cheDoHopLe(duLieu.alarmLedMode), statusLedMode: cheDoHopLe(duLieu.statusLedMode), buzzerMode: cheDoHopLe(duLieu.buzzerMode),
    controlsVersion: duLieu.controlsVersion === 2 ? 2 : null,
    muteUntil: soDoHopLe(duLieu.muteUntil, 0, Number.MAX_SAFE_INTEGER),
    appliedCommandId: typeof duLieu.appliedCommandId === 'string' ? duLieu.appliedCommandId : null,
    logicVersion: soDoHopLe(duLieu.logicVersion, 1, 1000),
    fanReason: lyDoQuat.includes(duLieu.fanReason) ? duLieu.fanReason : null,
    gasWarmup: duLieu.gasWarmup === true, flameNoise: duLieu.flameNoise === true,
    resetReason: lyDoKhoiDong.includes(duLieu.resetReason) ? duLieu.resetReason : null,
    temperatureC: soDoHopLe(duLieu.temperatureC, -40, 80),
    humidityPct: soDoHopLe(duLieu.humidityPct, 0, 100), updatedAt: soDoHopLe(duLieu.updatedAt, 1, Number.MAX_SAFE_INTEGER),
    wifiConfigVersion: duLieu.wifiConfigVersion === 1 ? 1 : null,
    wifiSsid: typeof duLieu.wifiSsid === 'string' && new TextEncoder().encode(duLieu.wifiSsid).length <= 32 ? duLieu.wifiSsid : null,
    wifiChangeId: typeof duLieu.wifiChangeId === 'string' && duLieu.wifiChangeId.length <= 64 ? duLieu.wifiChangeId : null,
    wifiChangeStatus: trangThaiDoiWifi.includes(duLieu.wifiChangeStatus) ? duLieu.wifiChangeStatus : null
  };
}

export function loiCauHinhWifi(ssid, password) {
  const ssidBytes = new TextEncoder().encode(ssid || '').length;
  const passwordBytes = new TextEncoder().encode(password || '').length;
  if (!ssid?.trim() || ssidBytes > 32 || ssid.includes('\0')) return 'Tên Wi-Fi phải dài từ 1 đến 32 byte.';
  if (passwordBytes < 8 || passwordBytes > 63 || /[^\x20-\x7e]/.test(password))
    return 'Mật khẩu Wi-Fi WPA phải dài 8–63 ký tự ASCII.';
  return null;
}

function quaHanCapNhat(thoiDiemCapNhat, hienTai, nguongMs) {
  return typeof thoiDiemCapNhat !== 'number' || !Number.isFinite(thoiDiemCapNhat) || thoiDiemCapNhat <= 0 ||
    hienTai - thoiDiemCapNhat > nguongMs || thoiDiemCapNhat - hienTai > 5_000;
}
export const duLieuCu = (thoiDiemCapNhat, hienTai = Date.now()) =>
  quaHanCapNhat(thoiDiemCapNhat, hienTai, 15_000);
export const thietBiNgoaiTuyen = (thoiDiemCapNhat, hienTai = Date.now()) =>
  quaHanCapNhat(thoiDiemCapNhat, hienTai, 30_000);
export const coCanhBao = duLieu => duLieu?.flameDetected === true || duLieu?.gasAlarm === true;
export const dangTamTat = (duLieu, hienTai = Date.now()) => duLieu?.muteUntil > hienTai;
// Firmware cũ: tạm tắt dừng mọi đầu ra. Firmware mới: chỉ tắt tiếng còi.
export const tamTatTatCa = (duLieu, hienTai = Date.now()) => dangTamTat(duLieu, hienTai) && !laLogicMoi(duLieu);
export function coTheDatQuat(duLieu, hienTai = Date.now()) {
  return !duLieuCu(duLieu?.updatedAt, hienTai) && !tamTatTatCa(duLieu, hienTai) &&
    duLieu?.gasAlarm === false && duLieu?.flameDetected === false &&
    duLieu?.fanOn != null && duLieu?.legacyPwmActive !== true;
}
export function lenhHopLe(khoa, giaTri) {
  if (khoa === 'ledMode') return Object.hasOwn(cacLenhDen, giaTri);
  if (cacCheDo.includes(khoa)) return giaTriCheDo.includes(giaTri);
  if (khoa === 'fanOn') return typeof giaTri === 'boolean';
  return false;
}
export function coTheDieuKhien(duLieu, khoa, hienTai = Date.now()) {
  if (!['fanOn', 'ledMode', ...cacCheDo].includes(khoa) || duLieuCu(duLieu?.updatedAt, hienTai) ||
    tamTatTatCa(duLieu, hienTai) || (khoa === 'buzzerMode' && dangTamTat(duLieu, hienTai))) return false;
  if (khoa === 'fanOn') return coTheDatQuat(duLieu, hienTai);
  if (duLieu.controlsVersion !== 2) return false;
  if (khoa === 'ledMode') return !coCanhBao(duLieu);
  return duLieu.flameDetected === false && duLieu.gasAlarm === false;
}
export function coTheTamTat(duLieu, hienTai = Date.now()) {
  return duLieu?.controlsVersion === 2 && !duLieuCu(duLieu.updatedAt, hienTai) &&
    coCanhBao(duLieu) && !dangTamTat(duLieu, hienTai);
}
export function tienDoLenh(lenhDangCho, duLieu, hienTai = Date.now()) {
  if (!lenhDangCho) return 'idle';
  if (duLieu?.appliedCommandId === lenhDangCho.id) return 'applied';
  return hienTai - lenhDangCho.sentAt >= 20_000 ? 'timeout' : 'waiting';
}
export function laMoPhongNoiBo(duongDan) {
  return ['localhost', '127.0.0.1'].includes(duongDan.hostname) && duongDan.searchParams.get('demo') === '1';
}
// Mô phỏng giống SafetyLogic.h: lửa dừng quạt kể cả khi có gas, tắt tiếng chỉ tắt còi.
export function taoDuLieuMoPhong(state = {}, now = Date.now()) {
  const { manualFan = false, gasAlarm = false, flameDetected = false,
    alarmLedMode = 'auto', statusLedMode = 'auto', buzzerMode = 'auto', muteUntil = 0 } = state;
  const muted = muteUntil > now;
  const alarm = gasAlarm || flameDetected;
  const redOn = alarm || alarmLedMode === 'on';
  const greenOn = !redOn && statusLedMode !== 'off';
  const buzzerOn = !muted && (alarm || buzzerMode === 'on');
  const fanOn = !flameDetected && (gasAlarm || manualFan);
  const fanReason = flameDetected ? 'blocked' : gasAlarm ? 'gas' : fanOn ? 'manual' : 'off';
  return chuanHoaDuLieu({
    flameDetected, gasAlarm, fanOn, fanReason,
    alarmLedMode, statusLedMode, buzzerMode, muteUntil: muted ? muteUntil : 0,
    alarmLedOn: redOn, statusLedOn: greenOn, buzzerOn,
    controlsVersion: 2, logicVersion: 4, resetReason: 'power-on',
    appliedCommandId: state.appliedCommandId ?? '',
    temperatureC: 28.3, humidityPct: 64.2, updatedAt: now
  });
}
