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
  assert.deepEqual(changes.map(item => item.title),
    ['Phát hiện khí gas', 'Quạt đã bật', 'Còi đã bật', 'LED đỏ đã bật', 'LED xanh đã tắt']);
  assert.ok(changes.every(item => item.source === 'system' && item.at === first.updatedAt + 5000));
});

test('manual output changes stay in user history, while later automatic changes stay in system history', () => {
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
  assert.deepEqual(cacThayDoiLichSu(alarm, autoResume).map(item => item.title),
    ['Quạt đã tắt', 'Còi đã tắt', 'LED đỏ đã tắt']);
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

test('old system history keeps gas-triggered fan events but drops manual or ambiguous output logs', () => {
  const at = 1_700_000_000_000;
  const old = [
    { at, source: 'system', title: 'Phát hiện khí gas' },
    { at, source: 'system', title: 'Quạt đã bật' },
    { at: at + 1000, source: 'system', title: 'Quạt đã tắt' },
    { at: at + 2000, source: 'system', title: 'Còi: Bật' },
    { at: at + 3000, source: 'system', title: 'LED hai màu: Đỏ' },
    { at: at + 4000, source: 'system', title: 'Tốc độ quạt: 60%' },
    { at: at + 5000, source: 'system', title: 'Bắt đầu theo dõi' },
    { at: at + 6000, source: 'user', title: 'Bật quạt' }
  ];
  assert.deepEqual(historyModel.lamSachLichSuHeThongCu(old).map(item => item.title),
    ['Phát hiện khí gas', 'Quạt đã bật', 'Bật quạt']);
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

test('history ignores invalid readings and bounds the saved list', () => {
  assert.deepEqual(cacThayDoiLichSu(reading(), reading({ updatedAt: null, gasAlarm: true })), []);
  const items = Array.from({ length: 101 }, (_, i) => ({ at: i, title: String(i), kind: 'device' }));
  assert.equal(themLichSu([], items).length, 100);
  assert.equal(themLichSu([], items)[0].title, '100');
});
