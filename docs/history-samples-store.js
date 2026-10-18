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
  return {
    async save(sample) {
      if (!Number.isFinite(sample?.at) || sample.at <= 0) return;
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
      const db = await database;
      const data = db ? await transactionResult(db, 'readonly', store => store.getAll(keyRange(from, to))) : localRead();
      return data.filter(sample => sample.at >= from && sample.at <= to).sort((a, b) => a.at - b.at);
    },
    async hasAny() {
      const db = await database;
      return db ? Boolean((await transactionResult(db, 'readonly', store =>
        store.getAllKeys(keyRange(0, Infinity), 1))).length) : localRead().length > 0;
    },
    async clear() {
      const db = await database;
      if (db) await transactionResult(db, 'readwrite', store => store.delete(keyRange(0, Infinity)));
      else localStorage.removeItem(localKey);
    }
  };
}
