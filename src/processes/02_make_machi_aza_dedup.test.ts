import assert from 'node:assert';
import test from 'node:test';

import fs from 'node:fs/promises';
import main from './02_make_machi_aza.js';
import { MachiAzaApi } from '../data.js';
import { setupFixtureCache } from '../test_helpers/fixture_cache.js';

await test.describe('with duplicate main/pos rows for 452092/0001000 (えびの市大字池島)', async () => {
  test.before(() => {
    setupFixtureCache('processes_02_make_machi_aza_dedup');
    process.env.SETTINGS_JSON = JSON.stringify({ lgCodes: ['452092'] });
  });

  test.after(() => {
    delete process.env.SETTINGS_JSON;
  });

  await test('it collapses the duplicate main/pos rows into a single true entry', async () => {
    await fs.rm('./out/api_miyazaki_ebino_dedup', { recursive: true, force: true });
    await main(['', '', './out/api_miyazaki_ebino_dedup']);

    const e = JSON.parse(await fs.readFile('./out/api_miyazaki_ebino_dedup/ja/宮崎県/えびの市.json', 'utf-8')) as MachiAzaApi;
    const eData = e.data;

    const matches = eData.filter((city) => city.machiaza_id === '0001000');
    assert.strictEqual(matches.length, 1, `expected exactly 1 entry for machiaza_id 0001000, got ${matches.length}`);
    assert.strictEqual(matches[0].rsdt, true);
    assert.strictEqual(matches[0].oaza_cho, '大字池島');
  });
});
