const tenCheDo = { auto: 'Tự động', on: 'Bật', off: 'Tắt' };

export function cacThayDoiLichSu(duLieuTruoc, duLieuHienTai) {
  const at = duLieuHienTai?.updatedAt;
  if (typeof at !== 'number' || !Number.isFinite(at) || at <= 0) return [];
  if (!duLieuTruoc) return [];
  const cacMuc = [];
  for (const [khoa, nhan] of [['flameDetected', 'Lửa'], ['gasAlarm', 'Khí gas']]) {
    if (typeof duLieuHienTai[khoa] === 'boolean' && duLieuHienTai[khoa] !== duLieuTruoc[khoa]) {
      cacMuc.push({ at, source: 'system', kind: duLieuHienTai[khoa] ? 'danger' : 'safe',
        title: duLieuHienTai[khoa] ? `Phát hiện ${nhan.toLowerCase()}` : `${nhan} đã an toàn`,
        detail: duLieuHienTai[khoa] ? 'Cảm biến phát tín hiệu cảnh báo.' : 'Cảm biến đã trở về trạng thái bình thường.' });
    }
  }
  return cacMuc;
}

export function lichSuThaoTac(values, at, outcome = 'sent') {
  const cacThaoTac = [
    ['fanOn', giaTri => giaTri ? 'Bật quạt' : 'Tắt quạt'],
    ['ledMode', giaTri => `Đèn hai màu: ${{ auto: 'Tự động', red: 'Đỏ', green: 'Xanh', off: 'Tắt' }[giaTri]}`],
    ['alarmLedMode', giaTri => `Màu đỏ: ${tenCheDo[giaTri]}`],
    ['statusLedMode', giaTri => `Màu xanh: ${tenCheDo[giaTri]}`],
    ['buzzerMode', giaTri => `Còi: ${tenCheDo[giaTri]}`],
    ['muteRequestedAt', () => 'Tạm tắt đầu ra 30 giây'],
    ['demoFlame', giaTri => giaTri ? 'Bật báo lửa mô phỏng' : 'Tắt báo lửa mô phỏng'],
    ['demoGas', giaTri => giaTri ? 'Bật báo gas mô phỏng' : 'Tắt báo gas mô phỏng']
  ];
  const thaoTac = Object.keys(values).map(khoa => cacThaoTac.find(([name]) => name === khoa)).find(Boolean);
  if (!thaoTac || !Number.isFinite(at) || at <= 0) return null;
  const [khoa, nhan] = thaoTac;
  const title = nhan(values[khoa]);
  if (!title) return null;
  return {
    at, source: 'user', kind: outcome === 'failed' ? 'danger' : 'user',
    title,
    detail: outcome === 'failed' ? 'Gửi lệnh thất bại.' :
      outcome === 'demo' ? 'Đã áp dụng trong bản mô phỏng.' : 'Đã gửi lệnh đến thiết bị.'
  };
}

export function locLichSu(items, source = 'all') {
  if (source === 'all') return items;
  return items.filter(item => (item.source === 'user' ? 'user' : 'system') === source);
}

export function lamSachLichSuHeThongCu(items) {
  const canhBaoAnToan = new Set(['Phát hiện lửa', 'Phát hiện khí gas', 'Lửa đã an toàn', 'Khí gas đã an toàn']);
  return items.filter(item => item.source === 'user' || canhBaoAnToan.has(item.title));
}

export function xoaLichSuTheoNguon(items, source) {
  if (source === 'all') return [];
  return items.filter(item => (item.source === 'user' ? 'user' : 'system') !== source);
}

export function themLichSu(hienCo, thayDoi) {
  return [...thayDoi.slice().reverse(), ...hienCo];
}

export function mauDoLichSu(duLieu) {
  const at = duLieu?.updatedAt;
  if (!Number.isFinite(at) || at <= 0) return null;
  const numeric = value => Number.isFinite(value) ? value : null;
  const temperatureC = numeric(duLieu.temperatureC);
  const humidityPct = numeric(duLieu.humidityPct);
  if (temperatureC == null && humidityPct == null) return null;
  return {
    at,
    temperatureC,
    humidityPct,
    flameDetected: duLieu.flameDetected === true,
    gasAlarm: duLieu.gasAlarm === true
  };
}

function thongKeSo(samples, key) {
  const values = samples.map(sample => sample[key]).filter(Number.isFinite);
  if (!values.length) return { latest: null, min: null, max: null, average: null, count: 0 };
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const value of values) {
    min = Math.min(min, value);
    max = Math.max(max, value);
    sum += value;
  }
  return {
    latest: values.at(-1), min, max,
    average: Math.round(sum / values.length * 10) / 10,
    count: values.length
  };
}

export function thongKeLichSu(samples, events, from, to) {
  const trongKy = samples.filter(sample => sample.at >= from && sample.at <= to)
    .sort((a, b) => a.at - b.at);
  const suKien = events.filter(entry => entry.at >= from && entry.at <= to);
  return {
    temperature: thongKeSo(trongKy, 'temperatureC'),
    humidity: thongKeSo(trongKy, 'humidityPct'),
    alerts: {
      flame: suKien.filter(entry => entry.source !== 'user' && entry.title === 'Phát hiện lửa').length,
      gas: suKien.filter(entry => entry.source !== 'user' && entry.title === 'Phát hiện khí gas').length,
      user: suKien.filter(entry => entry.source === 'user').length
    }
  };
}

export function nhomHoatDong(events, from, to, count = 12) {
  const bins = Array.from({ length: count }, () => ({ flame: 0, gas: 0, user: 0 }));
  const duration = Math.max(to - from, 1);
  for (const entry of events) {
    if (entry.at < from || entry.at > to) continue;
    const bin = bins[Math.min(count - 1, Math.floor((entry.at - from) / duration * count))];
    if (entry.source === 'user') bin.user++;
    else if (entry.title === 'Phát hiện lửa') bin.flame++;
    else if (entry.title === 'Phát hiện khí gas') bin.gas++;
  }
  return bins;
}

export function duongBieuDo(samples, key, from, to) {
  const points = samples.filter(sample => sample.at >= from && sample.at <= to && Number.isFinite(sample[key]));
  if (!points.length) return '';
  let min = Infinity;
  let max = -Infinity;
  for (const point of points) {
    min = Math.min(min, point[key]);
    max = Math.max(max, point[key]);
  }
  const stride = Math.ceil(points.length / 300);
  const shown = stride <= 1 ? points : [];
  if (stride > 1) for (let start = 0; start < points.length; start += stride) {
    const bucket = points.slice(start, start + stride);
    let low = bucket[0];
    let high = bucket[0];
    for (const point of bucket) {
      if (point[key] < low[key]) low = point;
      if (point[key] > high[key]) high = point;
    }
    shown.push(...(low.at <= high.at ? [low, high] : [high, low]).filter((point, index, array) => index === 0 || point !== array[0]));
  }
  const span = Math.max(max - min, 1);
  const firstAt = points[0].at;
  const lastAt = points.at(-1).at;
  const timeSpan = Math.max(lastAt - firstAt, 1);
  return shown.map((sample, index) => {
    const x = firstAt === lastAt ? 300 : 10 + (sample.at - firstAt) / timeSpan * 580;
    const y = 140 - (sample[key] - min) / span * 120;
    return `${index ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
}
