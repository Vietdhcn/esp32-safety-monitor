import { firebaseConfig, deviceId } from './config.js';
import { chuanHoaDuLieu, duLieuCu, thietBiNgoaiTuyen, laMoPhongNoiBo, taoDuLieuMoPhong, cacCheDo, luaChonMauDen, lenhDen, coTheDieuKhien, coTheTamTat, dangTamTat, tamTatTatCa, laLogicMoi, lenhHopLe, tienDoLenh } from './dashboard-model.js?v=20261017-2';
import { cacThayDoiLichSu, themLichSu, lichSuThaoTac, locLichSu, xoaLichSuTheoNguon, lamSachLichSuHeThongCu } from './history-model.js?v=20261017-1';

const $ = id => document.getElementById(id);
const thongBaoCauHinh = $('setup-message');
const khungDangNhap = $('login-panel');
const bangDieuKhien = $('dashboard');
const duongDanTrang = new URL(window.location.href);
const xemTruocNoiBo = ['localhost', '127.0.0.1'].includes(duongDanTrang.hostname);
const cheDoMoPhong = laMoPhongNoiBo(duongDanTrang);
let duLieuThietBi = chuanHoaDuLieu();
let huyTheoDoiDuLieu = null;
let coSoDuLieu = null;
let lenhDangCho = null;
let luaChonQuat = 'auto';
let dangGuiLenh = false;
let thongBaoLenh = '';
let guiLenh = async () => {};
let khoaLichSu = '';
let cacMucLichSu = [];
let nguonLichSu = 'all';
let duLieuTruoc = null;
let boQuaLanDocDau = false;
const ngoRaCheDo = { buzzerMode: 'buzzerOn' };
const tenCacTab = ['overview', 'history'];

function chonTab(name, focus = false) {
  for (const tabName of tenCacTab) {
    const active = tabName === name;
    const tab = $(`tab-${tabName}`);
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    $(`${tabName}-view`).hidden = !active;
    if (active && focus) tab.focus();
  }
}
for (const name of tenCacTab) {
  const tab = $(`tab-${name}`);
  tab.addEventListener('click', () => {
    chonTab(name);
  });
  tab.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? tenCacTab.length - 1 :
      (tenCacTab.indexOf(name) + (event.key === 'ArrowLeft' ? -1 : 1) + tenCacTab.length) % tenCacTab.length;
    const next = tenCacTab[nextIndex];
    chonTab(next, true);
  });
}

const dinhDangNgayGio = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'medium' });
function capNhatDongHo() {
  const now = new Date();
  $('current-time').textContent = new Intl.DateTimeFormat('vi-VN', { timeStyle: 'medium' }).format(now);
  $('current-date').textContent = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }).format(now);
}
capNhatDongHo();
setInterval(capNhatDongHo, 1000);

function luuLichSu() {
  try { localStorage.setItem(khoaLichSu, JSON.stringify({ version: 3, items: cacMucLichSu, previous: duLieuTruoc, cleared: cacMucLichSu.length === 0 })); }
  catch { $('history-status').textContent = 'Không thể lưu lịch sử trên trình duyệt này.'; }
}

