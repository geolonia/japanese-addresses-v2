import assert from 'node:assert';
import test from 'node:test';

import fs from 'node:fs/promises';
import main from './02_make_machi_aza.js';
import { MachiAzaApi } from '../data.js';

test.describe('with filter for 452092 (宮崎県えびの市)', async () => {
  test.before(async () => {
    process.env.SETTINGS_JSON = JSON.stringify({ lgCodes: ['452092'] });
  });

  test.after(async () => {
    delete process.env.SETTINGS_JSON;
  });

  test('it generates the API', async () => {
    await fs.rm('./out/api_miyazaki_ebino', { recursive: true, force: true });
    await main(['', '', './out/api_miyazaki_ebino']);
    assert.ok(true);

    const e = JSON.parse(await fs.readFile('./out/api_miyazaki_ebino/ja/宮崎県/えびの市.json', 'utf-8')) as MachiAzaApi;
    const eData = e.data;
    assert(eData.length > 100);
    assert(eData.find((city) => city.machiaza_id === '0000110')?.koaza === '下村');
  });
});

