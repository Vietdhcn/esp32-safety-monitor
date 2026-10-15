import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('authenticated controls send atomic commands and await device acknowledgement', async t => {
  const originals = new Map(['document', 'window', 'setInterval', '__firebaseLoginTest']
    .map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const nodes = new Map();
  globalThis.document = { getElementById(id) {
    if (!nodes.has(id)) nodes.set(id, { hidden: false, style: {}, listeners: {}, value: '', attributes: {},
      classList: { toggle() {} }, closest() { return this; }, setAttribute(key, value) { this.attributes[key] = value; },
      addEventListener(event, callback) { this.listeners[event] = callback; } });
    return nodes.get(id);
  } };
  globalThis.window = { location: { href: 'https://example.com/' } };
  globalThis.setInterval = () => 0;
  const state = globalThis.__firebaseLoginTest = {};
  const moduleUrl = code => `data:text/javascript,${encodeURIComponent(code)}`;
  const sdk = {
    'firebase-app': 'export const initializeApp = () => ({});',
    'firebase-auth': `export const getAuth = () => ({});
      export const onAuthStateChanged = (_, callback) => { globalThis.__firebaseLoginTest.authChanged = callback; };
      export const signInWithEmailAndPassword = async () => {};
      export const signOut = async () => {};`,
    'firebase-database': `export const getDatabase = () => ({});
      export const ref = (_, path) => ({ path });
      export const onValue = (reference, callback) => { const s = globalThis.__firebaseLoginTest;
        s.path = reference.path; s.reading = callback; return () => {}; };
      export const serverTimestamp = () => ({ '.sv': 'timestamp' });
      export const update = async (reference, values) => { globalThis.__firebaseLoginTest.write = { path: reference.path, values }; };
      export const set = async () => {};`
  };
  let source = await readFile(new URL('../docs/app.js', import.meta.url), 'utf8');
  for (const name of ['config', 'dashboard-model']) {
    source = source.replace(new RegExp(`'\\./${name}\\.js(?:\\?[^']*)?'`),
      JSON.stringify(new URL(`../docs/${name}.js`, import.meta.url).href));
  }
  for (const [name, code] of Object.entries(sdk)) {
    source = source.replace(`'https://www.gstatic.com/firebasejs/13.0.0/${name}.js'`, JSON.stringify(moduleUrl(code)));
  }
  await import(moduleUrl(source));
  assert.doesNotThrow(() => state.authChanged({ uid: 'operator' }));
  assert.equal(state.path, 'devices/esp32s-30p-01/telemetry');
  assert.equal(nodes.get('dashboard').hidden, false);
  const safe = { flameDetected: false, gasAlarm: false, fanOn: false, controlsVersion: 2,
    fanSpeedSupported: true, fanSpeedPct: 0,
    alarmLedOn: false, statusLedOn: false, buzzerOn: true, alarmLedMode: 'auto',
    statusLedMode: 'auto', buzzerMode: 'auto', muteUntil: 0, updatedAt: Date.now() };
  state.reading({ val: () => safe });
  const button = nodes.get('buzzerMode-off');
  assert.equal(button?.disabled, false);
  await button.listeners.click();
  assert.equal(state.write.path, 'devices/esp32s-30p-01/commands');
  assert.equal(state.write.values.buzzerMode, 'off');
  assert.ok(state.write.values.commandId);
  assert.match(nodes.get('command-status').textContent, /chờ ESP32/);
  assert.equal(nodes.get('fan-button').disabled, false, 'unrelated controls remain available while awaiting acknowledgement');
  state.reading({ val: () => ({ ...safe, buzzerMode: 'off', buzzerOn: false,
    appliedCommandId: state.write.values.commandId, updatedAt: Date.now() }) });
  assert.match(nodes.get('command-status').textContent, /ESP32 đã áp dụng/);
  await nodes.get('statusLedMode-on').listeners.click();
  assert.equal(nodes.get('statusLedMode-state').textContent, 'Đang bật (chờ xác nhận)',
    'LED should show the requested state immediately while ESP32 telemetry catches up');
  assert.equal(nodes.get('statusLedMode-on').attributes['aria-pressed'], 'true');
  state.reading({ val: () => ({ ...safe, statusLedMode: 'on', statusLedOn: true,
    appliedCommandId: state.write.values.commandId, updatedAt: Date.now() }) });
  assert.equal(nodes.get('statusLedMode-state').textContent, 'Đang bật');
  await nodes.get('statusLedMode-off').listeners.click();
  assert.equal(nodes.get('statusLedMode-state').textContent, 'Đang tắt (chờ xác nhận)');
  assert.equal(nodes.get('statusLedMode-off').attributes['aria-pressed'], 'true');
  state.reading({ val: () => ({ ...safe, statusLedMode: 'off', statusLedOn: false,
    appliedCommandId: state.write.values.commandId, updatedAt: Date.now() }) });
  assert.equal(nodes.get('statusLedMode-state').textContent, 'Đang tắt');
  await nodes.get('fan-button').listeners.click();
  assert.equal(state.write.values.fanOn, true);
  assert.equal(state.write.values.fanSpeedPct, 100);
  const firstFanCommandId = state.write.values.commandId;
  assert.equal(nodes.get('fan-button').disabled, false, 'Firebase write must not lock controls until ESP32 acknowledgement');
  assert.equal(nodes.get('fan-button').textContent, 'Tắt quạt');
  assert.equal(nodes.get('fan-mode').textContent, 'Đang bật (chờ xác nhận)');
  await nodes.get('fan-button').listeners.click();
  assert.equal(state.write.values.fanOn, false);
  assert.equal(nodes.get('fan-mode').textContent, 'Đang tắt (chờ xác nhận)');
  assert.notEqual(state.write.values.commandId, firstFanCommandId);
  state.reading({ val: () => ({ ...safe, fanOn: true, fanSpeedPct: 100,
    appliedCommandId: firstFanCommandId, updatedAt: Date.now() }) });
  assert.match(nodes.get('command-status').textContent, /chờ ESP32/);
  assert.equal(nodes.get('fan-button').textContent, 'Bật quạt');
  state.reading({ val: () => ({ ...safe, fanOn: false,
    appliedCommandId: state.write.values.commandId, updatedAt: Date.now() }) });
  assert.match(nodes.get('command-status').textContent, /ESP32 đã áp dụng/);
  assert.equal(nodes.get('speed-button').disabled, true, 'unchanged PWM has nothing to apply');
  nodes.get('fan-speed').value = '40';
  nodes.get('fan-speed').listeners.input();
  assert.equal(nodes.get('speed-button').disabled, false, 'PWM can be saved while fan is off');
  await nodes.get('speed-button').listeners.click();
  assert.equal(state.write.values.fanSpeedPct, 40);
  assert.equal('fanOn' in state.write.values, false, 'saving PWM must not start the fan');
  assert.equal(nodes.get('fan-button').textContent, 'Bật quạt');
  await nodes.get('fan-button').listeners.click();
  assert.equal(state.write.values.fanOn, true);
  assert.equal(state.write.values.fanSpeedPct, 40, 'immediate fan start carries the newly saved PWM before telemetry catches up');
  assert.equal(nodes.get('fan-speed-value').textContent, '40% (đang cập nhật)');
  state.reading({ val: () => ({ ...safe, fanOn: true, fanSpeedPct: 40,
    appliedCommandId: state.write.values.commandId, updatedAt: Date.now() }) });
  nodes.get('fan-speed').value = '65';
  nodes.get('fan-speed').listeners.input();
  await nodes.get('speed-button').listeners.click();
  assert.equal(state.write.values.fanSpeedPct, 65);
  assert.equal('fanOn' in state.write.values, false, 'changing PWM while running preserves fan state');
  state.reading({ val: () => ({ ...safe, fanOn: true, fanSpeedPct: 65,
    appliedCommandId: state.write.values.commandId, updatedAt: Date.now() }) });
  state.reading({ val: () => ({ ...safe, gasAlarm: true }) });
  assert.match(nodes.get('connection-dot').className, /\balert\b/, 'gas warning turns the connection indicator red');
  assert.equal(nodes.get('safe-badge').textContent, 'Cảnh báo gas');
  assert.equal(nodes.get('flame-value').textContent, 'An toàn', 'gas alone must not appear as flame');
  assert.equal(nodes.get('speed-button').disabled, true);
  await nodes.get('mute-button').listeners.click();
  assert.deepEqual(state.write.values.muteRequestedAt, { '.sv': 'timestamp' });
});
