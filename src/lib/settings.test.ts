import assert from 'node:assert';
import test, { describe, before, after } from 'node:test';

import path from 'node:path';
import fs from 'node:fs/promises';

import * as settings from './settings.js';

const fixtureDir = path.join(import.meta.dirname, '..', '..', 'test', 'fixtures', 'lib', 'settings');

before(async () => {
  await fs.copyFile(path.join(fixtureDir, 'settings.json'), path.join(process.cwd(), 'settings.json'));
});

after(async () => {
  await fs.rm(path.join(process.cwd(), 'settings.json'));
  delete process.env.SETTINGS_JSON;
  delete process.env.SETTINGS_PATH;
});

await test('loadSettings', async () => {
  const parsedSettings = await settings.loadSettings();
  assert.equal(parsedSettings.lgCodes.length, 1);
  assert.ok(parsedSettings.lgCodes[0].test('011002'));
  assert.ok(!parsedSettings.lgCodes[0].test('131002'));
});

await describe('lgCodeMatch', async () => {
  await test('basic settings', () => {
    const settingsData = settings.parseSettings({
      lgCodes: ['^01', '^13', '472018'],
    });
    assert.ok(settings.lgCodeMatch(settingsData, '011002'));
    assert.ok(settings.lgCodeMatch(settingsData, '131002'));
    assert.ok(!settings.lgCodeMatch(settingsData, '465054'));
    assert.ok(settings.lgCodeMatch(settingsData, '472018'));
  });

  await test('市区町村まで指定されているときは、都道府県全体に対してマッチする', () => {
    const settingsData = settings.parseSettings({
      lgCodes: ['131002', '472018'],
    });
    assert.ok(settings.lgCodeMatch(settingsData, '131002'));
    assert.ok(settings.lgCodeMatch(settingsData, '130001'));

    assert.ok(settings.lgCodeMatch(settingsData, '472018'));
    assert.ok(settings.lgCodeMatch(settingsData, '470007'));

    assert.ok(!settings.lgCodeMatch(settingsData, '011002'));
    assert.ok(!settings.lgCodeMatch(settingsData, '460001'));
  });
});

await test('loadSettings with overwritten JSON', async () => {
  process.env.SETTINGS_JSON = JSON.stringify({ lgCodes: ['^99'] });
  const parsedSettings = await settings.loadSettings();
  assert.equal(parsedSettings.lgCodes.length, 1);
  assert.ok(parsedSettings.lgCodes[0].test('990000'));
});
