import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../docs/dashboard-model.js';

test('Wi-Fi input accepts a 2.4 GHz network name and WPA password within ESP32 byte limits', () => {
  assert.equal(model.loiCauHinhWifi?.('Nha cua toi', 'matkhau123'), null);
  assert.notEqual(model.loiCauHinhWifi?.('', 'matkhau123'), null);
  assert.notEqual(model.loiCauHinhWifi?.('á'.repeat(17), 'matkhau123'), null,
    'SSID length is measured in UTF-8 bytes, not JavaScript characters');
  assert.notEqual(model.loiCauHinhWifi?.('Nha cua toi', '1234567'), null);
  assert.notEqual(model.loiCauHinhWifi?.('Nha cua toi', 'x'.repeat(64)), null);
});

test('Wi-Fi result telemetry exposes network status but never a password', () => {
  const reading = model.chuanHoaDuLieu({ wifiConfigVersion: 1, wifiSsid: 'Nha cua toi',
    wifiChangeId: 'request-1', wifiChangeStatus: 'applied', wifiPassword: 'secret' });
  assert.deepEqual([reading.wifiConfigVersion, reading.wifiSsid,
    reading.wifiChangeId, reading.wifiChangeStatus], [1, 'Nha cua toi', 'request-1', 'applied']);
  assert.equal('wifiPassword' in reading, false);
  assert.equal(model.chuanHoaDuLieu({ wifiConfigVersion: 99, wifiChangeStatus: 'unknown' }).wifiConfigVersion, null);
});

test('Wi-Fi telemetry lists only distinct saved network names', () => {
  const reading = model.chuanHoaDuLieu({ wifiConfigVersion: 2, wifiSsid: 'Viet',
    wifiSavedSsids: ['Viet', 'Guest', 'Viet', '', 'x'.repeat(33), 12] });
  assert.equal(reading.wifiConfigVersion, 2);
  assert.deepEqual(reading.wifiSavedSsids, ['Viet', 'Guest']);
});

test('Wi-Fi provisioning reports staged credentials separately from a connected network', () => {
  const reading = model.chuanHoaDuLieu({ wifiConfigVersion: 3, wifiSsid: 'Viet',
    wifiSavedSsids: ['Viet', 'Viet2'], wifiChangeStatus: 'saved' });
  assert.equal(reading.wifiConfigVersion, 3);
  assert.equal(reading.wifiChangeStatus, 'saved');
  assert.equal(reading.wifiSsid, 'Viet');
  assert.deepEqual(reading.wifiSavedSsids, ['Viet', 'Viet2']);
  assert.equal('wifiPassword' in reading, false);
});

test('Wi-Fi password reveal protocol requires firmware version 4', () => {
  assert.equal(model.chuanHoaDuLieu({ wifiConfigVersion: 4 }).wifiConfigVersion, 4);
});
