import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('an authenticated session subscribes to device telemetry', async t => {
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
    if (!nodes.has(id)) nodes.set(id, { hidden: false, addEventListener() {} });
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
      export const onValue = reference => { globalThis.__firebaseLoginTest.path = reference.path; return () => {}; };
      export const set = async () => {};`
  };
  let source = await readFile(new URL('../docs/app.js', import.meta.url), 'utf8');
  for (const name of ['config', 'dashboard-model']) {
    source = source.replace(`'./${name}.js'`, JSON.stringify(new URL(`../docs/${name}.js`, import.meta.url).href));
  }
  for (const [name, code] of Object.entries(sdk)) {
    source = source.replace(`'https://www.gstatic.com/firebasejs/13.0.0/${name}.js'`, JSON.stringify(moduleUrl(code)));
  }
  await import(moduleUrl(source));
  assert.doesNotThrow(() => state.authChanged({ uid: 'owner' }));
  assert.equal(state.path, 'devices/esp32s-30p-01/telemetry');
  assert.equal(nodes.get('dashboard').hidden, false);
});
