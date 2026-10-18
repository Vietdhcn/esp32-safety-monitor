import { firebaseConfig, deviceId, ownerUid } from './config.js?v=20261018-1';
import { chuanHoaDuLieu, duLieuCu, thietBiNgoaiTuyen, laMoPhongNoiBo, taoDuLieuMoPhong, cacCheDo, luaChonMauDen, lenhDen, coTheDieuKhien, coTheTamTat, dangTamTat, tamTatTatCa, laLogicMoi, lenhHopLe, tienDoLenh, loiCauHinhWifi } from './dashboard-model.js?v=20261018-6';
import { cacThayDoiLichSu, themLichSu, lichSuThaoTac, locLichSu, khoangNgayBaoCao, xoaLichSuTheoNguon, lamSachLichSuHeThongCu, mauDoLichSu, thongKeLichSu, duongBieuDo, nhomCanhBaoTheoNgay, trungBinhMauTheoNgay } from './history-model.js?v=20261018-6';
import { taoKhoMauLichSu } from './history-samples-store.js?v=20261018-2';
import { taiLichSuTheoThietBi } from './history-device-store.js?v=20261018-1';

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
let chuSoHuuDangNhap = false;
let wifiDangCho = null;
let thongBaoWifi = '';
let loiWifi = false;
let wifiListKey = '';
let wifiSecretKey = '';
let huyTheoDoiWifiReveal = null;
let wifiRevealRequest = null;
let wifiRevealed = null;
let wifiRevealTimer = null;
let wifiRevealMessage = '';
let wifiRevealError = false;
let guiLenh = async () => {};
let khoaLichSu = '';
let cacMucLichSu = [];
let nguonLichSu = 'all';
let ngayLichSu = '';
let khoMauLichSu = null;
let trangLichSu = 1;
let phutMauCuoi = null;
let coMauLichSu = false;
let lanTaiBieuDo = 0;
let phamViBieuDo = 'today';
let ngayBaoCaoTu = '';
let ngayBaoCaoDen = '';
let taiKhoanLichSu = null;
let duLieuTruoc = null;
let boQuaLanDocDau = false;
const ngoRaCheDo = { buzzerMode: 'buzzerOn' };
const tenCacTab = ['overview', 'history', 'account'];

function chonTab(name, focus = false) {
  for (const tabName of tenCacTab) {
    const active = tabName === name;
    const tab = $(`tab-${tabName}`);
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    $(`${tabName}-view`).hidden = !active;
    if (active && focus) tab.focus();
  }
  if (name === 'history') void hienThiBangLichSu();
}
for (const name of tenCacTab) {
  const tab = $(`tab-${name}`);
  tab.addEventListener('click', () => {
    chonTab(name);
  });
  tab.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tabs = tenCacTab.filter(tabName => !$(`tab-${tabName}`).hidden);
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 :
      (tabs.indexOf(name) + (event.key === 'ArrowLeft' ? -1 : 1) + tabs.length) % tabs.length;
    const next = tabs[nextIndex];
    chonTab(next, true);
  });
}

const dinhDangNgayGio = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'medium' });
const dinhDangNgay = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short' });
const dinhDangGioPhut = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' });
function capNhatDongHo() {
  const now = new Date();
  $('current-time').textContent = new Intl.DateTimeFormat('vi-VN', { timeStyle: 'medium' }).format(now);
  $('current-date').textContent = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }).format(now);
}
capNhatDongHo();
setInterval(capNhatDongHo, 1000);

function luuLichSu() {
  try { localStorage.setItem(khoaLichSu, JSON.stringify({ version: 4, items: cacMucLichSu, previous: duLieuTruoc, cleared: cacMucLichSu.length === 0 })); }
  catch { $('history-status').textContent = 'Không thể lưu lịch sử trên trình duyệt này.'; }
}

function hienThiLichSu() {
  const list = $('history-list');
  list.replaceChildren();
  const allVisible = locLichSu(cacMucLichSu, nguonLichSu, ngayLichSu);
  const totalPages = Math.max(1, Math.ceil(allVisible.length / 50));
  trangLichSu = Math.min(trangLichSu, totalPages);
  const visible = allVisible.slice((trangLichSu - 1) * 50, trangLichSu * 50);
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
    sourceLabel.textContent = source === 'user' ? 'Người dùng' : 'Hệ thống';
    heading.append(title, sourceLabel);
    const time = document.createElement('time');
    time.dateTime = new Date(entry.at).toISOString();
    time.textContent = dinhDangNgayGio.format(new Date(entry.at));
    content.append(heading);
    if (source === 'user') {
      const detail = document.createElement('p');
      const actor = entry.actorEmail || (entry.actorUid ?
        entry.actorUid === taiKhoanLichSu?.uid ? 'Tài khoản hiện tại' : 'Tài khoản khác' : '');
      detail.textContent = actor ? `${actor} · ${entry.detail}` : entry.detail;
      content.append(detail);
    }
    item.append(marker, content, time);
    list.append(item);
  }
  $('history-empty').hidden = visible.length > 0;
  $('history-pages').hidden = totalPages <= 1;
  $('history-page-prev').disabled = trangLichSu <= 1;
  $('history-page-next').disabled = trangLichSu >= totalPages;
  datChu('history-page-label', `Trang ${trangLichSu} / ${totalPages}`);
  $('history-empty').textContent = ngayLichSu ? 'Không có hoạt động trong ngày đã chọn.' :
    nguonLichSu === 'user' ? 'Chưa có thao tác nào của người dùng.' :
    nguonLichSu === 'system' ? 'Chưa có sự kiện hệ thống nào.' : 'Chưa có hoạt động nào được ghi lại.';
  $('clear-history-all').disabled = cacMucLichSu.length === 0 && !coMauLichSu;
  $('clear-history-system').disabled = locLichSu(cacMucLichSu, 'system').length === 0;
  $('clear-history-user').disabled = locLichSu(cacMucLichSu, 'user').length === 0;
  $('history-count').textContent = String(cacMucLichSu.length);
  $('history-system-count').textContent = String(locLichSu(cacMucLichSu, 'system', ngayLichSu).length);
  $('history-user-count').textContent = String(locLichSu(cacMucLichSu, 'user', ngayLichSu).length);
  $('history-date-clear').disabled = !ngayLichSu;
  for (const source of ['all', 'system', 'user']) {
    $('history-filter-' + source).setAttribute('aria-pressed', String(nguonLichSu === source));
  }
}

