const tenCheDo = { auto: 'Tự động', on: 'Bật', off: 'Tắt' };

export function cacThayDoiLichSu(duLieuTruoc, duLieuHienTai) {
  const at = duLieuHienTai?.updatedAt;
  if (typeof at !== 'number' || !Number.isFinite(at) || at <= 0) return [];
  if (!duLieuTruoc) return [];
  const cacMuc = [];
  let canhBaoVuaDoi = false;
  let gasVuaDoi = false;
  for (const [khoa, nhan] of [['flameDetected', 'Lửa'], ['gasAlarm', 'Khí gas']]) {
    if (typeof duLieuHienTai[khoa] === 'boolean' && duLieuHienTai[khoa] !== duLieuTruoc[khoa]) {
      canhBaoVuaDoi = true;
      if (khoa === 'gasAlarm') gasVuaDoi = true;
      cacMuc.push({ at, source: 'system', kind: duLieuHienTai[khoa] ? 'danger' : 'safe',
        title: duLieuHienTai[khoa] ? `Phát hiện ${nhan.toLowerCase()}` : `${nhan} đã an toàn`,
        detail: duLieuHienTai[khoa] ? 'Cảm biến phát tín hiệu cảnh báo.' : 'Cảm biến đã trở về trạng thái bình thường.' });
    }
  }
  const maLenhMoi = typeof duLieuHienTai.appliedCommandId === 'string' && duLieuHienTai.appliedCommandId.length > 0 &&
    duLieuHienTai.appliedCommandId !== duLieuTruoc.appliedCommandId;
  for (const [khoa, nhan] of [['fanOn', 'Quạt'], ['buzzerOn', 'Còi'],
    ['alarmLedOn', 'LED đỏ'], ['statusLedOn', 'LED xanh']]) {
    const camBienGayRa = khoa === 'fanOn' ? gasVuaDoi : canhBaoVuaDoi;
    if ((!maLenhMoi || camBienGayRa) &&
        typeof duLieuHienTai[khoa] === 'boolean' && typeof duLieuTruoc[khoa] === 'boolean' &&
        duLieuHienTai[khoa] !== duLieuTruoc[khoa]) {
      cacMuc.push({ at, source: 'system', kind: 'device',
        title: `${nhan} đã ${duLieuHienTai[khoa] ? 'bật' : 'tắt'}`,
        detail: 'Đầu ra của thiết bị tự thay đổi.' });
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
  const gasEvents = new Set(items.filter(item => item.source !== 'user' &&
    ['Phát hiện khí gas', 'Khí gas đã an toàn'].includes(item.title))
    .map(item => `${item.at}:${item.title}`));
  return items.filter(item => {
    if (item.source === 'user') return true;
    if (item.title === 'Quạt đã bật') return gasEvents.has(`${item.at}:Phát hiện khí gas`);
    if (item.title === 'Quạt đã tắt') return gasEvents.has(`${item.at}:Khí gas đã an toàn`);
    return item.title !== 'Bắt đầu theo dõi' &&
      !/^(?:LED hai màu:|Còi:|Tốc độ quạt:)/.test(item.title);
  });
}

export function xoaLichSuTheoNguon(items, source) {
  if (source === 'all') return [];
  return items.filter(item => (item.source === 'user' ? 'user' : 'system') !== source);
}

export function themLichSu(hienCo, thayDoi, gioiHan = 100) {
  return [...thayDoi.slice().reverse(), ...hienCo].slice(0, gioiHan);
}
