import test from 'node:test';
import assert from 'node:assert/strict';
import * as historyModel from '../docs/history-model.js';

const { cacThayDoiLichSu, themLichSu } = historyModel;

const reading = (overrides = {}) => ({
  flameDetected: false, gasAlarm: false, fanOn: false, buzzerOn: false,
  alarmLedOn: false, statusLedOn: true, appliedCommandId: 'startup',
  alarmLedMode: 'auto', statusLedMode: 'auto', buzzerMode: 'auto',
  updatedAt: 1_700_000_000_000, ...overrides
});

test('history records first reading and meaningful changes, not repeated telemetry', () => {
  const first = reading();
  assert.deepEqual(cacThayDoiLichSu(null, first), [], 'connecting to the device is not an alarm event');
  assert.deepEqual(cacThayDoiLichSu(first, reading({ updatedAt: first.updatedAt + 5000 })), []);
  const changes = cacThayDoiLichSu(first, reading({ gasAlarm: true, fanOn: true, buzzerOn: true,
    alarmLedOn: true, statusLedOn: false, updatedAt: first.updatedAt + 5000 }));
  assert.deepEqual(changes.map(item => item.title), ['Phát hiện khí gas']);
  assert.ok(changes.every(item => item.source === 'system' && item.at === first.updatedAt + 5000));
});

test('system history records only safety alarm transitions, not automatic or manual outputs', () => {
  const first = reading();
  const manual = reading({ fanOn: true, buzzerOn: true, alarmLedOn: true, statusLedOn: false,
    alarmLedMode: 'on', statusLedMode: 'off', buzzerMode: 'on', appliedCommandId: 'pressed-1' });
  assert.deepEqual(cacThayDoiLichSu(first, manual), [], 'manual acknowledgement must not duplicate button logs');
  const flameAndManualFan = reading({ flameDetected: true, fanOn: true, appliedCommandId: 'pressed-4' });
  assert.deepEqual(cacThayDoiLichSu(first, flameAndManualFan).map(item => item.title),
    ['Phát hiện lửa'], 'a simultaneous flame alarm must not make a manual fan command look automatic');
  const alarm = reading({ ...manual, gasAlarm: true, updatedAt: first.updatedAt + 5000 });
  assert.deepEqual(cacThayDoiLichSu(manual, alarm).map(item => item.title), ['Phát hiện khí gas']);
  const autoResume = reading({ ...alarm, fanOn: false, buzzerOn: false, alarmLedOn: false,
    updatedAt: first.updatedAt + 10_000 });
  assert.deepEqual(cacThayDoiLichSu(alarm, autoResume), []);
  const recovered = reading({ ...autoResume, gasAlarm: false, updatedAt: first.updatedAt + 15_000 });
  assert.deepEqual(cacThayDoiLichSu(autoResume, recovered).map(item => item.title), ['Khí gas đã an toàn']);
});

test('history separates device events from buttons pressed by this user', () => {
  assert.equal(typeof historyModel.lichSuThaoTac, 'function');
  assert.equal(typeof historyModel.locLichSu, 'function');
  const { lichSuThaoTac, locLichSu } = historyModel;
  const system = cacThayDoiLichSu(reading(), reading({ gasAlarm: true, updatedAt: 1_700_000_005_000 }))[0];
  const press = lichSuThaoTac({ fanOn: true }, 1_700_000_005_500, 'sent');
  assert.equal(press.source, 'user');
  assert.match(press.title, /Bật quạt/);
  assert.match(press.detail, /Đã gửi/);
  assert.deepEqual(locLichSu([press, system], 'user'), [press]);
  assert.deepEqual(locLichSu([press, system], 'system'), [system]);
  assert.deepEqual(locLichSu([press, system], 'all'), [press, system]);
  assert.match(lichSuThaoTac({ alarmLedMode: 'off' }, 1_700_000_005_500, 'failed').detail, /thất bại/);
  assert.deepEqual(
    (({ actorUid, actorEmail }) => ({ actorUid, actorEmail }))(
      lichSuThaoTac({ fanOn: true }, 1_700_000_005_500, 'sent', { uid: 'operator-1', email: 'operator@example.com' })),
    { actorUid: 'operator-1', actorEmail: 'operator@example.com' });
});

test('history search filters by local calendar day together with source', () => {
  const day = new Date(2026, 9, 18);
  const previous = new Date(2026, 9, 17, 23, 59, 59, 999);
  const next = new Date(2026, 9, 19);
  const entries = [
    { at: previous.getTime(), source: 'system' },
    { at: day.getTime(), source: 'system' },
    { at: new Date(2026, 9, 18, 23, 59, 59, 999).getTime(), source: 'user' },
    { at: next.getTime(), source: 'user' }
  ];
  assert.deepEqual(historyModel.locLichSu(entries, 'all', '2026-10-18'), entries.slice(1, 3));
  assert.deepEqual(historyModel.locLichSu(entries, 'system', '2026-10-18'), [entries[1]]);
  assert.deepEqual(historyModel.locLichSu(entries, 'user', '2026-10-18'), [entries[2]]);
  assert.deepEqual(historyModel.locLichSu(entries, 'all', '2026-10-20'), []);
  assert.deepEqual(historyModel.locLichSu(entries, 'all', ''), entries);
});