for (const event of ['input', 'change']) $('history-date').addEventListener(event, () => {
  if (ngayLichSu === $('history-date').value) return;
  ngayLichSu = $('history-date').value;
  trangLichSu = 1;
  $('history-card').scrollTop = 0;
  hienThiLichSu();
});
$('history-date-clear').addEventListener('click', () => {
  $('history-date').value = '';
  ngayLichSu = '';
  trangLichSu = 1;
  $('history-card').scrollTop = 0;
  hienThiLichSu();
  $('history-date').focus();
});

for (const source of ['all', 'system', 'user']) {
  $('history-filter-' + source).addEventListener('click', () => {
    nguonLichSu = source;
    trangLichSu = 1;
    hienThiLichSu();
  });
}

$('history-page-prev').addEventListener('click', () => {
  if (trangLichSu <= 1) return;
  trangLichSu--;
  hienThiLichSu();
});
$('history-page-next').addEventListener('click', () => {
  trangLichSu++;
  hienThiLichSu();
});

function hienThiTyLeBieuDo(id, stats, unit) {
  const labels = $(id).children;
  if (!stats.count) {
    for (const label of labels) label.textContent = '—';
    return;
  }
  const top = stats.min + Math.max(stats.max - stats.min, 1);
  for (const [index, value] of [top, (top + stats.min) / 2, stats.min].entries())
    labels[index].textContent = `${value.toFixed(1)} ${unit}`;
}

function hienThiDiemTrungBinh(id, samples, key, stats, unit, from, to, perMinute) {
  const group = $(id);
  group.replaceChildren();
  if (perMinute || !stats.count) return;
  const span = Math.max(stats.max - stats.min, 1);
  const timeSpan = Math.max(to - from, 1);
  for (const sample of samples) {
    if (!Number.isFinite(sample[key])) continue;
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', (10 + (sample.at - from) / timeSpan * 580).toFixed(1));
    circle.setAttribute('cy', (140 - (sample[key] - stats.min) / span * 120).toFixed(1));
    circle.setAttribute('r', '4');
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = `${dinhDangNgay.format(new Date(sample.at))}: trung bình ${sample[key].toFixed(1)} ${unit}`;
    circle.append(title);
    group.append(circle);
  }
}

const tenKhoangBaoCao = { today: 'Hôm nay', yesterday: 'Hôm qua', week: '1 tuần', month: '1 tháng' };
const bangNgayBaoCao = $('history-range-dialog');
let cheDoBanNhap = 'today';
let ngayBanNhapTu = '';
let ngayBanNhapDen = '';
let thangLich = new Date();

