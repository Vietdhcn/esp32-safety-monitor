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
    assert.match(device.wifiReveal['.read'], /auth\.uid === 'NK23PFt0RAe14EKVUiFFNjDXMsv2'/);
    assert.match(device.wifiReveal['.write'], /auth\.uid === 'NfMfoVPKh3fAHQedBJ93DumnkMn1'/);
    assert.doesNotMatch(device.wifiReveal['.read'], /operators/);
    assert.match(device.commands.wifiReveal['.write'], /auth\.uid === 'NK23PFt0RAe14EKVUiFFNjDXMsv2'/);
  });
}
