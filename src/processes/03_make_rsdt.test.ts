import assert from 'node:assert';
import test from 'node:test';

import fs from 'node:fs/promises';
import main from './03_make_rsdt.js';
import { getRangesFromCSV } from './10_refresh_csv_ranges.js';

await test.describe('with filter for 131059 (東京都文京区)', async () => {
  test.before(() => {
    process.env.SETTINGS_JSON = JSON.stringify({ lgCodes: ['131059'] });
  });

  test.after(() => {
    delete process.env.SETTINGS_JSON;
  });

  await test('it generates the API', async () => {
    await fs.rm('./out/api_tokyo_bunkyo', { recursive: true, force: true });
    await main(['', '', './out/api_tokyo_bunkyo']);
    assert.ok(true);

    const headers = await getRangesFromCSV('./out/api_tokyo_bunkyo/ja/東京都/文京区-住居表示.txt');
    assert(typeof headers !== 'undefined');
    assert.equal(headers[0].name, '白山一丁目');
  });
});