function chuoiNgayLich(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function tenKhoangDangChon() {
  if (phamViBieuDo !== 'custom') return tenKhoangBaoCao[phamViBieuDo];
  const hienNgay = day => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
  const from = hienNgay(ngayBaoCaoTu);
  const to = hienNgay(ngayBaoCaoDen);
  return from === to ? from : `${from} – ${to}`;
}

function hienThiBangChonNgay() {
  const today = khoangNgayBaoCao('today').fromDay;
  for (const mode of ['today', 'yesterday', 'week', 'month', 'custom'])
    $(`history-range-preset-${mode}`).setAttribute('aria-pressed', String(cheDoBanNhap === mode));
  $('history-range-from').value = ngayBanNhapTu;
  $('history-range-to').value = ngayBanNhapDen;
  $('history-range-from').max = today;
  $('history-range-to').max = today;
  $('history-calendar-month').textContent = `Tháng ${thangLich.getMonth() + 1} / ${thangLich.getFullYear()}`;
  const currentMonth = new Date();
  currentMonth.setDate(1);
  currentMonth.setHours(0, 0, 0, 0);
  $('history-calendar-next').disabled = thangLich.getTime() >= currentMonth.getTime();
  const first = new Date(thangLich.getFullYear(), thangLich.getMonth(), 1);
  first.setDate(first.getDate() - (first.getDay() + 6) % 7);
  const cells = [];
  for (let offset = 0; offset < 42; offset++) {
    const date = new Date(first);
    date.setDate(date.getDate() + offset);
    const day = chuoiNgayLich(date);
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = String(date.getDate());
    button.dataset.date = day;
    button.dataset.outside = String(date.getMonth() !== thangLich.getMonth());
    button.dataset.between = String(Boolean(ngayBanNhapTu && ngayBanNhapDen && day > ngayBanNhapTu && day < ngayBanNhapDen));
    button.dataset.today = String(day === today);
    button.disabled = day > today;
    button.setAttribute('aria-label', dinhDangNgay.format(date));
    button.setAttribute('aria-pressed', String(day === ngayBanNhapTu || day === ngayBanNhapDen));
    button.addEventListener('click', () => {
      if (cheDoBanNhap !== 'custom' || (ngayBanNhapTu && ngayBanNhapDen)) {
        ngayBanNhapTu = day;
        ngayBanNhapDen = '';
      } else if (day < ngayBanNhapTu) {
        ngayBanNhapDen = ngayBanNhapTu;
        ngayBanNhapTu = day;
      } else ngayBanNhapDen = day;
      cheDoBanNhap = 'custom';
      $('history-range-error').textContent = '';
      hienThiBangChonNgay();
      $('history-calendar-days').querySelector(`[data-date="${day}"]`)?.focus({ preventScroll: true });
    });
    button.addEventListener('keydown', event => {
      const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
      if (!delta) return;
      event.preventDefault();
      const next = new Date(date);
      next.setDate(next.getDate() + delta);
      if (chuoiNgayLich(next) > today) return;
      thangLich = new Date(next.getFullYear(), next.getMonth(), 1);
      hienThiBangChonNgay();
      $('history-calendar-days').querySelector(`[data-date="${chuoiNgayLich(next)}"]`)?.focus({ preventScroll: true });
    });
    cells.push(button);
  }
  $('history-calendar-days').replaceChildren(...cells);
}

$('history-range-open').addEventListener('click', () => {
  const current = khoangNgayBaoCao(phamViBieuDo, Date.now(), ngayBaoCaoTu, ngayBaoCaoDen);
  cheDoBanNhap = phamViBieuDo;
  ngayBanNhapTu = current.fromDay;
  ngayBanNhapDen = current.toDay;
  const end = new Date(current.to);
  thangLich = new Date(end.getFullYear(), end.getMonth(), 1);
  $('history-range-error').textContent = '';
  hienThiBangChonNgay();
  bangNgayBaoCao.showModal();
});
for (const mode of ['today', 'yesterday', 'week', 'month', 'custom']) {
  $(`history-range-preset-${mode}`).addEventListener('click', () => {
    cheDoBanNhap = mode;
    if (mode !== 'custom') {
      const range = khoangNgayBaoCao(mode);
      ngayBanNhapTu = range.fromDay;
      ngayBanNhapDen = range.toDay;
      const end = new Date(range.to);
      thangLich = new Date(end.getFullYear(), end.getMonth(), 1);
    }
    $('history-range-error').textContent = '';
    hienThiBangChonNgay();
  });
}
for (const id of ['from', 'to']) $('history-range-' + id).addEventListener('change', () => {
  ngayBanNhapTu = $('history-range-from').value;
  ngayBanNhapDen = $('history-range-to').value;
  cheDoBanNhap = 'custom';
  const anchor = ngayBanNhapDen || ngayBanNhapTu;
  if (anchor) {
    const date = new Date(`${anchor}T00:00:00`);
    if (!Number.isNaN(date.getTime())) thangLich = new Date(date.getFullYear(), date.getMonth(), 1);
  }
  $('history-range-error').textContent = '';
  hienThiBangChonNgay();
});
for (const [id, delta] of [['prev', -1], ['next', 1]])
  $(`history-calendar-${id}`).addEventListener('click', () => {
    thangLich = new Date(thangLich.getFullYear(), thangLich.getMonth() + delta, 1);
    hienThiBangChonNgay();
  });
$('history-range-apply').addEventListener('click', () => {
  try {
    const selected = khoangNgayBaoCao(cheDoBanNhap, Date.now(), ngayBanNhapTu, ngayBanNhapDen);
    phamViBieuDo = cheDoBanNhap;
    ngayBaoCaoTu = selected.fromDay;
    ngayBaoCaoDen = selected.toDay;
    $('history-range-open').textContent = tenKhoangDangChon();
    bangNgayBaoCao.close();
    void hienThiBangLichSu();
  } catch (error) { $('history-range-error').textContent = error.message; }
});
for (const id of ['close', 'cancel'])
  $(`history-range-${id}`).addEventListener('click', () => bangNgayBaoCao.close());
bangNgayBaoCao.addEventListener('close', () => $('history-range-open').focus({ preventScroll: true }));
bangNgayBaoCao.addEventListener('click', event => {
  if (event.target === bangNgayBaoCao) bangNgayBaoCao.close();
});

async function hienThiBangLichSu() {
  if (!khoMauLichSu) return;
  const token = ++lanTaiBieuDo;
  const range = khoangNgayBaoCao(phamViBieuDo, Date.now(), ngayBaoCaoTu, ngayBaoCaoDen);
  const { from: oldestAllowed, to, perMinute } = range;
  const firstDay = new Date(oldestAllowed);
  try {
    const [samples, hasAny] = await Promise.all([khoMauLichSu.range(oldestAllowed, to), khoMauLichSu.hasAny()]);
    if (token !== lanTaiBieuDo) return;
    const recentAlerts = cacMucLichSu.filter(entry => entry.at >= oldestAllowed && entry.at <= to &&
      entry.source !== 'user' && ['Phát hiện lửa', 'Phát hiện khí gas'].includes(entry.title));
    coMauLichSu = hasAny;
    $('clear-history-all').disabled = cacMucLichSu.length === 0 && !coMauLichSu;
    const summary = thongKeLichSu(samples, cacMucLichSu, oldestAllowed, to);
    const chartSamples = perMinute ? samples : trungBinhMauTheoNgay(samples, oldestAllowed, to);
    const chartStats = thongKeLichSu(chartSamples, [], oldestAllowed, to);
    const format = (value, unit) => value == null ? '—' : `${value.toFixed(1)} ${unit}`;
    datChu('history-temp-current', format(summary.temperature.latest, '°C'));
    datChu('history-humidity-current', format(summary.humidity.latest, '%'));
    datChu('history-temp-range', summary.temperature.count ?
      `${summary.temperature.min.toFixed(1)}–${summary.temperature.max.toFixed(1)} °C` : 'Chưa có dữ liệu');
    datChu('history-humidity-range', summary.humidity.count ?
      `${summary.humidity.min.toFixed(1)}–${summary.humidity.max.toFixed(1)} %` : 'Chưa có dữ liệu');
    const averageLabel = perMinute ? 'Trung bình' : 'TB các ngày';
    datChu('history-temp-average', chartStats.temperature.count ? `${averageLabel} ${format(chartStats.temperature.average, '°C')}` : '—');
    datChu('history-humidity-average', chartStats.humidity.count ? `${averageLabel} ${format(chartStats.humidity.average, '%')}` : '—');
    hienThiTyLeBieuDo('history-temp-scale', chartStats.temperature, '°C');
    hienThiTyLeBieuDo('history-humidity-scale', chartStats.humidity, '%');
    const chartGap = perMinute ? 10 * 60_000 : 36 * 60 * 60_000;
    $('history-temp-line').setAttribute('d', duongBieuDo(chartSamples, 'temperatureC', oldestAllowed, to, chartGap));
    $('history-humidity-line').setAttribute('d', duongBieuDo(chartSamples, 'humidityPct', oldestAllowed, to, chartGap));
    hienThiDiemTrungBinh('history-temp-points', chartSamples, 'temperatureC', chartStats.temperature, '°C', oldestAllowed, to, perMinute);
    hienThiDiemTrungBinh('history-humidity-points', chartSamples, 'humidityPct', chartStats.humidity, '%', oldestAllowed, to, perMinute);
    for (const axis of document.querySelectorAll('.history-chart-axis')) {
      axis.querySelector('.history-axis-start').textContent = perMinute ? '00:00' :
        `${String(firstDay.getDate()).padStart(2, '0')}/${String(firstDay.getMonth() + 1).padStart(2, '0')}`;
      axis.querySelector('.history-axis-end').textContent = perMinute ? dinhDangGioPhut.format(new Date(to)) :
        `${String(new Date(to).getDate()).padStart(2, '0')}/${String(new Date(to).getMonth() + 1).padStart(2, '0')}`;
    }
    const periodText = { today: 'hôm nay', yesterday: 'hôm qua', week: '7 ngày gần đây', month: '30 ngày gần đây', custom: 'khoảng đã chọn' }[phamViBieuDo];
    datChu('history-period', samples.length ?
      `${perMinute ? 'Mỗi điểm là số đo theo phút' : 'Mỗi điểm là trung bình của một ngày'}; có dữ liệu từ ${dinhDangNgayGio.format(new Date(samples[0].at))} đến ${dinhDangNgayGio.format(new Date(samples.at(-1).at))}.` :
      `Chưa có số đo trong ${periodText}.`);
    datChu('history-flame-count', String(summary.alerts.flame));
    datChu('history-gas-count', String(summary.alerts.gas));
    datChu('history-user-range-count', String(summary.alerts.user));
    const bins = nhomCanhBaoTheoNgay(recentAlerts, oldestAllowed, to)
      .filter(bin => bin.flame > 0 || bin.gas > 0);
    const maxCount = Math.max(1, ...bins.flatMap(bin => [bin.flame, bin.gas]));
    const columns = bins.map(bin => {
      const column = document.createElement('div');
      column.className = 'history-activity-bin';
      column.title = `Ngày ${dinhDangNgay.format(new Date(bin.at))}: Lửa ${bin.flame}, khí gas ${bin.gas}`;
      const bars = document.createElement('div');
      bars.className = 'history-activity-column';
      for (const category of ['flame', 'gas']) {
        const bar = document.createElement('span');
        bar.className = `history-activity-bar history-activity-bar-${category}`;
        bar.style.height = bin[category] ? `${Math.max(4, bin[category] / maxCount * 110)}px` : '0';
        if (bin[category]) {
          const value = document.createElement('span');
          value.className = 'history-activity-value';
          value.textContent = String(bin[category]);
          bar.append(value);
        }
        bars.append(bar);
      }
      const day = new Date(bin.at);
      const date = document.createElement('time');
      date.className = 'history-activity-date';
      date.dateTime = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
      date.textContent = `${String(day.getDate()).padStart(2, '0')}/${String(day.getMonth() + 1).padStart(2, '0')}`;
      column.append(bars, date);
      return column;
    });
    const scroll = $('history-activity-scroll');
    const wasAtEnd = !scroll.dataset.scrolledInitially ||
      scroll.scrollLeft >= scroll.scrollWidth - scroll.clientWidth - 2;
    $('history-activity-bars').style.setProperty('--activity-days', String(Math.max(1, bins.length)));
    $('history-activity-bars').replaceChildren(...columns);
    if (!$('history-view').hidden) {
      if (scroll.scrollWidth <= scroll.clientWidth) scroll.scrollLeft = 0;
      else if (wasAtEnd) scroll.scrollLeft = scroll.scrollWidth - scroll.clientWidth;
      scroll.dataset.scrolledInitially = 'true';
    }
    const dailyAlerts = bins.map(bin =>
      `${dinhDangNgay.format(new Date(bin.at))}: lửa ${bin.flame}, khí gas ${bin.gas}`).join('; ');
    $('history-activity-bars').setAttribute('aria-label',
      dailyAlerts ? `Cảnh báo theo ngày. ${dailyAlerts}.` : 'Không có cảnh báo lửa hoặc khí gas trong các ngày hiển thị.');
    $('history-activity-empty').hidden = bins.length > 0;
    for (const [id, title, empty] of [
      ['history-flame-last', 'Phát hiện lửa', 'Chưa ghi nhận'],
      ['history-gas-last', 'Phát hiện khí gas', 'Chưa ghi nhận'],
      ['history-user-last', null, 'Chưa có thao tác']
    ]) {
      const latest = cacMucLichSu.find(entry => entry.at >= oldestAllowed && entry.at <= to &&
        (title ? entry.source !== 'user' && entry.title === title : entry.source === 'user'));
      datChu(id, latest ? `Gần nhất ${dinhDangNgayGio.format(new Date(latest.at))}` : empty);
    }
    datChu('history-dashboard-status', '');
  } catch {
    datChu('history-dashboard-status', 'Không đọc được số đo đã lưu trên trình duyệt này.');
  }
}

function datPhamViLichSu(scope) {
  const shared = scope !== 'demo' ? taiLichSuTheoThietBi(localStorage, deviceId) : null;
  khoaLichSu = shared?.key || `safety-history:${deviceId}:demo`;
  khoMauLichSu = taoKhoMauLichSu(`${deviceId}:${scope === 'demo' ? 'demo' : 'shared'}`);
  const openedStore = khoMauLichSu;
  if (shared) void khoMauLichSu.migrateLegacy(`${deviceId}:`).then(() => {
    if (khoMauLichSu === openedStore && !$('history-view').hidden) void hienThiBangLichSu();
  }).catch(() => {
    if (khoMauLichSu === openedStore)
      datChu('history-dashboard-status', 'Không chuyển được số đo từ lịch sử tài khoản cũ.');
  });
  cacMucLichSu = [];
  nguonLichSu = 'all';
  ngayLichSu = '';
  $('history-date').value = '';
  trangLichSu = 1;
  phutMauCuoi = null;
  coMauLichSu = false;
  lanTaiBieuDo++;
  duLieuTruoc = null;
  boQuaLanDocDau = false;
  let lichSuCuCanChuyen = false;
  try {
    const daLuu = shared ? shared.data : JSON.parse(localStorage.getItem(khoaLichSu) || 'null');
    if (Array.isArray(daLuu?.items)) cacMucLichSu = daLuu.items.filter(item =>
      Number.isFinite(item?.at) && item.at > 0 && item.at <= 8_640_000_000_000_000 &&
      typeof item.title === 'string' && typeof item.detail === 'string' &&
      ['info', 'safe', 'danger', 'device', 'user'].includes(item.kind))
      .map(item => ({ ...item, source: item.source === 'user' ? 'user' : 'system' }));
    if (Array.isArray(daLuu?.items)) {
      const daLoc = lamSachLichSuHeThongCu(cacMucLichSu);
      lichSuCuCanChuyen = daLuu.version !== 4 || daLoc.length !== cacMucLichSu.length;
      cacMucLichSu = daLoc;
    }
    if (daLuu?.previous && typeof daLuu.previous === 'object') duLieuTruoc = daLuu.previous;
    boQuaLanDocDau = daLuu?.cleared === true;
  } catch { /* A damaged or unavailable local store starts with an empty history. */ }
  $('history-status').textContent = shared?.saved === false ? 'Không lưu được lịch sử đã gộp trên trình duyệt này.' : '';
  hienThiLichSu();
  void hienThiBangLichSu();
  if (lichSuCuCanChuyen) luuLichSu();
}

function ghiMauDo() {
  const sample = mauDoLichSu(duLieuThietBi);
  if (!sample || !khoMauLichSu) return;
  const minute = Math.floor(sample.at / 60_000);
  if (minute === phutMauCuoi) return;
  phutMauCuoi = minute;
  void khoMauLichSu.save(sample).then(() => {
    if (!$('history-view').hidden) void hienThiBangLichSu();
  }).catch(() => {
    phutMauCuoi = null;
    datChu('history-dashboard-status', 'Không thể lưu số đo trên trình duyệt này.');
  });
}

function ghiDuLieu() {
  if (!khoaLichSu || duLieuCu(duLieuThietBi.updatedAt)) return;
  ghiMauDo();
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
    if (!$('history-view').hidden) void hienThiBangLichSu();
  }
}

