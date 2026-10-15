import { firebaseConfig, deviceId, adminUid } from './config.js';
import { normalizeTelemetry, gasPercent, isStale, canSetFan, isLocalDemo, createDemoTelemetry, modeKeys, canControl, canMute, hasAlarm, isMuted, validCommand, commandProgress } from './dashboard-model.js';

const $ = id => document.getElementById(id);
const setupMessage = $('setup-message');
const loginPanel = $('login-panel');
const dashboard = $('dashboard');
const pageUrl = new URL(window.location.href);
const localPreview = ['localhost', '127.0.0.1'].includes(pageUrl.hostname);
const demoMode = isLocalDemo(pageUrl);
let telemetry = normalizeTelemetry();
let unsubscribeTelemetry = null;
let database = null;
let isAdmin = false;
let pending = null;
let sending = false;
let commandMessage = '';
let sendCommand = async () => {};
const modeOutput = { alarmLedMode: 'alarmLedOn', statusLedMode: 'statusLedOn', buzzerMode: 'buzzerOn' };

function showReading(id, value, suffix = '') {
  $(id).textContent = value == null ? '—' : `${value}${suffix}`;
}

function render() {
  const stale = isStale(telemetry.updatedAt);
  const alarm = telemetry.flameDetected === true || telemetry.gasAlarm === true;
  $('connection-dot').className = `connection-dot ${stale ? 'alert' : 'online'}`;
  $('connection-label').textContent = demoMode ? 'Mô phỏng trên PC' : stale ? 'Thiết bị ngoại tuyến' : alarm ? 'Có cảnh báo' : 'Đang kết nối';
  $('last-updated').textContent = demoMode ? 'Dữ liệu mẫu, không kết nối ESP32' : telemetry.updatedAt == null ? 'Chưa có dữ liệu từ thiết bị' :
    `Cập nhật lúc ${new Date(telemetry.updatedAt).toLocaleString('vi-VN')}`;

  const badge = $('safe-badge');
  badge.className = `badge ${stale ? 'badge-muted' : alarm ? 'badge-danger' : 'badge-safe'}`;
  badge.textContent = demoMode ? alarm ? 'Mô phỏng: cảnh báo' : 'Mô phỏng: an toàn' : stale ? 'Dữ liệu cũ' : alarm ? 'Cảnh báo' : 'Bình thường';

  showReading('flame-value', stale || telemetry.flameDetected == null ? null : telemetry.flameDetected ? 'Phát hiện' : 'An toàn');
  showReading('gas-alarm-value', stale || telemetry.gasAlarm == null ? null : telemetry.gasAlarm ? 'Phát hiện' : 'An toàn');
  showReading('fan-value', stale || telemetry.fanOn == null ? null : telemetry.fanOn ? 'Đang bật' : 'Đang tắt');
  showReading('temperature-value', stale || telemetry.temperatureC == null ? null : telemetry.temperatureC.toFixed(1), ' °C');
  showReading('humidity-value', stale || telemetry.humidityPct == null ? null : telemetry.humidityPct.toFixed(1), ' %');
  $('temperature-detail').textContent = telemetry.temperatureC == null ? 'Chưa có dữ liệu DHT11' : 'Nhiệt độ xung quanh';
  $('humidity-detail').textContent = telemetry.humidityPct == null ? 'Chưa có dữ liệu DHT11' : 'Độ ẩm tương đối';
  $('flame-detail').textContent = stale ? 'Không có dữ liệu mới' : 'Tín hiệu cảm biến lửa';
  $('gas-alarm-detail').textContent = stale ? 'Không có dữ liệu mới' : 'Ngưỡng DO trên MQ-2';
  $('fan-detail').textContent = demoMode ? 'Trạng thái mô phỏng' : stale ? 'Không có dữ liệu mới' : 'Trạng thái ngõ ra D32–D33';
  $('flame-value').closest('.metric-card').classList.toggle('alert', !stale && telemetry.flameDetected === true);
  $('gas-alarm-value').closest('.metric-card').classList.toggle('alert', !stale && telemetry.gasAlarm === true);

  const raw = stale ? null : telemetry.gasRaw;
  const percent = gasPercent(raw);
  showReading('gas-percent', percent, '%');
  $('gas-raw').textContent = `Giá trị ADC: ${raw == null ? '—' : raw} / 4095`;
  $('gas-fill').style.width = `${percent ?? 0}%`;
  $('gas-meter').setAttribute('aria-valuenow', String(percent ?? 0));
  $('gas-meter').setAttribute('aria-valuetext', percent == null ? 'Chưa có dữ liệu' : `${percent}% tín hiệu ADC`);

  renderControls(stale, alarm);
}

