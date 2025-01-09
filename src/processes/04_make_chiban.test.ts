import assert from 'node:assert';
import test from 'node:test';

import fs from 'node:fs/promises';
import main from './04_make_chiban.js';
import { getRangesFromCSV } from './10_refresh_csv_ranges.js';

await test.describe('with filter for 465054 (鹿児島県熊毛郡屋久島町)', async () => {
  test.before(() => {
    process.env.SETTINGS_JSON = JSON.stringify({ lgCodes: ['465054'] });
  });

  test.after(() => {
    delete process.env.SETTINGS_JSON;
  });

  await test('it generates the API', async () => {
    await fs.rm('./out/api_kagoshima_yakushima', { recursive: true, force: true });
    await main(['', '', './out/api_kagoshima_yakushima']);
    assert.ok(true);

    const headers = await getRangesFromCSV('./out/api_kagoshima_yakushima/ja/鹿児島県/熊毛郡屋久島町-地番.txt');
    assert(typeof headers !== 'undefined');
    assert.equal(headers[0].name, '安房');
  });
});