function hienThiLichSu() {
  const list = $('history-list');
  list.replaceChildren();
  const visible = locLichSu(cacMucLichSu, nguonLichSu);
  for (const entry of visible) {
    const item = document.createElement('li');
    item.tabIndex = 0;
    const source = entry.source === 'user' ? 'user' : 'system';
    item.className = `history-item history-${entry.kind} history-source-${source}`;
    const marker = document.createElement('span');
    marker.className = 'history-marker';
    marker.setAttribute('aria-hidden', 'true');
    const content = document.createElement('div');
    const heading = document.createElement('div');
    heading.className = 'history-item-heading';
    const title = document.createElement('strong');
    title.textContent = entry.title;
    const sourceLabel = document.createElement('span');
    sourceLabel.className = `history-source-label history-source-label-${source}`;
    sourceLabel.textContent = source === 'user' ? 'Bạn nhấn' : 'Hệ thống';
    heading.append(title, sourceLabel);
    const time = document.createElement('time');
    time.dateTime = new Date(entry.at).toISOString();
    time.textContent = dinhDangNgayGio.format(new Date(entry.at));
    content.append(heading);
    if (source === 'user') {
      const detail = document.createElement('p');
      detail.textContent = entry.detail;
      content.append(detail);
    }
    item.append(marker, content, time);
    list.append(item);
  }
  $('history-empty').hidden = visible.length > 0;
  $('history-empty').textContent = nguonLichSu === 'user' ? 'Chưa có thao tác nào của bạn.' :
    nguonLichSu === 'system' ? 'Chưa có sự kiện hệ thống nào.' : 'Chưa có hoạt động nào được ghi lại.';
  $('clear-history-all').disabled = cacMucLichSu.length === 0;
  $('clear-history-system').disabled = locLichSu(cacMucLichSu, 'system').length === 0;
  $('clear-history-user').disabled = locLichSu(cacMucLichSu, 'user').length === 0;
  $('history-count').textContent = String(cacMucLichSu.length);
  $('history-system-count').textContent = String(locLichSu(cacMucLichSu, 'system').length);
  $('history-user-count').textContent = String(locLichSu(cacMucLichSu, 'user').length);
  for (const source of ['all', 'system', 'user']) {
    $('history-filter-' + source).setAttribute('aria-pressed', String(nguonLichSu === source));
  }
}

for (const source of ['all', 'system', 'user']) {
  $('history-filter-' + source).addEventListener('click', () => {
    nguonLichSu = source;
    hienThiLichSu();
  });
}

function datPhamViLichSu(scope) {
  khoaLichSu = `safety-history:${deviceId}:${scope}`;
  cacMucLichSu = [];
  nguonLichSu = 'all';
  duLieuTruoc = null;
  boQuaLanDocDau = false;
  let lichSuCuCanChuyen = false;
  try {
    const daLuu = JSON.parse(localStorage.getItem(khoaLichSu) || 'null');
    if (Array.isArray(daLuu?.items)) cacMucLichSu = daLuu.items.filter(item =>
      Number.isFinite(item?.at) && item.at > 0 && item.at <= 8_640_000_000_000_000 &&
      typeof item.title === 'string' && typeof item.detail === 'string' &&
      ['info', 'safe', 'danger', 'device', 'user'].includes(item.kind))
      .slice(0, 100).map(item => ({ ...item, source: item.source === 'user' ? 'user' : 'system' }));
    if (Array.isArray(daLuu?.items)) {
      const daLoc = lamSachLichSuHeThongCu(cacMucLichSu);
      lichSuCuCanChuyen = daLuu.version !== 3 || daLoc.length !== cacMucLichSu.length;
      cacMucLichSu = daLoc;
    }
    if (daLuu?.previous && typeof daLuu.previous === 'object') duLieuTruoc = daLuu.previous;
    boQuaLanDocDau = daLuu?.cleared === true;
  } catch { /* A damaged or unavailable local store starts with an empty history. */ }
  $('history-status').textContent = '';
  hienThiLichSu();
  if (lichSuCuCanChuyen) luuLichSu();
}

function ghiDuLieu() {
  if (!khoaLichSu || duLieuCu(duLieuThietBi.updatedAt)) return;
  if (boQuaLanDocDau) {
    boQuaLanDocDau = false;
    duLieuTruoc = duLieuThietBi;
    luuLichSu();
    return;
  }
  const thayDoi = cacThayDoiLichSu(duLieuTruoc, duLieuThietBi);
  duLieuTruoc = duLieuThietBi;
  if (thayDoi.length) {
    cacMucLichSu = themLichSu(cacMucLichSu, thayDoi);
    $('history-status').textContent = '';
    hienThiLichSu();
    luuLichSu();
  }
}