test('report date ranges use local days and switch between minute and daily charts', () => {
  const { khoangNgayBaoCao } = historyModel;
  const now = new Date(2026, 9, 18, 16, 30, 0).getTime();
  const start = (day, month = 9) => new Date(2026, month, day).getTime();
  assert.deepEqual(khoangNgayBaoCao('today', now),
    { from: start(18), to: now, perMinute: true, fromDay: '2026-10-18', toDay: '2026-10-18' });
  assert.deepEqual(khoangNgayBaoCao('yesterday', now),
    { from: start(17), to: start(18) - 1, perMinute: true, fromDay: '2026-10-17', toDay: '2026-10-17' });
  assert.equal(khoangNgayBaoCao('week', now).from, start(12));
  assert.equal(khoangNgayBaoCao('month', now).from, new Date(2026, 8, 19).getTime());
  assert.deepEqual(khoangNgayBaoCao('custom', now, '2026-10-08', '2026-10-10'),
    { from: start(8), to: start(11) - 1, perMinute: false, fromDay: '2026-10-08', toDay: '2026-10-10' });
  assert.deepEqual(khoangNgayBaoCao('custom', now, '2026-10-18', '2026-10-18'),
    { from: start(18), to: now, perMinute: true, fromDay: '2026-10-18', toDay: '2026-10-18' });
  assert.throws(() => khoangNgayBaoCao('custom', now, '2026-10-19', '2026-10-20'));
  assert.throws(() => khoangNgayBaoCao('custom', now, '2026-10-18', '2026-10-17'));
  assert.throws(() => khoangNgayBaoCao('custom', now, '2026-01-01', '2026-10-18'));
});

test('history deletion removes only the chosen source, including legacy system entries', () => {
  const entries = [
    { title: 'system', source: 'system' },
    { title: 'user', source: 'user' },
    { title: 'legacy' }
  ];
  assert.deepEqual(historyModel.xoaLichSuTheoNguon(entries, 'system'), [entries[1]]);
  assert.deepEqual(historyModel.xoaLichSuTheoNguon(entries, 'user'), [entries[0], entries[2]]);
  assert.deepEqual(historyModel.xoaLichSuTheoNguon(entries, 'all'), []);
});

test('stored history keeps only safety alarm transitions and user actions', () => {
  const at = 1_700_000_000_000;
  const old = [
    { at, source: 'system', title: 'Phát hiện khí gas' },
    { at, source: 'system', title: 'Quạt đã bật' },
    { at: at + 1000, source: 'system', title: 'Quạt đã tắt' },
    { at: at + 2000, source: 'system', title: 'Còi: Bật' },
    { at: at + 3000, source: 'system', title: 'LED hai màu: Đỏ' },
    { at: at + 4000, source: 'system', title: 'Tốc độ quạt: 60%' },
    { at: at + 5000, source: 'system', title: 'Bắt đầu theo dõi' },
    { at: at + 6000, source: 'user', title: 'Bật quạt' },
    { at: at + 7000, source: 'system', title: 'Phát hiện lửa' },
    { at: at + 8000, source: 'system', title: 'Lửa đã an toàn' },
    { at: at + 9000, source: 'system', title: 'Khí gas đã an toàn' }
  ];
  assert.deepEqual(historyModel.lamSachLichSuHeThongCu(old).map(item => item.title),
    ['Phát hiện khí gas', 'Bật quạt', 'Phát hiện lửa', 'Lửa đã an toàn', 'Khí gas đã an toàn']);
});

test('manual bicolor LED mode change does not create a system entry', () => {
  const entries = cacThayDoiLichSu(reading(), reading({ alarmLedMode: 'on', statusLedMode: 'off',
    alarmLedOn: true, statusLedOn: false, appliedCommandId: 'pressed-2' }));
  assert.deepEqual(entries, []);
  assert.equal(historyModel.lichSuThaoTac({ ledMode: 'green' }, 1_700_000_005_500).title, 'Đèn hai màu: Xanh');
});

test('legacy speed readings do not create new history events', () => {
  const initial = reading({ fanSpeedPct: 100 });
  const updated = reading({ fanSpeedPct: 30, fanOn: true, appliedCommandId: 'pressed-3' });
  assert.deepEqual(cacThayDoiLichSu(initial, updated), []);
  assert.equal(historyModel.lichSuThaoTac({ fanSpeedPct: 30 }, 1_700_000_005_500), null);
  assert.deepEqual(cacThayDoiLichSu(updated, reading({ fanSpeedPct: 30, fanOn: true })), []);
});

test('history ignores invalid readings and keeps every saved event', () => {
  assert.deepEqual(cacThayDoiLichSu(reading(), reading({ updatedAt: null, gasAlarm: true })), []);
  const items = Array.from({ length: 250 }, (_, i) => ({ at: i, title: String(i), kind: 'user' }));
  assert.equal(themLichSu([], items).length, 250);
  assert.equal(themLichSu([], items)[0].title, '249');
});