function renderControls(stale, alarm) {
  const muted = isMuted(telemetry);
  const disabled = telemetry.alarmDisabled === true;
  const progress = commandProgress(pending, telemetry);
  if (progress === 'applied') { commandMessage = 'ESP32 đã áp dụng lệnh.'; pending = null; }
  if (progress === 'timeout') { commandMessage = 'Chưa nhận xác nhận từ ESP32 sau 20 giây. Kiểm tra trạng thái trước khi thử lại.'; pending = null; }
  const busy = sending || pending != null;
  $('fan-button').disabled = busy || !canControl(telemetry, 'fanOn');
  $('fan-button').textContent = telemetry.fanOn ? 'Tắt quạt' : 'Bật quạt';
  $('fan-mode').textContent = stale || telemetry.fanOn == null ? 'Chưa có dữ liệu mới' : telemetry.fanOn ? 'Ngõ ra đang bật' : 'Ngõ ra đang tắt';
  $('automation-status').textContent = disabled ? 'Cảnh báo tự động đã bị Admin tắt. Đang dùng điều khiển thủ công.' :
    'Cảm biến được ưu tiên khi có cảnh báo. Quạt tự bật khi phát hiện gas.';
  $('suppression-banner').hidden = !muted && !disabled;
  $('suppression-banner').textContent = muted ? `Đang tạm tắt tất cả · còn ${Math.max(0, Math.ceil((telemetry.muteUntil - Date.now()) / 1000))} giây.` :
    'Admin đã tắt cảnh báo tự động. Hệ thống sẽ không tự bật còi, đèn hoặc quạt khi phát hiện nguy cơ.';
  for (const key of modeKeys) {
    const actual = telemetry[modeOutput[key]];
    $(key + '-state').textContent = stale || actual == null ? '—' : muted ? 'Tạm tắt' :
      alarm && !disabled && key !== 'statusLedMode' ? 'Đang cảnh báo' : actual ? 'Đang bật' : 'Đang tắt';
    for (const value of ['auto', 'on', 'off']) {
      const button = $(key + '-' + value);
      button.disabled = busy || !canControl(telemetry, key);
      button.setAttribute('aria-pressed', String(telemetry[key] === value));
    }
  }
  const speedAllowed = canControl(telemetry, 'fanSpeedPct');
  $('fan-speed').disabled = !speedAllowed || busy;
  $('speed-button').disabled = !speedAllowed || busy;
  $('speed-help').textContent = telemetry.fanSpeedSupported === true ? demoMode ?
    'Mô phỏng PWM trên PC. Relay thực tế chỉ bật/tắt được.' : 'Mức PWM điều khiển; không phải tốc độ RPM đo được.' :
    'Relay 5V chỉ hỗ trợ bật/tắt. Cần mạch công suất PWM để chỉnh tốc độ.';
  $('fan-speed-value').textContent = telemetry.fanSpeedSupported === true && !stale ? `${telemetry.fanSpeedPct ?? 0}%` : 'Bật / Tắt';
  $('mute-button').disabled = busy || !canMute(telemetry);
  $('admin-controls').hidden = !isAdmin;
  $('admin-toggle').disabled = busy || stale || telemetry.controlsVersion !== 2;
  $('admin-toggle').textContent = disabled ? 'Bật lại cảnh báo tự động' : 'Tắt cảnh báo tự động';
  const help = stale ? 'Cần dữ liệu mới từ ESP32 để điều khiển.' : telemetry.controlsVersion !== 2 ?
    'Cần nạp firmware mới để dùng điều khiển đèn, còi và tạm tắt.' : muted ? 'Các ngõ ra đang tạm tắt. Hết 30 giây sẽ trở lại chế độ trước đó.' :
    alarm && !disabled ? 'Đang ưu tiên cảnh báo. Có thể tạm tắt tất cả 30 giây.' : demoMode ?
    'Các nút chỉ điều khiển dữ liệu mô phỏng trên PC.' : 'Sẵn sàng nhận lệnh.';
  $('command-status').textContent = pending ? 'Đã gửi lệnh, đang chờ ESP32 xác nhận…' : commandMessage || help;
}

