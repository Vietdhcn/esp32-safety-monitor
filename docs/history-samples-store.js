const DB_NAME = 'safety-dashboard-history';
const STORE_NAME = 'samples';
const MINUTE = 60_000;

function openDatabase(indexedDB) {
  if (!indexedDB) return Promise.resolve(null);
  return new Promise(resolve => {
    let request;
    try { request = indexedDB.open(DB_NAME, 1); }
    catch { resolve(null); return; }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME))
        request.result.createObjectStore(STORE_NAME, { keyPath: ['scope', 'minute'] });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function transactionResult(db, mode, run) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const request = run(transaction.objectStore(STORE_NAME));
    let result;
    request.onsuccess = () => { result = request.result; };
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error || new Error('Không lưu được lịch sử.'));
    transaction.onabort = () => reject(transaction.error || new Error('Không lưu được lịch sử.'));
  });
}

export function taoKhoMauLichSu(scope, options = {}) {
  const indexedDB = options.indexedDB === undefined ? globalThis.indexedDB : options.indexedDB;
  const localStorage = options.localStorage === undefined ? globalThis.localStorage : options.localStorage;
  const database = openDatabase(indexedDB);
  const localKey = `safety-samples:${scope}`;
  const keyRange = (from, to) => IDBKeyRange.bound(
    [scope, Math.floor(Math.max(0, from) / MINUTE)],
    [scope, Math.floor((Number.isFinite(to) ? to : Number.MAX_SAFE_INTEGER) / MINUTE)]
  );
  const localRead = () => {
    try {
      const data = JSON.parse(localStorage?.getItem(localKey) || '[]');
      return Array.isArray(data) ? data : [];
    } catch { return []; }
  };
  let migration = Promise.resolve();
  async function migrateLegacy(prefix) {
    const db = await database;
    const isLegacy = record => record.scope?.startsWith(prefix) &&
      record.scope !== scope && record.scope !== `${prefix}demo`;
    if (db) {
      const candidates = await transactionResult(db, 'readonly', store => store.getAll(
        IDBKeyRange.bound([prefix, 0], [`${prefix}\uffff`, Number.MAX_SAFE_INTEGER])));
      const legacy = candidates.filter(isLegacy);
      if (!legacy.length) return 0;
      const current = await transactionResult(db, 'readonly', store => store.getAll(keyRange(0, Infinity)));
      const byMinute = new Map(current.map(record => [record.minute, record]));
      for (const record of legacy) {
        const existing = byMinute.get(record.minute);
        if (!existing || record.at > existing.at) byMinute.set(record.minute, { ...record, scope });
      }
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        for (const record of byMinute.values()) store.put(record);
        for (const record of legacy) store.delete([record.scope, record.minute]);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('Không chuyển được lịch sử số đo.'));
        tx.onabort = () => reject(tx.error || new Error('Không chuyển được lịch sử số đo.'));
      });
      return legacy.length;
    }
    const keys = [];
    for (let index = 0; index < (localStorage?.length || 0); index++) {
      const key = localStorage.key(index);
      if (key?.startsWith(`safety-samples:${prefix}`) && key !== localKey &&
        key !== `safety-samples:${prefix}demo`) keys.push(key);
    }
    if (!keys.length) return 0;
    const byMinute = new Map(localRead().map(record => [record.minute, record]));
    const validKeys = [];
    for (const key of keys) {
      let records;
      try { records = JSON.parse(localStorage.getItem(key) || '[]'); }
      catch { continue; }
      if (!Array.isArray(records)) continue;
      validKeys.push(key);
      for (const record of records) {
        if (!Number.isFinite(record?.at) || record.at <= 0) continue;
        const minute = Math.floor(record.at / MINUTE);
        const existing = byMinute.get(minute);
        if (!existing || record.at > existing.at) byMinute.set(minute, { ...record, scope, minute });
      }
    }
    if (!validKeys.length) return 0;
    localStorage.setItem(localKey, JSON.stringify([...byMinute.values()].sort((a, b) => a.minute - b.minute)));
    for (const key of validKeys) localStorage.removeItem(key);
    return validKeys.length;
  }
  return {
    migrateLegacy(prefix) {
      const task = migration.then(() => migrateLegacy(prefix));
      migration = task.catch(() => {});
      return task;
    },
    async save(sample) {
      if (!Number.isFinite(sample?.at) || sample.at <= 0) return;
      await migration;
      const record = { ...sample, scope, minute: Math.floor(sample.at / MINUTE) };
      const db = await database;
      if (db) return transactionResult(db, 'readwrite', store => store.put(record));
      const data = localRead();
      const index = data.findIndex(item => item.minute === record.minute);
      if (index < 0) data.push(record);
      else data[index] = record;
      data.sort((a, b) => a.minute - b.minute);
      localStorage.setItem(localKey, JSON.stringify(data));
    },
    async range(from, to) {
      await migration;
      const db = await database;
      const data = db ? await transactionResult(db, 'readonly', store => store.getAll(keyRange(from, to))) : localRead();
      return data.filter(sample => sample.at >= from && sample.at <= to).sort((a, b) => a.at - b.at);
    },
    async hasAny() {
      await migration;
      const db = await database;
      return db ? Boolean((await transactionResult(db, 'readonly', store =>
        store.getAllKeys(keyRange(0, Infinity), 1))).length) : localRead().length > 0;
    },
    async clear() {
      await migration;
      const db = await database;
      if (db) await transactionResult(db, 'readwrite', store => store.delete(keyRange(0, Infinity)));
      else localStorage.removeItem(localKey);
    }
  };
}