function ghiThaoTac(values, outcome) {
  if (!khoaLichSu) return;
  const entry = lichSuThaoTac(values, Date.now(), outcome);
  if (!entry) return;
  cacMucLichSu = themLichSu(cacMucLichSu, [entry]);
  $('history-status').textContent = '';
  hienThiLichSu();
  luuLichSu();
}

for (const [source, label] of [['system', 'hệ thống'], ['user', 'bạn đã nhấn'], ['all', 'toàn bộ']]) {
  $('clear-history-' + source).addEventListener('click', () => {
    if (!locLichSu(cacMucLichSu, source).length ||
      !window.confirm(`Xóa lịch sử ${label} đã lưu trên trình duyệt này?`)) return;
    cacMucLichSu = xoaLichSuTheoNguon(cacMucLichSu, source);
    luuLichSu();
    hienThiLichSu();
    $('history-status').textContent = `Đã xóa lịch sử ${label} trên trình duyệt này.`;
  });
}

function datChu(id, value) {
  const node = $(id);
  if (node.textContent !== value) node.textContent = value;
}

function hienSoDo(id, value, suffix = '') {
  datChu(id, value == null ? '—' : `${value}${suffix}`);
}

function hienThi() {
  const tienDo = tienDoLenh(lenhDangCho, duLieuThietBi);
  if (tienDo === 'applied') { thongBaoLenh = 'ESP32 đã áp dụng lệnh.'; lenhDangCho = null; }
  if (tienDo === 'timeout') { thongBaoLenh = 'ESP32 chưa xác nhận lệnh sau 20 giây. Kiểm tra trạng thái thiết bị.'; lenhDangCho = null; }
  const duLieuQuaCu = duLieuCu(duLieuThietBi.updatedAt);
  const ngoaiTuyen = thietBiNgoaiTuyen(duLieuThietBi.updatedAt);
  const coCanhBao = duLieuThietBi.flameDetected === true || duLieuThietBi.gasAlarm === true;
  const trangThaiKetNoi = `connection-dot ${duLieuQuaCu || coCanhBao ? 'alert' : 'online'}`;
  if ($('connection-dot').className !== trangThaiKetNoi) $('connection-dot').className = trangThaiKetNoi;
  datChu('connection-label', cheDoMoPhong ? 'Mô phỏng trên PC' : ngoaiTuyen ? 'Thiết bị ngoại tuyến' : duLieuQuaCu ? 'Chờ dữ liệu mới' : coCanhBao ? 'Có cảnh báo' : 'Đã kết nối');
  datChu('last-updated', cheDoMoPhong ? 'Dữ liệu mẫu, không kết nối ESP32' : duLieuThietBi.updatedAt == null ? 'Chưa có dữ liệu từ thiết bị' :
    `Cập nhật lúc ${new Date(duLieuThietBi.updatedAt).toLocaleString('vi-VN')}`);

  const badge = $('safe-badge');
  const trangThaiBadge = `badge ${duLieuQuaCu ? 'badge-muted' : coCanhBao ? 'badge-danger' : 'badge-safe'}`;
  if (badge.className !== trangThaiBadge) badge.className = trangThaiBadge;
  datChu('safe-badge', cheDoMoPhong ? coCanhBao ? 'Mô phỏng: cảnh báo' : 'Mô phỏng: an toàn' : duLieuQuaCu ? 'Dữ liệu cũ' : duLieuThietBi.flameDetected && duLieuThietBi.gasAlarm ? 'Cảnh báo lửa và gas' : duLieuThietBi.flameDetected ? 'Cảnh báo lửa' : duLieuThietBi.gasAlarm ? 'Cảnh báo gas' : 'Bình thường');

  hienSoDo('flame-value', duLieuQuaCu || duLieuThietBi.flameDetected == null ? null : duLieuThietBi.flameDetected ? 'Phát hiện' : 'An toàn');
  hienSoDo('gas-alarm-value', duLieuQuaCu || duLieuThietBi.gasAlarm == null ? null : duLieuThietBi.gasAlarm ? 'Phát hiện' : 'An toàn');
  const trangThaiQuat = duLieuQuaCu || duLieuThietBi.fanOn == null ? 'unknown' : duLieuThietBi.fanOn ? 'on' : 'off';
  $('fan-mode').closest('.setting-row').dataset.output = trangThaiQuat;
  hienSoDo('temperature-value', duLieuQuaCu || duLieuThietBi.temperatureC == null ? null : duLieuThietBi.temperatureC.toFixed(1), ' °C');
  hienSoDo('humidity-value', duLieuQuaCu || duLieuThietBi.humidityPct == null ? null : duLieuThietBi.humidityPct.toFixed(1), ' %');
  datChu('temperature-detail', duLieuQuaCu ? 'Dữ liệu cũ từ ESP32' :
    duLieuThietBi.temperatureC == null ? 'Chưa có số đo DHT11 (D27)' : 'Nhiệt độ xung quanh');
  datChu('humidity-detail', duLieuQuaCu ? 'Dữ liệu cũ từ ESP32' :
    duLieuThietBi.humidityPct == null ? 'Chưa có số đo DHT11 (D27)' : 'Độ ẩm tương đối');
  datChu('flame-detail', duLieuQuaCu ? 'Không có dữ liệu mới' : 'Tín hiệu cảm biến lửa');
  datChu('gas-alarm-detail', duLieuQuaCu ? 'Không có dữ liệu mới' :
    duLieuThietBi.gasWarmup ? 'MQ-2 đang làm nóng (~1 phút sau khi cấp nguồn)' : 'Ngưỡng DO trên MQ-2');
  $('flame-value').closest('.metric-card').classList.toggle('alert', !duLieuQuaCu && duLieuThietBi.flameDetected === true);
  $('gas-alarm-value').closest('.metric-card').classList.toggle('alert', !duLieuQuaCu && duLieuThietBi.gasAlarm === true);

  hienThiDieuKhien(duLieuQuaCu, coCanhBao);
}

