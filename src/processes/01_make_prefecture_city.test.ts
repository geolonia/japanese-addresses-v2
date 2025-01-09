import assert from 'node:assert';
import test from 'node:test';

import fs from 'node:fs/promises';
import main from './01_make_prefecture_city.js';
import { PrefectureApi } from '../data.js';

await test.describe('with Hokkaido filter', async () => {
  test.before(() => {
    process.env.SETTINGS_JSON = JSON.stringify({ lgCodes: ['^01'] });
  });

  test.after(() => {
    delete process.env.SETTINGS_JSON;
  });

  await test('it generates the API', async () => {
    await fs.rm('./out/api_hokkaido', { recursive: true, force: true });
    await main(['', '', './out/api_hokkaido']);
    assert.ok(true);

    const ja = JSON.parse(await fs.readFile('./out/api_hokkaido/ja.json', 'utf-8')) as PrefectureApi;
    const jaData = ja.data;
    assert.equal(jaData.length, 1);
    const hokkaido = jaData[0];
    assert.equal(hokkaido.pref, '北海道');
    const cities = hokkaido.cities;
    assert.equal(cities.length, 194);
    assert.equal(cities[0].city, '札幌市');
  });
});

