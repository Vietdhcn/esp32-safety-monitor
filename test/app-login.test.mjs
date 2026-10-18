import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('authenticated controls send atomic commands and await device acknowledgement', async t => {
  const html = await readFile(new URL('../docs/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="fan-off"/);
  assert.match(html, /id="fan-on"/);
  assert.match(html, /id="fan-auto"/);
  assert.doesNotMatch(html, /id="notice-details"|id="notice-count"|id="noise-text"/,
    'the single-purpose device notice is removed from the dashboard');
  assert.doesNotMatch(html.match(/<section class="metric-grid"[\s\S]*?<\/section>/)?.[0] ?? '', /Quạt thông gió/);
  for (const ids of [['led-red', 'led-green', 'led-off', 'led-auto'], ['buzzerMode-on', 'buzzerMode-off', 'buzzerMode-auto'], ['fan-off', 'fan-on', 'fan-auto']]) {
    const positions = ids.map(id => html.indexOf(`id="${id}"`));
    assert.ok(positions.every((position, index) => index === 0 || positions[index - 1] < position), `${ids.join(', ')} must appear in visual order`);
  }
  assert.doesNotMatch(html, /id="fan-(?:30|60|90|100)"/);
  assert.match(html, /id="operator-list"/, 'the owner needs a list of granted accounts');
  const originals = new Map(['document', 'window', 'localStorage', 'setInterval', '__firebaseLoginTest']
    .map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const nodes = new Map();
  const createNode = () => ({ hidden: false, style: {}, dataset: {}, listeners: {}, value: '', checked: false, attributes: {}, children: [],
    classList: { toggle() {} }, closest() { return this; }, setAttribute(key, value) { this.attributes[key] = value; },
    contains(target) { return this === target; },
    addEventListener(event, callback) { this.listeners[event] = callback; },
    replaceChildren(...items) { this.children = items; }, append(...items) { this.children.push(...items); } });
  globalThis.document = { listeners: {}, addEventListener(event, callback) { this.listeners[event] = callback; },
    createElement: createNode, getElementById(id) {
    if (!nodes.has(id)) nodes.set(id, createNode());
    return nodes.get(id);
  } };
  globalThis.window = { location: { href: 'https://example.com/' }, confirm: () => true };
  const storage = new Map();
  globalThis.localStorage = {
    get length() { return storage.size; }, key: index => [...storage.keys()][index] ?? null,
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key)
  };
  globalThis.setInterval = () => 0;
  const state = globalThis.__firebaseLoginTest = {};
  const moduleUrl = code => `data:text/javascript,${encodeURIComponent(code)}`;
  const sdk = {
    'firebase-app': 'export const initializeApp = (_, name = "[DEFAULT]") => ({ name });',
    'firebase-auth': `export const getAuth = app => { const s = globalThis.__firebaseLoginTest;
        return app.name === '[DEFAULT]' ? (s.mainAuth ??= { currentUser: null }) : (s.secondaryAuth ??= { currentUser: null }); };
      export const browserLocalPersistence = 'local';
      export const browserSessionPersistence = 'session';
      export const inMemoryPersistence = 'memory';
      export const setPersistence = async (_, value) => { globalThis.__firebaseLoginTest.authCalls.push(['persistence', value]); };
      export const onAuthStateChanged = (auth, callback) => { globalThis.__firebaseLoginTest.authChanged = user => {
        auth.currentUser = user; callback(user); }; };
      export const signInWithEmailAndPassword = async (_, email, password) => {
        globalThis.__firebaseLoginTest.authCalls.push(['signIn', email, password]);
      };
      export const createUserWithEmailAndPassword = async (auth, email, password) => { const s = globalThis.__firebaseLoginTest;
        if (s.createError) throw s.createError;
        const user = { uid: 'created-operator', email }; auth.currentUser = user;
        s.created = { auth, email, password }; return { user }; };
      export const deleteUser = async user => { globalThis.__firebaseLoginTest.deletedUser = user; };
      export const signOut = async auth => { auth.currentUser = null; globalThis.__firebaseLoginTest.signedOut = auth; };
      export const EmailAuthProvider = { credential: (email, password) => ({ email, password }) };
      export const reauthenticateWithCredential = async (user, credential) => {
        const s = globalThis.__firebaseLoginTest; s.reauth = { user, credential };
        if (s.reauthError) throw s.reauthError; };
      export const updatePassword = async (user, password) => {
        globalThis.__firebaseLoginTest.passwordUpdate = { user, password }; };`,
    'firebase-database': `export const getDatabase = () => ({});
      export const ref = (_, path) => ({ path });
      export const onValue = (reference, callback, onError) => { const s = globalThis.__firebaseLoginTest;
        (s.readings ??= new Map()).set(reference.path, callback);
        (s.errors ??= new Map()).set(reference.path, onError);
        if (reference.path?.endsWith('/telemetry')) { s.path = reference.path; s.reading = callback; }
        return () => { s.readings.delete(reference.path); s.errors.delete(reference.path); }; };
      export const serverTimestamp = () => ({ '.sv': 'timestamp' });
      export const update = async (reference, values) => { const state = globalThis.__firebaseLoginTest;
        state.write = { path: reference.path, values };
        if (state.blockWrite) await state.blockWrite; };
      export const set = async (reference, value) => { const s = globalThis.__firebaseLoginTest;
        if (reference.path?.startsWith('operatorProfiles/')) {
          s.profile = { path: reference.path, value };
          if (s.profileError) throw s.profileError;
        } else {
          s.grant = { path: reference.path, value };
          if (s.grantError) throw s.grantError;
        } };`
  };
  let source = await readFile(new URL('../docs/app.js', import.meta.url), 'utf8');
  for (const name of ['config', 'dashboard-model', 'history-model', 'history-samples-store', 'history-device-store']) {
    source = source.replace(new RegExp(`'\\./${name}\\.js(?:\\?[^']*)?'`),
      JSON.stringify(new URL(`../docs/${name}.js`, import.meta.url).href));
  }
  for (const [name, code] of Object.entries(sdk)) {
    source = source.replace(`'https://www.gstatic.com/firebasejs/13.0.0/${name}.js'`, JSON.stringify(moduleUrl(code)));
  }
  await import(moduleUrl(source));
  for (const id of ['current-password', 'new-password', 'confirm-password',
    'account-email', 'account-password', 'account-confirm']) document.getElementById(id);
  state.authCalls = [];
  document.getElementById('email').value = 'owner@example.com';
  document.getElementById('password').value = 'secret-for-test';
  document.getElementById('remember-login').checked = true;
  await nodes.get('login-form').listeners.submit({ preventDefault() {} });
  assert.deepEqual(state.authCalls, [['persistence', 'local'], ['signIn', 'owner@example.com', 'secret-for-test']]);
  assert.equal(nodes.get('password').value, '');
  assert.equal([...storage.values()].some(value => value.includes('secret-for-test')), false);
  state.authCalls = [];
  nodes.get('password').value = 'another-secret';
  nodes.get('remember-login').checked = false;
  await nodes.get('login-form').listeners.submit({ preventDefault() {} });
  assert.deepEqual(state.authCalls, [['persistence', 'session'], ['signIn', 'owner@example.com', 'another-secret']]);
  assert.equal(nodes.get('speed-button')?.listeners.click, undefined,
    'the removed speed control must not submit PWM commands');
  const historyKey = 'safety-history:esp32s-30p-01:shared';
  const oldOperatorKey = 'safety-history:esp32s-30p-01:operator';
  storage.set(oldOperatorKey, JSON.stringify({ version: 2, items: [
    { at: Date.now(), source: 'system', kind: 'device', title: 'Còi: Bật', detail: 'Chế độ cũ.' },
    { at: Date.now(), source: 'system', kind: 'danger', title: 'Phát hiện khí gas', detail: 'Cảm biến.' },
    { at: Date.now(), source: 'system', kind: 'device', title: 'Quạt đã bật', detail: 'Thiết bị.' },
    { at: Date.now(), source: 'user', kind: 'user', title: 'Bật quạt', detail: 'Đã nhấn.' }
  ] }));
  storage.set('safety-history:esp32s-30p-01:other-user', JSON.stringify({ version: 3, items: [
    { at: Date.now() - 1000, source: 'user', kind: 'user', title: 'Tắt quạt', detail: 'Đã nhấn.' }
  ] }));
  assert.doesNotThrow(() => state.authChanged({ uid: 'operator' }));
  assert.ok(storage.has(historyKey), 'switching accounts must use one history for the device');
  assert.equal(JSON.parse(storage.get(historyKey)).version, 4);
  assert.deepEqual(JSON.parse(storage.get(historyKey)).items.map(item => item.title),
    ['Phát hiện khí gas', 'Bật quạt', 'Tắt quạt'], 'existing histories are merged without old output logs');
  assert.equal(storage.has(oldOperatorKey), false, 'migrated account history is removed only after shared history is saved');
  assert.equal(state.path, 'devices/esp32s-30p-01/telemetry');
  assert.equal(nodes.get('dashboard').hidden, false);
  assert.equal(nodes.get('history-view').hidden, true, 'overview is the default tab');
  assert.equal(nodes.get('tab-controls')?.listeners.click, undefined, 'controls are part of overview');
  let forcedTabScrolls = 0;
  document.getElementById('dashboard-tabs').scrollIntoView = () => { forcedTabScrolls++; };
  nodes.get('tab-history').listeners.click();
  assert.equal(nodes.get('history-view').hidden, false);
  assert.equal(nodes.get('overview-view').hidden, true);
  assert.equal(nodes.get('tab-history').attributes['aria-selected'], 'true');
  nodes.get('tab-overview').listeners.click();
  assert.equal(nodes.get('overview-view').hidden, false);
  assert.equal(nodes.get('history-view').hidden, true);
  assert.equal(forcedTabScrolls, 0, 'switching visible tabs must not force the page to jump');
  state.authChanged({ uid: 'other-user', email: 'other@example.com' });
  assert.equal(nodes.get('history-count').textContent, '3', 'another account sees the same device history');
  state.authChanged({ uid: 'operator', email: 'operator@example.com' });
  const safe = { flameDetected: false, gasAlarm: false, fanOn: false,
    controlsVersion: 2,
    alarmLedOn: false, statusLedOn: true, buzzerOn: true, alarmLedMode: 'auto',
    statusLedMode: 'auto', buzzerMode: 'auto', muteUntil: 0, updatedAt: Date.now() };
  state.reading({ val: () => safe });
  assert.equal(nodes.get('fan-mode').dataset.output, 'off');
  assert.equal(nodes.get('fan-auto').attributes['aria-pressed'], 'true');
  assert.equal(nodes.get('led-state').dataset.output, 'green');
  assert.equal(nodes.get('temperature-value').textContent, '—');
  assert.match(nodes.get('temperature-detail').textContent, /D27/,
    'missing sensor data should point to the connected GPIO');
  state.reading({ val: () => ({ ...safe, temperatureC: 28.3, humidityPct: 64.2 }) });
  assert.equal(nodes.get('temperature-value').textContent, '28.3 °C');
  assert.equal(nodes.get('humidity-value').textContent, '64.2 %');
  state.reading({ val: () => ({ ...safe, temperatureC: 28.3, humidityPct: 64.2,
    updatedAt: Date.now() - 20_000 }) });
  assert.equal(nodes.get('connection-label').textContent, 'Chờ dữ liệu mới');
  assert.equal(nodes.get('fan-mode').dataset.output, 'unknown', 'stale fan data must not look active');
  assert.equal(nodes.get('led-state').dataset.output, 'unknown', 'stale LED data must not keep its previous color');
  assert.equal(nodes.get('temperature-value').textContent, '—');
  assert.match(nodes.get('temperature-detail').textContent, /cũ/);
  state.reading({ val: () => ({ ...safe, updatedAt: Date.now() - 31_000 }) });
  assert.equal(nodes.get('connection-label').textContent, 'Thiết bị ngoại tuyến');
  state.reading({ val: () => safe });
  assert.equal(nodes.get('temperature-value').textContent, '—', 'a failed reading must clear the old value');
  assert.equal(nodes.get('humidity-value').textContent, '—');
  state.reading({ val: () => ({ ...safe, flameNoise: true, resetReason: 'brownout' }) });
  assert.equal(nodes.has('notice-details'), false, 'diagnostic telemetry must not recreate a notice');
  assert.equal(nodes.has('noise-text'), false);
  state.reading({ val: () => safe });
  state.reading({ val: () => ({ ...safe, fanSpeedSupported: true }) });
  assert.equal(nodes.get('fan-on').disabled, true, 'old PWM firmware must not accept an on/off web command');
  assert.match(nodes.get('fan-mode').textContent, /nạp firmware/);
  state.reading({ val: () => safe });
  const fanValueNode = nodes.get('fan-mode');
  let fanValueWrites = 0;
  let fanValueText = fanValueNode.textContent;
  Object.defineProperty(fanValueNode, 'textContent', {
    get() { return fanValueText; },
    set(value) { fanValueWrites++; fanValueText = value; }
  });
  state.reading({ val: () => safe });
  assert.equal(fanValueWrites, 0, 'unchanged live telemetry must not rewrite visible card text');
  const button = nodes.get('buzzerMode-off');
  assert.equal(button?.disabled, false);
  let releaseWrite;
  state.blockWrite = new Promise(resolve => { releaseWrite = resolve; });
  const buzzerClick = button.listeners.click();
  assert.equal(nodes.get('buzzerMode-state').textContent, 'Chờ tắt', 'buzzer status updates before Firebase responds');
  assert.equal(nodes.get('buzzerMode-state').dataset.pendingOutput, 'off');
  assert.equal(nodes.get('fan-on').dataset.commandLocked, 'true',
    'an otherwise available button stays visually steady while the Firebase write is pending');
  assert.equal(nodes.get('led-red').dataset.commandLocked, 'true');
  assert.equal(nodes.get('mute-button').dataset.commandLocked, 'false',
    'a safety-disabled button must not become visually enabled while sending');
  releaseWrite();
  await buzzerClick;
  state.blockWrite = null;
  assert.equal(state.write.path, 'devices/esp32s-30p-01/commands');
  assert.equal(state.write.values.buzzerMode, 'off');
  assert.deepEqual([state.write.values.alarmLedMode, state.write.values.statusLedMode, state.write.values.fanOn],
    ['auto', 'auto', false], 'a new command must not replay LED and fan settings retained before ESP32 restarted');
  assert.ok(JSON.parse(storage.get(historyKey)).items.some(item =>
    item.source === 'user' && /Còi/.test(item.title)), 'a button press gets its own user log');
  nodes.get('history-filter-user').listeners.click();
  assert.equal(nodes.get('history-filter-user').attributes['aria-pressed'], 'true');
  assert.ok(nodes.get('history-list').children.every(item => item.className.includes('history-source-user')));
  nodes.get('history-filter-all').listeners.click();
  assert.ok(state.write.values.commandId);
  assert.match(nodes.get('command-status').textContent, /chờ ESP32/);
  assert.equal(nodes.get('fan-on').disabled, false, 'unrelated controls remain available while awaiting acknowledgement');
  state.reading({ val: () => ({ ...safe, buzzerMode: 'off', buzzerOn: false,
    appliedCommandId: state.write.values.commandId, updatedAt: Date.now() }) });
  assert.match(nodes.get('command-status').textContent, /ESP32 đã áp dụng/);
  state.blockWrite = new Promise(resolve => { releaseWrite = resolve; });
  const ledClick = nodes.get('led-green').listeners.click();
  assert.equal(nodes.get('led-state').textContent, 'Chờ chuyển xanh', 'LED status updates before Firebase responds');
  assert.equal(nodes.get('led-state').dataset.pendingOutput, 'green');
  releaseWrite();
  await ledClick;
  state.blockWrite = null;
  assert.deepEqual([state.write.values.alarmLedMode, state.write.values.statusLedMode], ['off', 'on']);
  assert.equal(nodes.get('led-state').textContent, 'Chờ chuyển xanh');
  assert.equal(nodes.get('led-green').attributes['aria-pressed'], 'true');
  state.reading({ val: () => ({ ...safe, alarmLedMode: 'off', statusLedMode: 'on',
    appliedCommandId: state.write.values.commandId, updatedAt: Date.now() }) });
  assert.equal(nodes.get('led-state').textContent, 'Đang sáng xanh');
  await nodes.get('led-off').listeners.click();
  assert.deepEqual([state.write.values.alarmLedMode, state.write.values.statusLedMode], ['off', 'off']);
  state.reading({ val: () => ({ ...safe, alarmLedMode: 'off', statusLedMode: 'off', statusLedOn: false,
    appliedCommandId: state.write.values.commandId, updatedAt: Date.now() }) });
  assert.equal(nodes.get('led-state').textContent, 'Đang tắt');
  await nodes.get('led-red').listeners.click();
  assert.deepEqual([state.write.values.alarmLedMode, state.write.values.statusLedMode], ['on', 'off']);
  const firstLedCommandId = state.write.values.commandId;
  await nodes.get('led-green').listeners.click();
  assert.deepEqual([state.write.values.alarmLedMode, state.write.values.statusLedMode], ['off', 'on'],
    'the later color choice switches off red');
  assert.equal(JSON.parse(storage.get(historyKey)).items[0].title, 'Đèn hai màu: Xanh');
  assert.equal(nodes.get('led-green').attributes['aria-pressed'], 'true');
  state.reading({ val: () => ({ ...safe, alarmLedMode: 'on', alarmLedOn: true,
    appliedCommandId: firstLedCommandId, updatedAt: Date.now() }) });
  assert.equal(nodes.get('led-green').attributes['aria-pressed'], 'true',
    'older device acknowledgement must not undo the latest color choice');
  state.reading({ val: () => ({ ...safe, alarmLedMode: 'off', statusLedMode: 'on',
    statusLedOn: true, appliedCommandId: state.write.values.commandId, updatedAt: Date.now() }) });
  state.blockWrite = new Promise(resolve => { releaseWrite = resolve; });
  const fanClick = nodes.get('fan-on').listeners.click();
  assert.equal(nodes.get('fan-mode').textContent, 'Chờ bật', 'fan status updates before Firebase responds');
  assert.equal(nodes.get('fan-mode').dataset.pendingOutput, 'on');
  releaseWrite();
  await fanClick;
  state.blockWrite = null;
  assert.equal(state.write.values.fanOn, true);
  assert.equal('fanSpeedPct' in state.write.values, false);
  assert.deepEqual([state.write.values.alarmLedMode, state.write.values.statusLedMode], ['off', 'on'],
    'an unrelated fan command preserves the selected LED color');
  const firstFanCommandId = state.write.values.commandId;
  assert.equal(nodes.get('fan-off').disabled, false, 'Firebase write must not lock controls until ESP32 acknowledgement');
  assert.equal(nodes.get('fan-on').attributes['aria-pressed'], 'true');
  assert.equal(nodes.get('fan-off').attributes['aria-pressed'], 'false');
  assert.equal(nodes.get('fan-mode').textContent, 'Chờ bật');
  assert.equal(nodes.get('fan-mode').dataset.pendingOutput, 'on', 'pending fan command highlights the row immediately');
  await nodes.get('fan-off').listeners.click();
  assert.equal(state.write.values.fanOn, false);
  assert.equal('fanSpeedPct' in state.write.values, false);
  assert.equal(nodes.get('fan-on').attributes['aria-pressed'], 'false');
  assert.equal(nodes.get('fan-off').attributes['aria-pressed'], 'true');
  assert.equal(nodes.get('fan-mode').textContent, 'Chờ tắt');
  assert.equal(nodes.get('fan-mode').dataset.pendingOutput, 'off');
  assert.notEqual(state.write.values.commandId, firstFanCommandId);
  state.reading({ val: () => ({ ...safe, fanOn: true,
    appliedCommandId: firstFanCommandId, updatedAt: Date.now() }) });
  assert.match(nodes.get('command-status').textContent, /chờ ESP32/);
  assert.equal(nodes.get('fan-off').attributes['aria-pressed'], 'true');
  state.reading({ val: () => ({ ...safe, fanOn: false,
    appliedCommandId: state.write.values.commandId, updatedAt: Date.now() }) });
  assert.match(nodes.get('command-status').textContent, /ESP32 đã áp dụng/);
  assert.equal(nodes.get('fan-mode').textContent, 'Đang tắt');
  await nodes.get('fan-auto').listeners.click();
  assert.equal(state.write.values.fanOn, false, 'automatic fan mode restores firmware safety control');
  assert.equal(nodes.get('fan-auto').attributes['aria-pressed'], 'true');
  assert.equal(nodes.get('fan-mode').textContent, 'Chờ tự động');
  state.reading({ val: () => ({ ...safe, fanOn: false,
    appliedCommandId: state.write.values.commandId, updatedAt: Date.now() }) });
  assert.equal(nodes.get('fan-mode').textContent, 'Tự động · Đang tắt');
  assert.equal(nodes.has('fan-speed'), false, 'the speed slider is no longer used');
  await nodes.get('fan-on').listeners.click();
  assert.equal(state.write.values.fanOn, true);
  assert.equal('fanSpeedPct' in state.write.values, false);
  assert.equal(nodes.get('fan-on').attributes['aria-pressed'], 'true');
  state.reading({ val: () => ({ ...safe, fanOn: true,
    appliedCommandId: state.write.values.commandId, updatedAt: Date.now() }) });
  assert.equal(nodes.get('fan-mode').dataset.output, 'on', 'the row reflects confirmed fan telemetry');
  state.reading({ val: () => ({ ...safe, gasAlarm: true }) });
  assert.equal(nodes.get('fan-on').disabled, true, 'gas alarm takes priority over manual fan control');
  assert.equal(nodes.get('fan-off').disabled, true, 'gas alarm takes priority over manual fan control');
  assert.equal(nodes.get('fan-on').attributes['aria-pressed'], 'false', 'automatic gas fan is not a manual choice');
  assert.match(nodes.get('connection-dot').className, /\balert\b/, 'gas warning turns the connection indicator red');
  assert.equal(nodes.get('safe-badge').textContent, 'Cảnh báo gas');
  assert.equal(nodes.get('flame-value').textContent, 'An toàn', 'gas alone must not appear as flame');
  assert.ok(JSON.parse(storage.get(historyKey)).items.some(item => item.title === 'Phát hiện khí gas'));
  assert.ok(JSON.parse(storage.get(historyKey)).items
    .filter(item => item.source === 'system')
    .every(item => ['Phát hiện lửa', 'Phát hiện khí gas', 'Lửa đã an toàn', 'Khí gas đã an toàn'].includes(item.title)),
  'system history contains only safety alarm transitions after live telemetry and commands');
  nodes.get('clear-history-system').listeners.click();
  assert.ok(JSON.parse(storage.get(historyKey)).items.every(item => item.source === 'user'));
  assert.equal(nodes.get('clear-history-system').disabled, true);
  assert.equal(nodes.get('clear-history-user').disabled, false);
  nodes.get('clear-history-user').listeners.click();
  assert.deepEqual(JSON.parse(storage.get(historyKey)).items, []);
  state.reading({ val: () => ({ ...safe, updatedAt: Date.now() }) });
  await nodes.get('buzzerMode-off').listeners.click();
  const beforeClearAll = JSON.parse(storage.get(historyKey)).items;
  assert.ok(beforeClearAll.some(item => item.source === 'system'));
  assert.ok(beforeClearAll.some(item => item.source === 'user'));
  nodes.get('clear-history-all').listeners.click();
  assert.deepEqual(JSON.parse(storage.get(historyKey)).items, []);
  assert.match(nodes.get('history-status').textContent, /Đã xóa lịch sử/);
  state.reading({ val: () => ({ ...safe, gasAlarm: true, updatedAt: Date.now() }) });
  await nodes.get('mute-button').listeners.click();
  assert.deepEqual(state.write.values.muteRequestedAt, { '.sv': 'timestamp' });
  state.reading({ val: () => ({ ...safe, gasAlarm: true, logicVersion: 3, muteUntil: Date.now() + 30_000 }) });
  assert.match(nodes.get('mute-description').textContent, /Còi đang tắt tiếng/);
  state.reading({ val: () => ({ ...safe, gasAlarm: true, flameDetected: true, fanOn: false,
    fanReason: 'blocked', logicVersion: 4, muteUntil: Date.now() + 30_000 }) });
  assert.doesNotMatch(nodes.get('mute-description').textContent, /quạt vẫn chạy/);
  assert.doesNotMatch(html, /id="suppression-banner"/, 'mute status belongs beside the mute control');

  state.reading({ val: () => ({ ...safe, updatedAt: Date.now() }) });
  await nodes.get('led-red').listeners.click();
  await nodes.get('buzzerMode-off').listeners.click();
  assert.equal(nodes.get('buzzerMode-state').textContent, 'Chờ tắt');
  await nodes.get('fan-on').listeners.click();
  assert.equal(state.write.values.buzzerMode, 'off', 'fan command carries the pending buzzer choice');
  assert.deepEqual([state.write.values.alarmLedMode, state.write.values.statusLedMode], ['on', 'off']);
  assert.equal(nodes.get('led-red').attributes['aria-pressed'], 'true');
  assert.equal(nodes.get('led-state').textContent, 'Chờ chuyển đỏ');
  assert.equal(nodes.get('buzzerMode-off').attributes['aria-pressed'], 'true',
    'fan click must not make the buzzer choice jump back to old telemetry');
  assert.equal(nodes.get('buzzerMode-state').textContent, 'Chờ tắt',
    'the buzzer remains pending until the latest combined command is acknowledged');
  for (const choice of ['off', 'auto']) {
    await nodes.get('fan-' + choice).listeners.click();
    assert.equal(nodes.get('led-red').attributes['aria-pressed'], 'true');
    assert.equal(nodes.get('led-state').textContent, 'Chờ chuyển đỏ');
    assert.equal(nodes.get('buzzerMode-off').attributes['aria-pressed'], 'true',
      `fan ${choice} must preserve the pending buzzer choice`);
    assert.equal(nodes.get('buzzerMode-state').textContent, 'Chờ tắt');
  }

  state.authChanged({ uid: 'operator', email: 'operator@example.com' });
  assert.equal(nodes.get('tab-account').hidden, false);
  assert.equal(nodes.get('operator-management-section').hidden, true);
  assert.equal(nodes.get('wifi-settings-section').hidden, true,
    'operators must not see Wi-Fi credentials');
  nodes.get('wifi-ssid').value = 'New network';
  nodes.get('wifi-password').value = 'new-password';
  await nodes.get('wifi-settings-form').listeners.submit({ preventDefault() {} });
  assert.notEqual(state.grant?.path, 'devices/esp32s-30p-01/commands/wifi',
    'operators cannot submit a hidden Wi-Fi form');
  assert.equal(nodes.get('create-account-section').hidden, true,
    'an operator cannot create another account');
  nodes.get('account-email').value = 'unauthorized@example.com';
  nodes.get('account-password').value = 'temporary-123';
  nodes.get('account-confirm').value = 'temporary-123';
  await nodes.get('create-account-form').listeners.submit({ preventDefault() {} });
  assert.equal(state.created, undefined, 'an operator cannot invoke account creation through a hidden form');
  nodes.get('tab-account').listeners.click();
  assert.equal(nodes.get('account-view').hidden, false);
  nodes.get('current-password').value = 'old-password';
  nodes.get('new-password').value = 'new-password-123';
  nodes.get('confirm-password').value = 'different';
  await nodes.get('change-password-form').listeners.submit({ preventDefault() {} });
  assert.equal(state.reauth, undefined, 'mismatched confirmation must not call Firebase');
  nodes.get('current-password').value = 'old-password';
  nodes.get('new-password').value = 'new-password-123';
  nodes.get('confirm-password').value = 'new-password-123';
  await nodes.get('change-password-form').listeners.submit({ preventDefault() {} });
  assert.deepEqual(state.reauth.credential, { email: 'operator@example.com', password: 'old-password' });
  assert.deepEqual(state.passwordUpdate, { user: state.mainAuth.currentUser, password: 'new-password-123' });
  assert.equal(nodes.get('current-password').value, '');
  assert.equal(nodes.get('new-password').value, '');
  assert.match(nodes.get('change-password-status').textContent, /đã đổi/i);
  state.reauthError = { code: 'auth/wrong-password' };
  state.passwordUpdate = undefined;
  nodes.get('current-password').value = 'incorrect';
  nodes.get('new-password').value = 'another-password-123';
  nodes.get('confirm-password').value = 'another-password-123';
  await nodes.get('change-password-form').listeners.submit({ preventDefault() {} });
  assert.equal(state.passwordUpdate, undefined, 'wrong current password must not update Firebase');
  assert.match(nodes.get('change-password-status').textContent, /không đúng/i);
  assert.equal(nodes.get('current-password').value, '');
  delete state.reauthError;

  nodes.get('show-change-passwords').checked = true;
  nodes.get('show-change-passwords').listeners.change();
  assert.equal(nodes.get('new-password').type, 'text');
  nodes.get('show-change-passwords').checked = false;
  nodes.get('show-change-passwords').listeners.change();
  assert.equal(nodes.get('new-password').type, 'password');

  state.authChanged({ uid: 'NK23PFt0RAe14EKVUiFFNjDXMsv2', email: 'owner@example.com' });
  assert.equal(nodes.get('operator-management-section').hidden, false);
  assert.ok(state.readings.has('operators'), 'owner can subscribe to granted operator UIDs');
  assert.ok(state.readings.has('operatorProfiles'), 'owner can subscribe to saved operator emails');
  state.readings.get('operators')({ val: () => ({ 'old-uid': true, 'created-operator': true }) });
  assert.equal(nodes.get('operator-list').children.length, 2,
    'granted accounts appear even before email profiles load');
  state.errors.get('operatorProfiles')({ code: 'PERMISSION_DENIED' });
  assert.equal(nodes.get('operator-list').children.length, 2,
    'a denied profile read must not hide granted accounts');
  assert.equal(nodes.get('operator-count').textContent, '2');
  assert.match(nodes.get('operator-list-status').textContent, /email.*UID/i);
  state.readings.get('operatorProfiles')({ val: () => ({ 'created-operator': { email: 'new@example.com' } }) });
  assert.equal(nodes.get('operator-list').children.length, 2);
  assert.ok(nodes.get('operator-list').children.some(row => row.children.some(child =>
    child.textContent === 'new@example.com')), 'new accounts show their email');
  assert.ok(nodes.get('operator-list').children.some(row => row.children.some(child =>
    child.textContent?.includes('old-uid'))), 'older accounts fall back to UID');
  assert.equal(nodes.get('wifi-settings-section').hidden, false);
  state.reading({ val: () => ({ ...safe, wifiConfigVersion: 2, wifiSsid: 'Old network',
    wifiSavedSsids: ['Old network'], updatedAt: Date.now() }) });
  assert.equal(nodes.get('wifi-current-ssid').textContent, 'Old network');
  nodes.get('show-wifi-password').checked = true;
  nodes.get('show-wifi-password').listeners.change();
  assert.equal(nodes.get('wifi-password').type, 'text');
  nodes.get('show-wifi-password').checked = false;
  nodes.get('show-wifi-password').listeners.change();
  assert.equal(nodes.get('wifi-password').type, 'password');
  nodes.get('wifi-ssid').value = 'New network';
  nodes.get('wifi-password').value = 'new-password';
  await nodes.get('wifi-settings-form').listeners.submit({ preventDefault() {} });
  assert.equal(state.grant.path, 'devices/esp32s-30p-01/commands/wifi');
  assert.equal(state.grant.value.ssid, 'New network');
  assert.equal(state.grant.value.password, 'new-password');
  assert.ok(state.grant.value.requestId);
  assert.equal(nodes.get('wifi-password').value, '', 'browser clears the entered password after sending');
  assert.equal([...storage.values()].some(value => value.includes('new-password')), false);
  const wifiRequestId = state.grant.value.requestId;
  state.reading({ val: () => ({ ...safe, wifiConfigVersion: 2, wifiSsid: 'New network',
    wifiSavedSsids: ['Old network', 'New network'],
    wifiChangeId: wifiRequestId, wifiChangeStatus: 'applied', updatedAt: Date.now() }) });
  assert.match(nodes.get('wifi-settings-status').textContent, /đã kết nối/i);
  assert.deepEqual(nodes.get('wifi-saved-list').children.map(item => item.textContent),
    ['Old network', 'New network']);
  assert.equal(nodes.get('wifi-saved-list').children[1].dataset.active, 'true');
  nodes.get('wifi-ssid').value = 'Another network';
  nodes.get('wifi-password').value = 'short';
  await nodes.get('wifi-settings-form').listeners.submit({ preventDefault() {} });
  assert.equal(nodes.get('wifi-settings-status').dataset.error, 'true',
    'invalid Wi-Fi credentials must have a visible error state');
  assert.equal(state.grant.value.requestId, wifiRequestId);
  state.reading({ val: () => ({ ...safe, updatedAt: Date.now() }) });
  assert.equal(nodes.get('wifi-settings-button').disabled, true,
    'the web must not send Wi-Fi requests to firmware without provisioning support');
  assert.equal(nodes.get('create-account-section').hidden, false,
    'only the owner sees account creation');
  nodes.get('account-email').value = 'new@example.com';
  nodes.get('account-password').value = 'temporary-123';
  nodes.get('account-confirm').value = 'temporary-123';
  await nodes.get('create-account-form').listeners.submit({ preventDefault() {} });
  assert.equal(state.created.auth, state.secondaryAuth,
    'creating an operator must use a separate Firebase auth session');
  assert.equal(state.mainAuth.currentUser.uid, 'NK23PFt0RAe14EKVUiFFNjDXMsv2',
    'the owner remains signed in');
  assert.deepEqual(state.grant, { path: 'operators/created-operator', value: true });
  assert.deepEqual(state.profile, { path: 'operatorProfiles/created-operator',
    value: { email: 'new@example.com', createdAt: { '.sv': 'timestamp' } } });
  assert.equal(state.signedOut, state.secondaryAuth);
  assert.match(nodes.get('create-account-status').textContent, /đã tạo/i);
  assert.equal(nodes.get('account-password').value, '');
  assert.equal([...storage.values()].some(value => value.includes('temporary-123')), false);

  state.profileError = new Error('permission_denied');
  nodes.get('account-email').value = 'without-profile@example.com';
  nodes.get('account-password').value = 'temporary-789';
  nodes.get('account-confirm').value = 'temporary-789';
  await nodes.get('create-account-form').listeners.submit({ preventDefault() {} });
  assert.equal(state.deletedUser, undefined,
    'an account with granted access survives an optional profile write failure');
  assert.match(nodes.get('create-account-status').textContent, /đã tạo.*email chưa lưu/i);
  delete state.profileError;

  state.grantError = new Error('permission_denied');
  nodes.get('account-email').value = 'another@example.com';
  nodes.get('account-password').value = 'temporary-456';
  nodes.get('account-confirm').value = 'temporary-456';
  await nodes.get('create-account-form').listeners.submit({ preventDefault() {} });
  assert.equal(state.deletedUser?.uid, 'created-operator',
    'a newly created account is rolled back when permission cannot be granted');
  assert.match(nodes.get('create-account-status').textContent, /không.*quyền/i);
  delete state.grantError;

  state.readings.get('operators')({ val: () => ({ 'old-uid': true, 'created-operator': true }) });
  state.readings.get('operatorProfiles')({ val: () => ({ 'created-operator': { email: 'new@example.com' } }) });
  const newAccountRow = nodes.get('operator-list').children.find(row => row.children.some(child =>
    child.textContent === 'new@example.com'));
  const revokeButton = newAccountRow.children.find(child => child.listeners.click);
  await revokeButton.listeners.click();
  assert.deepEqual(state.grant, { path: 'operators/created-operator', value: false });
  state.readings.get('operators')({ val: () => ({ 'old-uid': true, 'created-operator': false }) });
  const revokedRow = nodes.get('operator-list').children.find(row => row.children.some(child =>
    child.textContent === 'new@example.com'));
  const restoreButton = revokedRow.children.find(child => child.listeners.click);
  await restoreButton.listeners.click();
  assert.deepEqual(state.grant, { path: 'operators/created-operator', value: true });

  state.errors.get('operators')({ code: 'PERMISSION_DENIED' });
  assert.equal(nodes.get('operator-count').textContent, '—',
    'failed permission reads must not claim there are zero accounts');
  assert.match(nodes.get('operator-list-status').textContent, /danh sách quyền/i);

  state.authChanged({ uid: 'operator', email: 'operator@example.com' });
  assert.equal(nodes.get('operator-management-section').hidden, true);
  assert.equal(state.readings.has('operators'), false, 'operator list listener is detached when owner leaves');
  const ownerWrite = state.grant;
  await restoreButton.listeners.click();
  assert.deepEqual(state.grant, ownerWrite, 'a stale owner button cannot change rights after account switch');

  nodes.get('account-password').value = 'unsent-owner-password';
  nodes.get('account-confirm').value = 'unsent-owner-password';
  nodes.get('current-password').value = 'unsent-current-password';
  nodes.get('new-password').value = 'unsent-new-password';
  nodes.get('confirm-password').value = 'unsent-new-password';
  state.authChanged(null);
  for (const id of ['account-password', 'account-confirm', 'current-password',
    'new-password', 'confirm-password']) {
    assert.equal(nodes.get(id).value, '', `${id} must be cleared when signing out`);
  }
  assert.equal(nodes.get('tab-account').hidden, true);
});