function moTaQuat(duLieu) {
  const lyDo = { gas: 'Tự bật vì phát hiện gas', purge: 'Thông gió thêm 3 giây sau khi hết gas',
    manual: 'Đang bật bằng tay', blocked: 'Đã dừng quạt vì báo lửa', off: 'Bật tay hoặc tự bật khi có gas' };
  if (duLieu.fanReason) return lyDo[duLieu.fanReason];
  return duLieu.gasAlarm ? 'Tự bật khi có gas' : 'Bật tay hoặc tự bật khi có gas';
}

function hienThiDieuKhien(duLieuQuaCu, coCanhBao) {
  const dangTam = tamTatTatCa(duLieuThietBi);
  const coiDangTatTieng = dangTamTat(duLieuThietBi);
  const logicMoi = laLogicMoi(duLieuThietBi);
  const dangBan = dangGuiLenh;
  $('control-panel').setAttribute('data-sending', String(dangBan));
  const muonBatQuat = lenhDangCho?.values?.fanOn ?? duLieuThietBi.fanOn;
  const choPhepDatQuat = !dangBan && coTheDieuKhien(duLieuThietBi, 'fanOn');
  const hienThiLuaChonQuat = !duLieuQuaCu && !duLieuThietBi.gasAlarm && !dangTam && muonBatQuat != null;
  const cheDoQuatDangCho = lenhDangCho?.requested?.fanOn == null ? null : luaChonQuat;
  const cheDoQuat = muonBatQuat === true ? 'on' : luaChonQuat;
  for (const choice of ['off', 'on', 'auto']) {
    const button = $('fan-' + choice);
    button.disabled = !choPhepDatQuat;
    button.setAttribute('aria-pressed', String(hienThiLuaChonQuat && cheDoQuat === choice));
  }
  $('fan-mode').closest('.setting-row').dataset.pendingOutput = cheDoQuatDangCho === 'on' ? 'on' : cheDoQuatDangCho === 'auto' ? 'auto' : cheDoQuatDangCho === 'off' ? 'off' : '';
  datChu('fan-mode', lenhDangCho?.requested?.fanOn != null ?
    cheDoQuatDangCho === 'auto' ? 'Chờ tự động' : muonBatQuat ? 'Chờ bật' : 'Chờ tắt' :
    duLieuQuaCu || duLieuThietBi.fanOn == null ? 'Chưa có dữ liệu mới' :
      dangTam ? 'Tạm tắt 30 giây' : duLieuThietBi.legacyPwmActive ? 'Cần nạp firmware Bật/Tắt' :
        ['gas', 'purge', 'blocked'].includes(duLieuThietBi.fanReason) ? moTaQuat(duLieuThietBi) :
        duLieuThietBi.gasAlarm ? 'Tự bật khi có gas' : duLieuThietBi.fanOn ? 'Đang bật' : luaChonQuat === 'auto' ? 'Tự động · Đang tắt' : 'Đang tắt');
  datChu('automation-status', 'Tự động: LED xanh khi an toàn, đỏ khi có gas hoặc lửa; còi kêu khi có nguy cơ; quạt tự bật khi có gas và dừng khi có lửa.');
  const conLai = Math.max(0, Math.ceil((duLieuThietBi.muteUntil - Date.now()) / 1000));
  const denDangCho = lenhDangCho?.values?.alarmLedMode != null && lenhDangCho?.values?.statusLedMode != null ?
    luaChonMauDen(lenhDangCho.values) : null;
  const denDuocYeuCau = denDangCho &&
    (lenhDangCho?.requested?.alarmLedMode != null || denDangCho !== luaChonMauDen(duLieuThietBi)) ? denDangCho : null;
  const denDaChon = denDangCho ?? luaChonMauDen(duLieuThietBi);
  const nhanDenDangCho = { auto: 'Chờ tự động', red: 'Chờ chuyển đỏ', green: 'Chờ chuyển xanh', off: 'Chờ tắt' };
  datChu('led-state', denDuocYeuCau ? nhanDenDangCho[denDuocYeuCau] :
    duLieuQuaCu || duLieuThietBi.alarmLedOn == null || duLieuThietBi.statusLedOn == null ? '—' :
    dangTam ? 'Tạm tắt' : duLieuThietBi.alarmLedOn ? coCanhBao ? 'Đang cảnh báo đỏ' : 'Đang sáng đỏ' :
    duLieuThietBi.statusLedOn ? 'Đang sáng xanh' : 'Đang tắt');
  $('led-state').closest('.setting-row').dataset.output =
    duLieuQuaCu || duLieuThietBi.alarmLedOn == null || duLieuThietBi.statusLedOn == null ? 'unknown' :
      duLieuThietBi.alarmLedOn ? 'red' : duLieuThietBi.statusLedOn ? 'green' : 'off';
  $('led-state').closest('.setting-row').dataset.pendingOutput = denDuocYeuCau ?? '';
  for (const choice of ['auto', 'red', 'green', 'off']) {
    const button = $('led-' + choice);
    button.disabled = dangBan || !coTheDieuKhien(duLieuThietBi, 'ledMode');
    button.setAttribute('aria-pressed', String(denDaChon === choice));
  }
  for (const key of cacCheDo) {
    const thucTe = duLieuThietBi[ngoRaCheDo[key]];
    const cheDoYeuCau = lenhDangCho?.requested?.[key];
    datChu(key + '-state', cheDoYeuCau === 'auto' ? 'Chờ tự động' :
      cheDoYeuCau === 'on' ? 'Chờ bật' :
      cheDoYeuCau === 'off' ? 'Chờ tắt' :
      duLieuQuaCu || thucTe == null ? '—' : coiDangTatTieng ? 'Đang tắt tiếng' :
      coCanhBao ? 'Đang cảnh báo' : thucTe ? 'Đang bật' : 'Đang tắt');
    $(key + '-state').closest('.setting-row').dataset.output = duLieuQuaCu || thucTe == null ? 'unknown' : thucTe ? 'on' : 'off';
    $(key + '-state').closest('.setting-row').dataset.pendingOutput = cheDoYeuCau ?? '';
    for (const value of ['auto', 'on', 'off']) {
      const button = $(key + '-' + value);
      button.disabled = dangBan || !coTheDieuKhien(duLieuThietBi, key);
      button.setAttribute('aria-pressed', String((cheDoYeuCau ?? duLieuThietBi[key]) === value));
    }
  }
  $('mute-button').disabled = dangBan || !coTheTamTat(duLieuThietBi);
  datChu('mute-button', coiDangTatTieng ? `Còn ${conLai} giây` : 'Tắt tiếng');
  datChu('mute-description', coiDangTatTieng ? logicMoi ?
    'Còi đang tắt tiếng. Đèn và quạt vẫn theo logic an toàn.' :
    'Đang tạm tắt đầu ra. Cảm biến vẫn được theo dõi.' :
    logicMoi || cheDoMoPhong ? 'Chỉ tắt còi khi đang cảnh báo. Đèn và quạt vẫn theo logic an toàn.' :
    'Firmware cũ: tạm tắt cả còi, đèn và quạt. Nạp firmware mới để chỉ tắt còi.');
  const huongDan = duLieuQuaCu ? 'Cần dữ liệu mới từ ESP32 để điều khiển.' : duLieuThietBi.controlsVersion !== 2 ?
    'Cần nạp firmware mới để dùng điều khiển LED hai màu, còi và tạm tắt.' : dangTam ? 'Các ngõ ra đang tạm tắt. Hết 30 giây sẽ trở lại chế độ trước đó.' :
    coCanhBao ? 'Đang ưu tiên đầu ra cảnh báo. Có thể tắt tiếng còi 30 giây.' : cheDoMoPhong ?
    'Các nút chỉ điều khiển dữ liệu mô phỏng trên PC.' : 'Sẵn sàng nhận lệnh.';
  datChu('command-status', lenhDangCho ? 'Đã gửi lệnh, đang chờ ESP32 xác nhận…' : thongBaoLenh || huongDan);
}

