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
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  globalThis.setInterval = () => 0;
  const state = globalThis.__firebaseLoginTest = {};
  const moduleUrl = code => `data:text/javascript,${encodeURIComponent(code)}`;
  const sdk = {
    'firebase-app': 'export const initializeApp = () => ({});',
    'firebase-auth': `export const getAuth = () => ({});
      export const browserLocalPersistence = 'local';
      export const browserSessionPersistence = 'session';
      export const setPersistence = async (_, value) => { globalThis.__firebaseLoginTest.authCalls.push(['persistence', value]); };
      export const onAuthStateChanged = (_, callback) => { globalThis.__firebaseLoginTest.authChanged = callback; };
      export const signInWithEmailAndPassword = async (_, email, password) => {
        globalThis.__firebaseLoginTest.authCalls.push(['signIn', email, password]);
      };
      export const signOut = async () => {};`,
    'firebase-database': `export const getDatabase = () => ({});
      export const ref = (_, path) => ({ path });
      export const onValue = (reference, callback) => { const s = globalThis.__firebaseLoginTest;
        s.path = reference.path; s.reading = callback; return () => {}; };
      export const serverTimestamp = () => ({ '.sv': 'timestamp' });
      export const update = async (reference, values) => { const state = globalThis.__firebaseLoginTest;
        state.write = { path: reference.path, values }; if (state.blockWrite) await state.blockWrite; };
      export const set = async () => {};`
  };
  let source = await readFile(new URL('../docs/app.js', import.meta.url), 'utf8');
  for (const name of ['config', 'dashboard-model', 'history-model']) {
    source = source.replace(new RegExp(`'\\./${name}\\.js(?:\\?[^']*)?'`),
      JSON.stringify(new URL(`../docs/${name}.js`, import.meta.url).href));
  }
  for (const [name, code] of Object.entries(sdk)) {
    source = source.replace(`'https://www.gstatic.com/firebasejs/13.0.0/${name}.js'`, JSON.stringify(moduleUrl(code)));
  }
  await import(moduleUrl(source));
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
  const historyKey = 'safety-history:esp32s-30p-01:operator';
  storage.set(historyKey, JSON.stringify({ version: 2, items: [
    { at: Date.now(), source: 'system', kind: 'device', title: 'Còi: Bật', detail: 'Chế độ cũ.' },
    { at: Date.now(), source: 'system', kind: 'danger', title: 'Phát hiện khí gas', detail: 'Cảm biến.' },
    { at: Date.now(), source: 'system', kind: 'device', title: 'Quạt đã bật', detail: 'Thiết bị.' },
    { at: Date.now(), source: 'user', kind: 'user', title: 'Bật quạt', detail: 'Đã nhấn.' }
  ] }));
  assert.doesNotThrow(() => state.authChanged({ uid: 'operator' }));
  assert.equal(JSON.parse(storage.get(historyKey)).version, 3);
  assert.deepEqual(JSON.parse(storage.get(historyKey)).items.map(item => item.title),
    ['Phát hiện khí gas', 'Bật quạt'], 'stored device output logs are removed on load');
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
});
