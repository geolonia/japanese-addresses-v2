import assert from 'node:assert';
import test from 'node:test';

import fs from 'node:fs/promises';

import mainPrefCity from './01_make_prefecture_city.js';
import mainMachiAza from './02_make_machi_aza.js';
import mainRsdt from './03_make_rsdt.js';
import mainChiban from './04_make_chiban.js';

import main from './10_refresh_csv_ranges.js'
import { MachiAzaApi } from '../data.js';

test.describe('with filter for 302015 (和歌山県和歌山市)', async () => {
  test.before(async () => {
    process.env.SETTINGS_JSON = JSON.stringify({ lgCodes: ['302015'] });
  });

  test.after(async () => {
    delete process.env.SETTINGS_JSON;
  });

  test('it generates the API', async () => {
    await fs.rm('./out/api_wakayama_wakayama', { recursive: true, force: true });
    await mainPrefCity(['', '', './out/api_wakayama_wakayama']);
    await mainMachiAza(['', '', './out/api_wakayama_wakayama']);
    await mainRsdt(['', '', './out/api_wakayama_wakayama']);
    await mainChiban(['', '', './out/api_wakayama_wakayama']);
    await main(['', '', './out/api_wakayama_wakayama']);
    assert.ok(true);

    const machiAzaApi = JSON.parse(await fs.readFile('./out/api_wakayama_wakayama/ja/和歌山県/和歌山市.json', 'utf-8')) as MachiAzaApi;
    const data = machiAzaApi.data;
    assert(data.length > 100);
    assert.equal(data[0].oaza_cho, '葵町');
    assert('地番' in (data[0].csv_ranges || {}));
    assert('住居表示' in (data[0].csv_ranges || {}));
  });
});