test('dashboard sample and range statistics cover temperature, humidity and alarms', () => {
  const { mauDoLichSu, thongKeLichSu, duongBieuDo } = historyModel;
  const at = 1_700_000_000_000;
  const samples = [
    mauDoLichSu(reading({ updatedAt: at, temperatureC: 25, humidityPct: 60 })),
    mauDoLichSu(reading({ updatedAt: at + 60_000, temperatureC: 27, humidityPct: 64, gasAlarm: true })),
    mauDoLichSu(reading({ updatedAt: at + 120_000, temperatureC: null, humidityPct: 62, flameDetected: true }))
  ];
  const events = [
    { at: at + 61_000, source: 'system', title: 'Phát hiện khí gas' },
    { at: at + 62_000, source: 'system', title: 'Phát hiện lửa' },
    { at: at + 63_000, source: 'user', title: 'Bật quạt' },
    { at: at - 1000, source: 'user', title: 'Tắt quạt' }
  ];
  const summary = thongKeLichSu(samples, events, at, at + 120_000);
  assert.deepEqual(summary.temperature, { latest: 27, min: 25, max: 27, average: 26, count: 2 });
  assert.deepEqual(summary.humidity, { latest: 62, min: 60, max: 64, average: 62, count: 3 });
  assert.deepEqual(summary.alerts, { flame: 1, gas: 1, user: 1 });
  assert.equal(samples[1].gasAlarm, true);
  assert.match(duongBieuDo(samples, 'temperatureC', at, at + 120_000), /^M /);
  assert.equal(mauDoLichSu(reading({ updatedAt: null, temperatureC: 25 })), null);
  assert.equal(mauDoLichSu(reading({ temperatureC: null, humidityPct: null })), null);
});

test('activity buckets separate flame, gas and button presses across the selected period', () => {
  const from = 1_700_000_000_000;
  const bins = historyModel.nhomHoatDong([
    { at: from + 10, source: 'system', title: 'Phát hiện lửa' },
    { at: from + 20, source: 'system', title: 'Phát hiện khí gas' },
    { at: from + 51, source: 'user', title: 'Bật quạt' },
    { at: from + 52, source: 'system', title: 'Lửa đã an toàn' }
  ], from, from + 100, 2);
  assert.deepEqual(bins.map(({ flame, gas, user }) => ({ flame, gas, user })),
    [{ flame: 1, gas: 1, user: 0 }, { flame: 0, gas: 0, user: 1 }]);
});

test('daily alert buckets use local calendar dates and ignore user actions', () => {
  const start = new Date(2026, 9, 16, 0, 0, 0).getTime();
  const end = new Date(2026, 9, 18, 12, 0, 0).getTime();
  const events = [
    { at: new Date(2026, 9, 16, 23, 59).getTime(), source: 'system', title: 'Phát hiện khí gas' },
    { at: new Date(2026, 9, 17, 0, 1).getTime(), source: 'system', title: 'Phát hiện lửa' },
    { at: new Date(2026, 9, 17, 1, 0).getTime(), source: 'user', title: 'Bật quạt' },
    { at: new Date(2026, 9, 17, 2, 0).getTime(), source: 'system', title: 'Lửa đã an toàn' },
    { at: new Date(2026, 9, 18, 11, 0).getTime(), source: 'system', title: 'Phát hiện lửa' }
  ];
  const bins = historyModel.nhomCanhBaoTheoNgay(events, start, end);
  assert.deepEqual(bins.map(bin => [new Date(bin.at).getDate(), bin.flame, bin.gas]),
    [[16, 0, 1], [17, 1, 0], [18, 1, 0]]);
});

test('daily measurement chart averages each metric independently by local calendar day', () => {
  const day = (date, hour, minute = 0) => new Date(2026, 9, date, hour, minute).getTime();
  const from = day(16, 0);
  const to = day(18, 12);
  const samples = [
    { at: day(16, 9), temperatureC: 20, humidityPct: 50 },
    { at: day(16, 10), temperatureC: 30, humidityPct: null },
    { at: day(16, 11), temperatureC: null, humidityPct: 70 },
    { at: day(18, 9), temperatureC: 28, humidityPct: 80 },
    { at: day(18, 13), temperatureC: 99, humidityPct: 99 },
    { at: day(15, 23), temperatureC: 99, humidityPct: 99 }
  ];
  assert.deepEqual(historyModel.trungBinhMauTheoNgay(samples, from, to), [
    { at: day(16, 0), temperatureC: 25, humidityPct: 60 },
    { at: day(18, 0), temperatureC: 28, humidityPct: 80 }
  ]);
});

test('chart leaves a gap across days without measurements', () => {
  const from = new Date(2026, 9, 16).getTime();
  const to = new Date(2026, 9, 20).getTime();
  const daily = [
    { at: from, temperatureC: 25 },
    { at: new Date(2026, 9, 18).getTime(), temperatureC: 27 }
  ];
  assert.equal((historyModel.duongBieuDo(daily, 'temperatureC', from, to, 36 * 60 * 60 * 1000)
    .match(/\bM /g) || []).length, 2);
});
