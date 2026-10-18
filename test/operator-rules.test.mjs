import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

for (const file of ['firebase.rules.json', 'firebase.rules.template.json']) {
  test(`${file} limits the operator directory and profiles to the owner`, async () => {
    const rules = JSON.parse(await readFile(new URL(`../${file}`, import.meta.url), 'utf8')).rules;
    assert.match(rules.operators['.read'], /auth\.uid ===/);
    assert.match(rules.operatorProfiles['.read'], /auth\.uid ===/);
    assert.equal(rules.operators.$uid['.validate'], 'newData.isBoolean()');
    assert.match(rules.operatorProfiles.$uid['.validate'], /email/);
  });
  test(`${file} limits saved Wi-Fi password replies to owner and device`, async () => {
    const rules = JSON.parse(await readFile(new URL(`../${file}`, import.meta.url), 'utf8')).rules;
    const device = rules.devices['esp32s-30p-01'];
    const ownerUid = file.includes('template') ? 'OWNER_UID_HERE' : 'NK23PFt0RAe14EKVUiFFNjDXMsv2';
    const deviceUid = file.includes('template') ? 'DEVICE_UID_HERE' : 'NfMfoVPKh3fAHQedBJ93DumnkMn1';
    assert.ok(device.wifiReveal['.read'].includes(`auth.uid === '${ownerUid}'`));
    assert.ok(device.wifiReveal['.write'].includes(`auth.uid === '${deviceUid}'`));
    assert.doesNotMatch(device.wifiReveal['.read'], /operators/);
    assert.ok(device.commands.wifiReveal['.write'].includes(`auth.uid === '${ownerUid}'`));
  });
}