const truongBatBuoc = ['apiKey', 'authDomain', 'databaseURL', 'projectId', 'appId'];
if (cheDoMoPhong) {
  const trangThaiMoPhong = { manualFan: false, gasAlarm: false, flameDetected: false };
  datPhamViLichSu('demo');
  bangDieuKhien.hidden = false;
  $('demo-notice').hidden = false;
  const capNhatMoPhong = () => {
    duLieuThietBi = taoDuLieuMoPhong(trangThaiMoPhong);
    ghiDuLieu();
    for (const [id, active, label] of [
      ['demo-flame', trangThaiMoPhong.flameDetected, 'báo lửa'], ['demo-gas', trangThaiMoPhong.gasAlarm, 'báo gas']
    ]) {
      $(id).setAttribute('aria-pressed', String(active));
      $(id).textContent = `${active ? 'Tắt' : 'Bật'} ${label}`;
    }
    hienThi();
  };
  $('demo-flame').addEventListener('click', () => { trangThaiMoPhong.flameDetected = !trangThaiMoPhong.flameDetected; thongBaoLenh = ''; capNhatMoPhong(); ghiThaoTac({ demoFlame: trangThaiMoPhong.flameDetected }, 'demo'); });
  $('demo-gas').addEventListener('click', () => { trangThaiMoPhong.gasAlarm = !trangThaiMoPhong.gasAlarm; thongBaoLenh = ''; capNhatMoPhong(); ghiThaoTac({ demoGas: trangThaiMoPhong.gasAlarm }, 'demo'); });
  guiLenh = async (values, giaTriGhiSu = values) => {
    Object.assign(trangThaiMoPhong, values);
    trangThaiMoPhong.appliedCommandId = crypto.randomUUID();
    if ('fanOn' in values) trangThaiMoPhong.manualFan = values.fanOn;
    if ('muteRequestedAt' in values) trangThaiMoPhong.muteUntil = Date.now() + 30_000;
    thongBaoLenh = 'Đã áp dụng trong mô phỏng trên PC.';
    capNhatMoPhong();
    ghiThaoTac(giaTriGhiSu, 'demo');
  };
  capNhatMoPhong();
  setInterval(capNhatMoPhong, 1000);
} else if (truongBatBuoc.some(key => !firebaseConfig[key])) {
  thongBaoCauHinh.hidden = false;
} else {
  $('demo-link').hidden = !xemTruocNoiBo;
  const [{ initializeApp }, { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
    setPersistence, browserLocalPersistence, browserSessionPersistence },
    { getDatabase, ref, onValue, update, serverTimestamp }] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/13.0.0/firebase-database.js')
  ]).catch(error => {
    thongBaoCauHinh.hidden = false;
    thongBaoCauHinh.querySelector('strong').textContent = 'Không tải được Firebase';
    thongBaoCauHinh.querySelector('p').textContent = 'Kiểm tra kết nối Internet rồi tải lại trang (F5).';
    throw error;
  });
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  try { $('remember-login').checked = localStorage.getItem('safety-remember-login') === 'true'; }
  catch { /* Keep the unchecked default if preferences are unavailable. */ }
  coSoDuLieu = getDatabase(app);
  function theoDoiThietBi() {
    if (huyTheoDoiDuLieu) huyTheoDoiDuLieu();
    huyTheoDoiDuLieu = onValue(ref(coSoDuLieu, `devices/${deviceId}/telemetry`), snapshot => {
      duLieuThietBi = chuanHoaDuLieu(snapshot.val());
      if (!lenhDangCho) {
        if (duLieuThietBi.fanReason === 'manual') luaChonQuat = 'on';
        else if (['gas', 'purge', 'blocked'].includes(duLieuThietBi.fanReason)) luaChonQuat = 'auto';
      }
      ghiDuLieu();
      hienThi();
    }, error => {
      duLieuThietBi = chuanHoaDuLieu();
      thongBaoLenh = `Không đọc được dữ liệu: ${error.code || 'lỗi kết nối'}`;
      hienThi();
    });
  }

  onAuthStateChanged(auth, user => {
    const daDangNhap = Boolean(user);
    lenhDangCho = null;
    luaChonQuat = 'auto';
    thongBaoLenh = '';
    khungDangNhap.hidden = daDangNhap;
    bangDieuKhien.hidden = !daDangNhap;
    $('sign-out').hidden = !daDangNhap;
    chonTab('overview');
    if (daDangNhap) { datPhamViLichSu(user.uid); theoDoiThietBi(); }
    else {
      if (huyTheoDoiDuLieu) huyTheoDoiDuLieu();
      huyTheoDoiDuLieu = null;
      duLieuThietBi = chuanHoaDuLieu();
      khoaLichSu = '';
      cacMucLichSu = [];
      nguonLichSu = 'all';
      duLieuTruoc = null;
      boQuaLanDocDau = false;
      hienThiLichSu();
      $('connection-dot').className = 'connection-dot';
      $('connection-label').textContent = 'Chưa đăng nhập';
      $('last-updated').textContent = 'Đăng nhập để xem thiết bị';
    }
  });

  $('login-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('login-button');
    button.disabled = true;
    $('login-error').textContent = '';
    try {
      const nhoDangNhap = $('remember-login').checked;
      await setPersistence(auth, nhoDangNhap ? browserLocalPersistence : browserSessionPersistence);
      await signInWithEmailAndPassword(auth, $('email').value.trim(), $('password').value);
      try { localStorage.setItem('safety-remember-login', String(nhoDangNhap)); }
      catch { /* Authentication can still succeed without a daLuu preference. */ }
      $('password').value = '';
    } catch (error) {
      $('login-error').textContent = error.code === 'auth/invalid-credential' ? 'Email hoặc mật khẩu không đúng.' : 'Không đăng nhập được. Kiểm tra cấu hình Firebase và kết nối mạng.';
    } finally {
      button.disabled = false;
    }
  });
  $('sign-out').addEventListener('click', () => signOut(auth));
  guiLenh = async (values, giaTriGhiSu = values) => {
    if (dangGuiLenh) return;
    const maLenh = crypto.randomUUID();
    const truocDo = lenhDangCho?.values ?? duLieuThietBi;
    const cacGiaTriLenh = {
      fanOn: duLieuThietBi.gasAlarm === true ? false : truocDo.fanOn === true,
      alarmLedMode: truocDo.alarmLedMode ?? 'auto',
      statusLedMode: truocDo.statusLedMode ?? 'auto',
      buzzerMode: truocDo.buzzerMode ?? 'auto',
      ...values
    };
    lenhDangCho = { id: maLenh, sentAt: Date.now(), values: cacGiaTriLenh, requested: values };
    dangGuiLenh = true;
    thongBaoLenh = '';
    hienThi();
    try {
      const duLieuGui = { ...cacGiaTriLenh, commandId: maLenh };
      if ('muteRequestedAt' in duLieuGui) duLieuGui.muteRequestedAt = serverTimestamp();
      await update(ref(coSoDuLieu, `devices/${deviceId}/commands`), duLieuGui);
      ghiThaoTac(giaTriGhiSu, 'sent');
    } catch {
      if ('fanOn' in values) luaChonQuat = duLieuThietBi.fanOn ? 'on' : 'auto';
      lenhDangCho = null;
      thongBaoLenh = 'Gửi lệnh thất bại. Kiểm tra kết nối và quyền truy cập Firebase.';
      ghiThaoTac(giaTriGhiSu, 'failed');
    } finally {
      dangGuiLenh = false;
      hienThi();
    }
  };
  setInterval(() => { if (!bangDieuKhien.hidden) hienThi(); }, 1000);
}

