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

export function lichSuThaoTac(values, at, outcome = 'sent', actor = null) {
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
    ...(actor?.uid ? { actorUid: actor.uid } : {}),
    ...(actor?.email ? { actorEmail: actor.email } : {}),
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

export function nhomCanhBaoTheoNgay(events, from, to) {
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return [];
  const day = new Date(from);
  day.setHours(0, 0, 0, 0);
  const bins = [];
  const byDay = new Map();
  while (day.getTime() <= to) {
    const bin = { at: day.getTime(), flame: 0, gas: 0 };
    bins.push(bin);
    byDay.set(bin.at, bin);
    day.setDate(day.getDate() + 1);
  }
  for (const entry of events) {
    if (!Number.isFinite(entry.at) || entry.at < from || entry.at > to || entry.source === 'user') continue;
    const eventDay = new Date(entry.at);
    eventDay.setHours(0, 0, 0, 0);
    const bin = byDay.get(eventDay.getTime());
    if (!bin) continue;
    if (entry.title === 'Phát hiện lửa') bin.flame++;
    else if (entry.title === 'Phát hiện khí gas') bin.gas++;
  }
  return bins;
}

export function trungBinhMauTheoNgay(samples, from, to) {
  const byDay = new Map();
  for (const sample of samples) {
    if (!Number.isFinite(sample?.at) || sample.at < from || sample.at > to) continue;
    const day = new Date(sample.at);
    day.setHours(0, 0, 0, 0);
    const at = day.getTime();
    if (!byDay.has(at)) byDay.set(at, { at, tempSum: 0, tempCount: 0, humiditySum: 0, humidityCount: 0 });
    const bucket = byDay.get(at);
    if (Number.isFinite(sample.temperatureC)) {
      bucket.tempSum += sample.temperatureC;
      bucket.tempCount++;
    }
    if (Number.isFinite(sample.humidityPct)) {
      bucket.humiditySum += sample.humidityPct;
      bucket.humidityCount++;
    }
  }
  return [...byDay.values()].sort((a, b) => a.at - b.at).map(bucket => ({
    at: bucket.at,
    temperatureC: bucket.tempCount ? bucket.tempSum / bucket.tempCount : null,
    humidityPct: bucket.humidityCount ? bucket.humiditySum / bucket.humidityCount : null
  }));
}

export function duongBieuDo(samples, key, from, to, maxGapMs = Infinity) {
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
  const timeSpan = Math.max(to - from, 1);
  const commands = [];
  shown.forEach((sample, index) => {
    const x = 10 + (sample.at - from) / timeSpan * 580;
    const y = 140 - (sample[key] - min) / span * 120;
    const start = index === 0 || sample.at - shown[index - 1].at > maxGapMs;
    const end = index === shown.length - 1 || shown[index + 1].at - sample.at > maxGapMs;
    commands.push(`${start ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
    if (start && end) commands.push(`L ${(x + 0.1).toFixed(1)} ${y.toFixed(1)}`);
  });
  return commands.join(' ');
}