const required = ['apiKey', 'authDomain', 'databaseURL', 'projectId', 'appId'];
if (demoMode) {
  const demoState = { manualFan: false, gasAlarm: false, flameDetected: false };
  isAdmin = true;
  dashboard.hidden = false;
  $('demo-notice').hidden = false;
  const updateDemo = () => {
    telemetry = createDemoTelemetry(demoState);
    for (const [id, active, label] of [
      ['demo-flame', demoState.flameDetected, 'báo lửa'], ['demo-gas', demoState.gasAlarm, 'báo gas']
    ]) {
      $(id).setAttribute('aria-pressed', String(active));
      $(id).textContent = `${active ? 'Tắt' : 'Bật'} ${label}`;
    }
    render();
  };
  $('demo-flame').addEventListener('click', () => { demoState.flameDetected = !demoState.flameDetected; commandMessage = ''; updateDemo(); });
  $('demo-gas').addEventListener('click', () => { demoState.gasAlarm = !demoState.gasAlarm; commandMessage = ''; updateDemo(); });
  sendCommand = async values => {
    Object.assign(demoState, values);
    if ('fanOn' in values) demoState.manualFan = values.fanOn;
    if ('muteRequestedAt' in values) demoState.muteUntil = Date.now() + 30_000;
    commandMessage = 'Đã áp dụng trong mô phỏng trên PC.';
    updateDemo();
  };
  updateDemo();
  setInterval(updateDemo, 1000);
} else if (required.some(key => !firebaseConfig[key])) {
  setupMessage.hidden = false;
} else {
  $('demo-link').hidden = !localPreview;
  const [{ initializeApp }, { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut },
    { getDatabase, ref, onValue, update, serverTimestamp }] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/13.0.0/firebase-database.js')
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  database = getDatabase(app);
  function watchDevice() {
    if (unsubscribeTelemetry) unsubscribeTelemetry();
    unsubscribeTelemetry = onValue(ref(database, `devices/${deviceId}/telemetry`), snapshot => {
      telemetry = normalizeTelemetry(snapshot.val());
      render();
    }, error => {
      telemetry = normalizeTelemetry();
      $('command-status').textContent = `Không đọc được dữ liệu: ${error.code || 'lỗi kết nối'}`;
      render();
    });
  }

  onAuthStateChanged(auth, user => {
    const loggedIn = Boolean(user);
    isAdmin = user?.uid === adminUid;
    pending = null;
    commandMessage = '';
    $('admin-controls').hidden = !isAdmin;
    loginPanel.hidden = loggedIn;
    dashboard.hidden = !loggedIn;
    $('sign-out').hidden = !loggedIn;
    if (loggedIn) watchDevice();
    else {
      if (unsubscribeTelemetry) unsubscribeTelemetry();
      unsubscribeTelemetry = null;
      telemetry = normalizeTelemetry();
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
      await signInWithEmailAndPassword(auth, $('email').value.trim(), $('password').value);
      $('password').value = '';
    } catch (error) {
      $('login-error').textContent = error.code === 'auth/invalid-credential' ? 'Email hoặc mật khẩu không đúng.' : 'Không đăng nhập được. Kiểm tra cấu hình Firebase và kết nối mạng.';
    } finally {
      button.disabled = false;
    }
  });
  $('sign-out').addEventListener('click', () => signOut(auth));
  sendCommand = async values => {
    if (sending || pending) return;
    const commandId = crypto.randomUUID();
    pending = { id: commandId, sentAt: Date.now() };
    sending = true;
    commandMessage = '';
    render();
    try {
      const payload = { ...values, commandId };
      if ('muteRequestedAt' in payload) payload.muteRequestedAt = serverTimestamp();
      await update(ref(database, `devices/${deviceId}/commands`), payload);
    } catch {
      pending = null;
      commandMessage = 'Gửi lệnh thất bại. Kiểm tra kết nối và quyền truy cập Firebase.';
    } finally {
      sending = false;
      render();
    }
  };
  setInterval(() => { if (!dashboard.hidden) render(); }, 1000);
}

$('fan-button').addEventListener('click', () => {
  if (canControl(telemetry, 'fanOn')) return sendCommand({ fanOn: !telemetry.fanOn });
});
for (const key of modeKeys) for (const value of ['auto', 'on', 'off']) {
  $(key + '-' + value).addEventListener('click', () => {
    if (canControl(telemetry, key) && validCommand(key, value)) return sendCommand({ [key]: value });
  });
}
$('fan-speed').addEventListener('input', () => { $('fan-speed-value').textContent = `${$('fan-speed').value}% (chưa áp dụng)`; });
$('speed-button').addEventListener('click', () => {
  const value = Number($('fan-speed').value);
  if (canControl(telemetry, 'fanSpeedPct') && validCommand('fanSpeedPct', value)) return sendCommand({ fanSpeedPct: value, fanOn: value > 0 });
});
$('mute-button').addEventListener('click', () => {
  if (canMute(telemetry)) return sendCommand({ muteRequestedAt: true });
});
$('admin-toggle').addEventListener('click', () => {
  if (!isAdmin || isStale(telemetry.updatedAt) || telemetry.controlsVersion !== 2) return;
  const alarmDisabled = !telemetry.alarmDisabled;
  return sendCommand(alarmDisabled ? { alarmDisabled, fanOn: false, alarmLedMode: 'off', statusLedMode: 'off', buzzerMode: 'off' } : { alarmDisabled });
});
