import { firebaseConfig, deviceId } from './config.js';
import { normalizeTelemetry, gasPercent, isStale, canSetFan } from './dashboard-model.js';

const $ = id => document.getElementById(id);
const setupMessage = $('setup-message');
const loginPanel = $('login-panel');
const dashboard = $('dashboard');
let telemetry = normalizeTelemetry();
let unsubscribeTelemetry = null;
let database = null;

function showReading(id, value, suffix = '') {
  $(id).textContent = value == null ? '—' : `${value}${suffix}`;
}

function render() {
  const stale = isStale(telemetry.updatedAt);
  const alarm = telemetry.flameDetected === true || telemetry.gasAlarm === true;
  $('connection-dot').className = `connection-dot ${stale ? 'alert' : 'online'}`;
  $('connection-label').textContent = stale ? 'Thiết bị ngoại tuyến' : alarm ? 'Có cảnh báo' : 'Đang kết nối';
  $('last-updated').textContent = telemetry.updatedAt == null ? 'Chưa có dữ liệu từ thiết bị' :
    `Cập nhật lúc ${new Date(telemetry.updatedAt).toLocaleString('vi-VN')}`;

  const badge = $('safe-badge');
  badge.className = `badge ${stale ? 'badge-muted' : alarm ? 'badge-danger' : 'badge-safe'}`;
  badge.textContent = stale ? 'Dữ liệu cũ' : alarm ? 'Cảnh báo' : 'Bình thường';

  showReading('flame-value', stale || telemetry.flameDetected == null ? null : telemetry.flameDetected ? 'Phát hiện' : 'An toàn');
  showReading('gas-alarm-value', stale || telemetry.gasAlarm == null ? null : telemetry.gasAlarm ? 'Phát hiện' : 'An toàn');
  showReading('fan-value', stale || telemetry.fanOn == null ? null : telemetry.fanOn ? 'Đang bật' : 'Đang tắt');
  showReading('temperature-value', stale || telemetry.temperatureC == null ? null : telemetry.temperatureC.toFixed(1), ' °C');
  showReading('humidity-value', stale || telemetry.humidityPct == null ? null : telemetry.humidityPct.toFixed(1), ' %');
  $('temperature-detail').textContent = telemetry.temperatureC == null ? 'Chưa có dữ liệu DHT11' : 'Nhiệt độ xung quanh';
  $('humidity-detail').textContent = telemetry.humidityPct == null ? 'Chưa có dữ liệu DHT11' : 'Độ ẩm tương đối';
  $('flame-detail').textContent = stale ? 'Không có dữ liệu mới' : 'Tín hiệu cảm biến lửa';
  $('gas-alarm-detail').textContent = stale ? 'Không có dữ liệu mới' : 'Ngưỡng DO trên MQ-2';
  $('fan-detail').textContent = stale ? 'Không có dữ liệu mới' : 'Trạng thái relay thực tế';
  $('flame-value').closest('.metric-card').classList.toggle('alert', !stale && telemetry.flameDetected === true);
  $('gas-alarm-value').closest('.metric-card').classList.toggle('alert', !stale && telemetry.gasAlarm === true);

  const raw = stale ? null : telemetry.gasRaw;
  const percent = gasPercent(raw);
  showReading('gas-percent', percent, '%');
  $('gas-raw').textContent = `Giá trị ADC: ${raw == null ? '—' : raw} / 4095`;
  $('gas-fill').style.width = `${percent ?? 0}%`;
  $('gas-meter').setAttribute('aria-valuenow', String(percent ?? 0));
  $('gas-meter').setAttribute('aria-valuetext', percent == null ? 'Chưa có dữ liệu' : `${percent}% tín hiệu ADC`);

  const allowed = canSetFan(telemetry);
  $('fan-button').disabled = !allowed || telemetry.fanOn == null;
  $('fan-button').textContent = telemetry.fanOn ? 'Tắt quạt' : 'Bật quạt';
  $('fan-mode').textContent = stale ? 'Thiết bị ngoại tuyến' : alarm ? 'Đang có cảnh báo' :
    telemetry.fanOn == null ? 'Chưa có trạng thái' : telemetry.fanOn ? 'Relay đang bật' : 'Relay đang tắt';
  if (!allowed) $('command-status').textContent = stale ? 'Cần dữ liệu mới từ thiết bị để điều khiển.' : 'Điều khiển thủ công bị khóa khi có cảnh báo.';
}

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

const required = ['apiKey', 'authDomain', 'databaseURL', 'projectId', 'appId'];
if (required.some(key => !firebaseConfig[key])) {
  setupMessage.hidden = false;
} else {
  const [{ initializeApp }, { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut },
    { getDatabase, ref, onValue, set }] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/13.0.0/firebase-database.js')
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  database = getDatabase(app);
  onAuthStateChanged(auth, user => {
    const loggedIn = Boolean(user);
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
  $('fan-button').addEventListener('click', async () => {
    if (!canSetFan(telemetry) || telemetry.fanOn == null) return;
    const desired = !telemetry.fanOn;
    const button = $('fan-button');
    button.disabled = true;
    $('command-status').textContent = 'Đang gửi lệnh đến thiết bị…';
    try {
      await set(ref(database, `devices/${deviceId}/commands/fanOn`), desired);
      $('command-status').textContent = 'Đã gửi lệnh. Đang chờ ESP32 cập nhật trạng thái relay.';
    } catch {
      $('command-status').textContent = 'Gửi lệnh thất bại. Kiểm tra quyền truy cập Firebase.';
    } finally {
      render();
    }
  });
  setInterval(() => { if (!dashboard.hidden) render(); }, 1000);
}
