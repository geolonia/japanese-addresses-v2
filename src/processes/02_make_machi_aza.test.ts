import assert from 'node:assert';
import test from 'node:test';

import fs from 'node:fs/promises';
import main from './02_make_machi_aza.js';
import { MachiAzaApi } from '../data.js';
import { setupFixtureCache } from '../test_helpers/fixture_cache.js';

await test.describe('with filter for 452092 (宮崎県えびの市)', async () => {
  test.before(() => {
    setupFixtureCache('processes_02_make_machi_aza');
    process.env.SETTINGS_JSON = JSON.stringify({ lgCodes: ['452092'] });
  });

  test.after(() => {
    delete process.env.SETTINGS_JSON;
  });

  await test('it generates the API', async () => {
    try {
      await fs.rm('./out/api_miyazaki_ebino', { recursive: true, force: true });
      await main(['', '', './out/api_miyazaki_ebino']);
      assert.ok(true);

      const e = JSON.parse(await fs.readFile('./out/api_miyazaki_ebino/ja/宮崎県/えびの市.json', 'utf-8')) as MachiAzaApi;
      const eData = e.data;
      // ABRの町字マスターが大字レベルに統一され、小字レコードは配信対象から除外された
      // (2026-05時点でえびの市は176件→30件)。
      assert(eData.length >= 30);
      assert.equal(eData.find((city) => city.machiaza_id === '0001000')?.oaza_cho, '大字池島');
    } catch (err) {
      console.error(err);
      throw err;
    }
  });
});
