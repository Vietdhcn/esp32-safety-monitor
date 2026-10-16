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

export function themLichSu(hienCo, thayDoi, gioiHan = 100) {
  return [...thayDoi.slice().reverse(), ...hienCo].slice(0, gioiHan);
}