$('fan-off').addEventListener('click', () => {
  if (!coTheDieuKhien(duLieuThietBi, 'fanOn')) return;
  luaChonQuat = 'off';
  return guiLenh({ fanOn: false });
});
$('fan-on').addEventListener('click', () => {
  if (!coTheDieuKhien(duLieuThietBi, 'fanOn')) return;
  luaChonQuat = 'on';
  return guiLenh({ fanOn: true });
});
$('fan-auto').addEventListener('click', () => {
  if (!coTheDieuKhien(duLieuThietBi, 'fanOn')) return;
  luaChonQuat = 'auto';
  return guiLenh({ fanOn: false });
});
for (const key of cacCheDo) for (const value of ['auto', 'on', 'off']) {
  $(key + '-' + value).addEventListener('click', () => {
    if (!coTheDieuKhien(duLieuThietBi, key) || !lenhHopLe(key, value)) return;
    return guiLenh({ [key]: value });
  });
}
for (const choice of ['auto', 'red', 'green', 'off']) {
  $('led-' + choice).addEventListener('click', () => {
    if (coTheDieuKhien(duLieuThietBi, 'ledMode') && lenhHopLe('ledMode', choice))
      return guiLenh(lenhDen(choice), { ledMode: choice });
  });
}
$('mute-button').addEventListener('click', () => {
  if (coTheTamTat(duLieuThietBi)) return guiLenh({ muteRequestedAt: true });
});