function ghiThaoTac(values, outcome) {
  if (!khoaLichSu) return;
  const entry = lichSuThaoTac(values, Date.now(), outcome, taiKhoanLichSu);
  if (!entry) return;
  cacMucLichSu = themLichSu(cacMucLichSu, [entry]);
  $('history-status').textContent = '';
  hienThiLichSu();
  luuLichSu();
  if (!$('history-view').hidden) void hienThiBangLichSu();
}

for (const [source, label] of [['system', 'hệ thống'], ['user', 'thao tác người dùng'], ['all', 'toàn bộ']]) {
  $('clear-history-' + source).addEventListener('click', () => {
    if ((!locLichSu(cacMucLichSu, source).length && !(source === 'all' && coMauLichSu)) ||
      !window.confirm(source === 'all' ? 'Xóa toàn bộ sự kiện, thao tác và số đo đã lưu trên trình duyệt này?' :
        `Xóa lịch sử ${label} đã lưu trên trình duyệt này?`)) return;
    cacMucLichSu = xoaLichSuTheoNguon(cacMucLichSu, source);
    if (source === 'all') coMauLichSu = false;
    luuLichSu();
    hienThiLichSu();
    if (source === 'all' && khoMauLichSu) {
      phutMauCuoi = null;
      lanTaiBieuDo++;
      void khoMauLichSu.clear().then(() => hienThiBangLichSu()).catch(() =>
        datChu('history-dashboard-status', 'Không xóa được số đo đã lưu.'));
    } else void hienThiBangLichSu();
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

function anMatKhauWifi() {
  if (wifiRevealTimer) clearTimeout(wifiRevealTimer);
  wifiRevealTimer = null;
  wifiRevealRequest = null;
  wifiRevealed = null;
  wifiRevealMessage = '';
  wifiRevealError = false;
}

function hienThiWifi() {
  if (wifiDangCho && duLieuThietBi.wifiChangeId === wifiDangCho.id &&
      ['applied', 'saved', 'failed'].includes(duLieuThietBi.wifiChangeStatus)) {
    loiWifi = duLieuThietBi.wifiChangeStatus === 'failed';
    thongBaoWifi = duLieuThietBi.wifiChangeStatus === 'applied' ?
      'ESP32 đã kết nối và lưu Wi-Fi mới; khi mất kết nối sẽ thử các mạng đã lưu.' :
      duLieuThietBi.wifiChangeStatus === 'saved' ?
        'ESP32 đã lưu Wi-Fi mới và sẽ kết nối khi mạng khả dụng.' :
        'Không lưu được mạng mới; hãy kiểm tra cấu hình và thử lại.';
    wifiDangCho = null;
  }
  if (wifiDangCho && Date.now() - wifiDangCho.sentAt > 90_000) {
    wifiDangCho = null;
    loiWifi = true;
    thongBaoWifi = 'Chưa nhận được xác nhận. Kiểm tra kết nối của ESP32 trước khi thử lại.';
  }
  datChu('wifi-current-ssid', duLieuThietBi.wifiSsid || 'Chưa có dữ liệu');
  const listKey = JSON.stringify([duLieuThietBi.wifiSavedSsids, duLieuThietBi.wifiSsid]);
  if (wifiListKey !== listKey) {
    wifiListKey = listKey;
    const rows = duLieuThietBi.wifiSavedSsids.map(ssid => {
      const item = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = ssid;
      item.append(name);
      item.dataset.active = String(ssid === duLieuThietBi.wifiSsid);
      return item;
    });
    if (!rows.length) {
      const item = document.createElement('li');
      item.textContent = 'Chưa có dữ liệu';
      rows.push(item);
    }
    $('wifi-saved-list').replaceChildren(...rows);
  }
  const secretKey = JSON.stringify(wifiRevealed);
  if (wifiSecretKey !== secretKey) {
    wifiSecretKey = secretKey;
    const rows = Object.entries(wifiRevealed || {}).map(([ssid, password]) => {
      const item = document.createElement('li');
      const name = document.createElement('strong');
      name.textContent = ssid;
      const secret = document.createElement('code');
      secret.textContent = password;
      item.append(name, secret);
      return item;
    });
    $('wifi-secret-list').replaceChildren(...rows);
  }
  $('wifi-settings-button').disabled = !chuSoHuuDangNhap || duLieuThietBi.wifiConfigVersion < 3 ||
    duLieuCu(duLieuThietBi.updatedAt) || Boolean(wifiDangCho);
  const revealButton = $('reveal-wifi-passwords');
  revealButton.textContent = wifiRevealed ? 'Ẩn mật khẩu đã lưu' : 'Hiện mật khẩu đã lưu';
  revealButton.disabled = !chuSoHuuDangNhap || Boolean(wifiRevealRequest) ||
    (!wifiRevealed && (duLieuThietBi.wifiConfigVersion < 4 ||
      duLieuCu(duLieuThietBi.updatedAt) || !duLieuThietBi.wifiSavedSsids.length));
  datChu('wifi-reveal-help', chuSoHuuDangNhap && duLieuThietBi.wifiConfigVersion >= 2 &&
    duLieuThietBi.wifiConfigVersion < 4 ? 'Cần nạp firmware mới để xem mật khẩu đã lưu.' : '');
  datChu('wifi-reveal-status', wifiRevealMessage);
  $('wifi-reveal-status').dataset.error = String(wifiRevealError);
  const panel = $('wifi-secret-panel');
  const showPanel = Boolean(wifiRevealed || wifiRevealMessage);
  const restoreFocus = !showPanel && !panel.hidden && panel.contains(document.activeElement);
  const openPanel = showPanel && panel.hidden;
  panel.hidden = !showPanel;
  revealButton.setAttribute('aria-expanded', String(showPanel));
  if (restoreFocus) revealButton.focus({ preventScroll: true });
  else if (openPanel) panel.focus({ preventScroll: true });
  const canNapFirmware = duLieuThietBi.wifiConfigVersion < 3;
  const message = wifiDangCho ? 'Đang chờ ESP32 lưu Wi-Fi và xác nhận…' : thongBaoWifi ||
    (canNapFirmware ? 'Cần nạp firmware mới để lưu trước mạng Wi-Fi chưa xuất hiện.' :
      duLieuCu(duLieuThietBi.updatedAt) ? 'ESP32 cần trực tuyến để nhận cấu hình mới.' : '');
  datChu('wifi-settings-status', message);
  $('wifi-settings-status').dataset.error = String(!wifiDangCho && (loiWifi || canNapFirmware));
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
  hienThiWifi();
}

function moTaQuat(duLieu) {
  const lyDo = { gas: 'Tự bật vì phát hiện gas', purge: 'Thông gió thêm 3 giây sau khi hết gas',
    manual: 'Đang bật bằng tay', blocked: 'Đã dừng quạt vì báo lửa', off: 'Bật tay hoặc tự bật khi có gas' };
  if (duLieu.fanReason) return lyDo[duLieu.fanReason];
  return duLieu.gasAlarm ? 'Tự bật khi có gas' : 'Bật tay hoặc tự bật khi có gas';
}

function datNutDieuKhien(button, duocPhep, dangBan) {
  button.disabled = dangBan || !duocPhep;
  button.dataset.commandLocked = String(dangBan && duocPhep);
}

function hienThiDieuKhien(duLieuQuaCu, coCanhBao) {
  const dangTam = tamTatTatCa(duLieuThietBi);
  const coiDangTatTieng = dangTamTat(duLieuThietBi);
  const logicMoi = laLogicMoi(duLieuThietBi);
  const dangBan = dangGuiLenh;
  $('control-panel').setAttribute('data-sending', String(dangBan));
  const muonBatQuat = lenhDangCho?.values?.fanOn ?? duLieuThietBi.fanOn;
  const choPhepDatQuat = coTheDieuKhien(duLieuThietBi, 'fanOn');
  const hienThiLuaChonQuat = !duLieuQuaCu && !duLieuThietBi.gasAlarm && !dangTam && muonBatQuat != null;
  const cheDoQuatDangCho = lenhDangCho?.requested?.fanOn == null ? null : luaChonQuat;
  const cheDoQuat = muonBatQuat === true ? 'on' : luaChonQuat;
  for (const choice of ['off', 'on', 'auto']) {
    const button = $('fan-' + choice);
    datNutDieuKhien(button, choPhepDatQuat, dangBan);
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
    datNutDieuKhien(button, coTheDieuKhien(duLieuThietBi, 'ledMode'), dangBan);
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
      datNutDieuKhien(button, coTheDieuKhien(duLieuThietBi, key), dangBan);
      button.setAttribute('aria-pressed', String((cheDoYeuCau ?? duLieuThietBi[key]) === value));
    }
  }
  datNutDieuKhien($('mute-button'), coTheTamTat(duLieuThietBi), dangBan);
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
  const [{ initializeApp }, { getAuth, onAuthStateChanged, signInWithEmailAndPassword,
    createUserWithEmailAndPassword, deleteUser, signOut, EmailAuthProvider,
    reauthenticateWithCredential, updatePassword, setPersistence,
    browserLocalPersistence, browserSessionPersistence, inMemoryPersistence },
    { getDatabase, ref, onValue, update, set, serverTimestamp }] = await Promise.all([
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
  let taiKhoanTaoMoi = null;
  let huyTheoDoiQuyen = null;
  let huyTheoDoiHoSo = null;
  let quyenOperator = null;
  let hoSoOperator = null;
  let loiDocQuyen = false;
  let loiDocHoSo = false;
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

  function hienThiOperators() {
    if (auth.currentUser?.uid !== ownerUid) return;
    if (loiDocQuyen) {
      $('operator-list').replaceChildren();
      datChu('operator-count', '—');
      datChu('operator-list-status', 'Không đọc được danh sách quyền. Hãy áp dụng Database Rules mới.');
      return;
    }
    if (quyenOperator === null) return;
    const hoSo = hoSoOperator || {};
    const rows = Object.entries(quyenOperator).filter(([, value]) => value === true)
      .sort(([uidA], [uidB]) =>
        (hoSo[uidA]?.email || uidA).localeCompare(hoSo[uidB]?.email || uidB, 'vi'))
      .map(([uid]) => {
        const row = document.createElement('li');
        row.className = 'operator-row';
        const name = document.createElement('strong');
        name.textContent = hoSo[uid]?.email || `UID: ${uid}`;
        const detail = document.createElement('small');
        detail.textContent = hoSo[uid]?.email ? `UID: ${uid}` : 'Chưa lưu email cho tài khoản cũ';
        const status = document.createElement('span');
        status.className = 'operator-state';
        status.dataset.active = 'true';
        status.textContent = 'Đang có quyền';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'button';
        button.textContent = 'Thu hồi quyền';
        button.addEventListener('click', async () => {
          if (button.disabled || auth.currentUser?.uid !== ownerUid) return;
          button.disabled = true;
          trangThaiTaiKhoan('operator-action-status', 'Đang cập nhật quyền…');
          try {
            await set(ref(coSoDuLieu, `operators/${uid}`), null);
            trangThaiTaiKhoan('operator-action-status', 'Đã thu hồi quyền truy cập thiết bị.');
          } catch {
            trangThaiTaiKhoan('operator-action-status', 'Không cập nhật được quyền. Kiểm tra kết nối và Database Rules.', true);
          } finally {
            button.disabled = false;
          }
        });
        row.append(name, detail, status, button);
        return row;
      });
    $('operator-list').replaceChildren(...rows);
    datChu('operator-count', String(rows.length));
    datChu('operator-list-status', loiDocHoSo ?
      'Chưa đọc được email; danh sách đang hiển thị theo UID. Hãy áp dụng Database Rules mới.' :
      rows.length ? '' : 'Chưa cấp quyền cho tài khoản nào.');
  }

  function theoDoiOperators() {
    quyenOperator = null;
    hoSoOperator = null;
    loiDocQuyen = false;
    loiDocHoSo = false;
    $('operator-list').replaceChildren();
    datChu('operator-count', '…');
    datChu('operator-list-status', 'Đang tải tài khoản…');
    huyTheoDoiQuyen = onValue(ref(coSoDuLieu, 'operators'), snapshot => {
      quyenOperator = snapshot.val() || {};
      hienThiOperators();
    }, () => {
      loiDocQuyen = true;
      hienThiOperators();
    });
    huyTheoDoiHoSo = onValue(ref(coSoDuLieu, 'operatorProfiles'), snapshot => {
      hoSoOperator = snapshot.val() || {};
      loiDocHoSo = false;
      hienThiOperators();
    }, () => {
      loiDocHoSo = true;
      hienThiOperators();
    });
  }

  function theoDoiWifiReveal() {
    huyTheoDoiWifiReveal = onValue(ref(coSoDuLieu, `devices/${deviceId}/wifiReveal`), snapshot => {
      const reply = snapshot.val();
      if (!chuSoHuuDangNhap || !wifiRevealRequest || reply?.requestId !== wifiRevealRequest) return;
      const saved = new Set(duLieuThietBi.wifiSavedSsids);
      const passwords = Object.create(null);
      for (const network of Array.isArray(reply.networks) ? reply.networks : []) {
        if (saved.has(network?.ssid) && typeof network.password === 'string' &&
            network.password.length >= 8 && network.password.length <= 63)
          passwords[network.ssid] = network.password;
      }
      if (wifiRevealTimer) clearTimeout(wifiRevealTimer);
      wifiRevealRequest = null;
      wifiRevealed = passwords;
      wifiRevealMessage = 'Mật khẩu sẽ tự ẩn sau 60 giây.';
      wifiRevealTimer = setTimeout(() => { anMatKhauWifi(); hienThiWifi(); }, 60_000);
      hienThiWifi();
      void set(ref(coSoDuLieu, `devices/${deviceId}/wifiReveal`), null).catch(() => {});
    }, () => {
      if (!chuSoHuuDangNhap) return;
      anMatKhauWifi();
      wifiRevealMessage = 'Không đọc được mật khẩu đã lưu. Kiểm tra Database Rules.';
      wifiRevealError = true;
      hienThiWifi();
    });
  }

  onAuthStateChanged(auth, user => {
    const daDangNhap = Boolean(user);
    taiKhoanLichSu = user ? { uid: user.uid, email: user.email || null } : null;
    chuSoHuuDangNhap = daDangNhap && user.uid === ownerUid;
    anMatKhauWifi();
    wifiDangCho = null;
    thongBaoWifi = '';
    loiWifi = false;
    $('wifi-ssid').value = '';
    $('wifi-password').value = '';
    $('show-wifi-password').checked = false;
    $('wifi-password').type = 'password';
    lenhDangCho = null;
    luaChonQuat = 'auto';
    thongBaoLenh = '';
    khungDangNhap.hidden = daDangNhap;
    bangDieuKhien.hidden = !daDangNhap;
    $('sign-out').hidden = !daDangNhap;
    $('tab-account').hidden = !daDangNhap;
    $('create-account-section').hidden = !daDangNhap || user.uid !== ownerUid;
    $('operator-management-section').hidden = !chuSoHuuDangNhap;
    $('wifi-settings-section').hidden = !chuSoHuuDangNhap;
    datChu('account-current-email', user?.email || 'tài khoản đang đăng nhập');
    datChu('create-account-status', '');
    datChu('change-password-status', '');
    datChu('operator-action-status', '');
    if (huyTheoDoiQuyen) huyTheoDoiQuyen();
    if (huyTheoDoiHoSo) huyTheoDoiHoSo();
    if (huyTheoDoiWifiReveal) huyTheoDoiWifiReveal();
    huyTheoDoiQuyen = null;
    huyTheoDoiHoSo = null;
    huyTheoDoiWifiReveal = null;
    quyenOperator = null;
    hoSoOperator = null;
    loiDocQuyen = false;
    loiDocHoSo = false;
    $('operator-list').replaceChildren();
    chonTab('overview');
    if (daDangNhap) { datPhamViLichSu(user.uid); theoDoiThietBi(); }
    else {
      for (const id of ['account-password', 'account-confirm', 'current-password',
        'new-password', 'confirm-password']) {
        $(id).value = '';
        $(id).type = 'password';
      }
      $('account-email').value = '';
      $('show-account-passwords').checked = false;
      $('show-change-passwords').checked = false;
      if (huyTheoDoiDuLieu) huyTheoDoiDuLieu();
      huyTheoDoiDuLieu = null;
      duLieuThietBi = chuanHoaDuLieu();
      khoaLichSu = '';
      khoMauLichSu = null;
      cacMucLichSu = [];
      nguonLichSu = 'all';
      ngayLichSu = '';
      $('history-date').value = '';
      coMauLichSu = false;
      lanTaiBieuDo++;
      duLieuTruoc = null;
      boQuaLanDocDau = false;
      hienThiLichSu();
      $('connection-dot').className = 'connection-dot';
      $('connection-label').textContent = 'Chưa đăng nhập';
      $('last-updated').textContent = 'Đăng nhập để xem thiết bị';
    }
    if (chuSoHuuDangNhap) { theoDoiOperators(); theoDoiWifiReveal(); }
    hienThiWifi();
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

  function trangThaiTaiKhoan(id, text, error = false) {
    datChu(id, text);
    $(id).dataset.error = String(error);
  }
  function loiTaiKhoan(error, fallback) {
    const messages = {
      'auth/email-already-in-use': 'Email này đã có tài khoản.',
      'auth/invalid-email': 'Email không hợp lệ.',
      'auth/weak-password': 'Mật khẩu quá yếu. Hãy dùng ít nhất 8 ký tự.',
      'auth/wrong-password': 'Mật khẩu hiện tại không đúng.',
      'auth/invalid-credential': 'Mật khẩu hiện tại không đúng.',
      'auth/too-many-requests': 'Thao tác quá nhiều lần. Hãy thử lại sau.',
      'auth/network-request-failed': 'Không kết nối được Firebase. Hãy thử lại.',
      'auth/requires-recent-login': 'Phiên đăng nhập đã cũ. Hãy đăng xuất và đăng nhập lại.',
      'auth/operation-not-allowed': 'Chưa bật đăng nhập Email/Password trong Firebase.'
    };
    return messages[error?.code] || fallback;
  }
  for (const [toggle, fields] of [
    ['show-account-passwords', ['account-password', 'account-confirm']],
    ['show-change-passwords', ['current-password', 'new-password', 'confirm-password']]
  ]) {
    $(toggle).addEventListener('change', () => {
      for (const field of fields) $(field).type = $(toggle).checked ? 'text' : 'password';
    });
  }

  $('create-account-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (auth.currentUser?.uid !== ownerUid) {
      trangThaiTaiKhoan('create-account-status', 'Chỉ chủ sở hữu được thêm tài khoản.', true);
      return;
    }
    const email = $('account-email').value.trim();
    const password = $('account-password').value;
    if (password.length < 8 || password !== $('account-confirm').value) {
      trangThaiTaiKhoan('create-account-status', 'Mật khẩu cần ít nhất 8 ký tự và hai ô phải giống nhau.', true);
      return;
    }
    const button = $('create-account-button');
    button.disabled = true;
    trangThaiTaiKhoan('create-account-status', 'Đang tạo tài khoản và cấp quyền…');
    try {
      if (!taiKhoanTaoMoi) {
        taiKhoanTaoMoi = getAuth(initializeApp(firebaseConfig, 'account-creator'));
      }
      await setPersistence(taiKhoanTaoMoi, inMemoryPersistence);
      const { user } = await createUserWithEmailAndPassword(taiKhoanTaoMoi, email, password);
      try {
        await set(ref(coSoDuLieu, `operators/${user.uid}`), true);
      } catch {
        try { await deleteUser(user); }
        catch {
          trangThaiTaiKhoan('create-account-status',
            `Tài khoản đã tạo nhưng chưa có quyền. Kiểm tra UID ${user.uid} trong Firebase Console.`, true);
          return;
        }
        const grantError = new Error('grant-failed');
        grantError.code = 'grant-failed';
        throw grantError;
      }
      let daLuuEmail = true;
      try {
        await set(ref(coSoDuLieu, `operatorProfiles/${user.uid}`), { email, createdAt: serverTimestamp() });
      } catch { daLuuEmail = false; }
      $('account-email').value = '';
      trangThaiTaiKhoan('create-account-status', daLuuEmail ?
        `Đã tạo tài khoản ${email} và cấp quyền operator.` :
        `Đã tạo tài khoản ${email} và cấp quyền; email chưa lưu trong danh sách. Áp dụng Database Rules mới.`, !daLuuEmail);
    } catch (error) {
      trangThaiTaiKhoan('create-account-status',
        error?.code === 'grant-failed' ? 'Không cấp được quyền; tài khoản vừa tạo đã được xóa.' :
          loiTaiKhoan(error, 'Không tạo được tài khoản. Kiểm tra kết nối và thử lại.'), true);
    } finally {
      if (taiKhoanTaoMoi?.currentUser) {
        try { await signOut(taiKhoanTaoMoi); } catch { /* In-memory session ends on reload. */ }
      }
      $('account-password').value = '';
      $('account-confirm').value = '';
      button.disabled = false;
    }
  });

  $('change-password-form').addEventListener('submit', async event => {
    event.preventDefault();
    const user = auth.currentUser;
    if (!user?.email) {
      trangThaiTaiKhoan('change-password-status', 'Hãy đăng nhập bằng email để đổi mật khẩu.', true);
      return;
    }
    const currentPassword = $('current-password').value;
    const newPassword = $('new-password').value;
    if (newPassword.length < 8 || newPassword !== $('confirm-password').value) {
      trangThaiTaiKhoan('change-password-status', 'Mật khẩu mới cần ít nhất 8 ký tự và hai ô phải giống nhau.', true);
      return;
    }
    const button = $('change-password-button');
    button.disabled = true;
    trangThaiTaiKhoan('change-password-status', 'Đang đổi mật khẩu…');
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
      await updatePassword(user, newPassword);
      trangThaiTaiKhoan('change-password-status', 'Đã đổi mật khẩu. Bạn có thể tiếp tục sử dụng tài khoản.');
    } catch (error) {
      trangThaiTaiKhoan('change-password-status', loiTaiKhoan(error, 'Không đổi được mật khẩu. Hãy thử lại.'), true);
    } finally {
      for (const id of ['current-password', 'new-password', 'confirm-password']) $(id).value = '';
      button.disabled = false;
    }
  });

  $('wifi-settings-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!chuSoHuuDangNhap || duLieuThietBi.wifiConfigVersion < 3 ||
        duLieuCu(duLieuThietBi.updatedAt) || wifiDangCho) return;
    const ssid = $('wifi-ssid').value;
    const password = $('wifi-password').value;
    const error = loiCauHinhWifi(ssid, password);
    if (error) {
      thongBaoWifi = error;
      loiWifi = true;
      hienThiWifi();
      return;
    }
    const requestId = crypto.randomUUID();
    wifiDangCho = { id: requestId, sentAt: Date.now() };
    thongBaoWifi = '';
    loiWifi = false;
    hienThiWifi();
    try {
      await set(ref(coSoDuLieu, `devices/${deviceId}/commands/wifi`), { requestId, ssid, password });
      $('wifi-ssid').value = '';
    } catch {
      wifiDangCho = null;
      thongBaoWifi = 'Không gửi được cấu hình Wi-Fi. Kiểm tra quyền Firebase và thử lại.';
      loiWifi = true;
    } finally {
      $('wifi-password').value = '';
      hienThiWifi();
    }
  });
  $('show-wifi-password').addEventListener('change', () => {
    $('wifi-password').type = $('show-wifi-password').checked ? 'text' : 'password';
  });
  $('wifi-secret-close').addEventListener('click', () => {
    anMatKhauWifi();
    hienThiWifi();
  });
  $('wifi-secret-panel').addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    anMatKhauWifi();
    hienThiWifi();
  });
  $('reveal-wifi-passwords').addEventListener('click', async () => {
    if (!chuSoHuuDangNhap) return;
    if (wifiRevealed) { anMatKhauWifi(); hienThiWifi(); return; }
    if (wifiRevealRequest || duLieuThietBi.wifiConfigVersion < 4 ||
        duLieuCu(duLieuThietBi.updatedAt) || !duLieuThietBi.wifiSavedSsids.length) return;
    const requestId = crypto.randomUUID();
    wifiRevealRequest = requestId;
    wifiRevealMessage = 'Đang lấy mật khẩu từ ESP32…';
    wifiRevealError = false;
    wifiRevealTimer = setTimeout(() => {
      if (wifiRevealRequest !== requestId) return;
      anMatKhauWifi();
      wifiRevealMessage = 'ESP32 chưa phản hồi. Kiểm tra kết nối rồi thử lại.';
      wifiRevealError = true;
      hienThiWifi();
    }, 20_000);
    hienThiWifi();
    try {
      await set(ref(coSoDuLieu, `devices/${deviceId}/commands/wifiReveal`), { requestId });
    } catch {
      anMatKhauWifi();
      wifiRevealMessage = 'Không gửi được yêu cầu xem mật khẩu. Kiểm tra Database Rules.';
      wifiRevealError = true;
      hienThiWifi();
    }
  });

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
    lenhDangCho = { id: maLenh, sentAt: Date.now(), values: cacGiaTriLenh,
      requested: { ...lenhDangCho?.requested, ...values } };
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
