import { lamSachLichSuHeThongCu } from './history-model.js';

function docBanGhi(storage, key, actorUid = null) {
  try {
    const saved = JSON.parse(storage.getItem(key) || 'null');
    if (!saved || typeof saved !== 'object') return null;
    const items = Array.isArray(saved.items) ? lamSachLichSuHeThongCu(saved.items.filter(item =>
      Number.isFinite(item?.at) && item.at > 0 && item.at <= 8_640_000_000_000_000 &&
      typeof item.title === 'string' && typeof item.detail === 'string' &&
      ['info', 'safe', 'danger', 'device', 'user'].includes(item.kind)).map(item => ({
        ...item, source: item.source === 'user' ? 'user' : 'system',
        ...(item.source === 'user' && actorUid && !item.actorUid ? { actorUid } : {})
      }))) : [];
    return { ...saved, items };
  } catch { return null; }
}

export function taiLichSuTheoThietBi(storage, deviceId) {
  const prefix = `safety-history:${deviceId}:`;
  const sharedKey = `${prefix}shared`;
  const shared = docBanGhi(storage, sharedKey);
  const legacy = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith(prefix) || key === sharedKey || key === `${prefix}demo`) continue;
    const record = docBanGhi(storage, key, key.slice(prefix.length));
    if (record) legacy.push({ key, record });
  }
  if (!legacy.length) return { key: sharedKey, data: shared, saved: true };

  const seen = new Set();
  const items = [...(shared?.items || []), ...legacy.flatMap(({ record }) => record.items)]
    .sort((a, b) => b.at - a.at).filter(item => {
      const signature = `${item.at}|${item.source}|${item.title}|${item.source === 'user' ? item.actorUid || '' : ''}`;
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    });
  const records = [shared, ...legacy.map(({ record }) => record)].filter(Boolean);
  const previous = records.map(record => record.previous).filter(value => Number.isFinite(value?.updatedAt))
    .sort((a, b) => b.updatedAt - a.updatedAt)[0] || null;
  const data = { version: 4, items, previous,
    cleared: items.length === 0 && records.some(record => record.cleared === true) };
  try {
    storage.setItem(sharedKey, JSON.stringify(data));
    for (const { key } of legacy) storage.removeItem(key);
    return { key: sharedKey, data, saved: true };
  } catch {
    return { key: sharedKey, data, saved: false };
  }
}
