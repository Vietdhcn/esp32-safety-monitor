import test from 'node:test';
import assert from 'node:assert/strict';
import { taoKhoMauLichSu } from '../docs/history-samples-store.js';

test('sample archive has no item cap, replaces a minute, filters ranges and isolates accounts', async () => {
  const data = new Map();
  const localStorage = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key)
  };
  const first = taoKhoMauLichSu('device:one', { indexedDB: null, localStorage });
  const second = taoKhoMauLichSu('device:two', { indexedDB: null, localStorage });
  for (let minute = 0; minute < 125; minute++) {
    await first.save({ at: 1_700_000_000_000 + minute * 60_000, temperatureC: minute });
  }
  await first.save({ at: 1_700_000_000_000 + 124 * 60_000 + 5_000, temperatureC: 999 });
  await second.save({ at: 1_700_000_000_000, temperatureC: 12 });
  const all = await first.range(1_700_000_000_000, 1_700_000_000_000 + 125 * 60_000);
  assert.equal(all.length, 125);
  assert.equal(all.at(-1).temperatureC, 999);
  assert.equal((await first.range(all[100].at, all[105].at)).length, 6);
  assert.equal((await second.range(0, Infinity)).length, 1);
  assert.equal(await first.hasAny(), true);
  await first.clear();
  assert.deepEqual(await first.range(0, Infinity), []);
  assert.equal(await first.hasAny(), false);
  assert.equal((await second.range(0, Infinity)).length, 1);
});
