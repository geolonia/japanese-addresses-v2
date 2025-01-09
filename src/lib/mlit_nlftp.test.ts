import assert from 'node:assert';
import test from 'node:test';

import {
  downloadAndExtractNlftpMlitFile,
} from './mlit_nlftp.js';

await test.describe('downloadAndExtractNlftpMlitFile', async () => {
  await test('it works', async () => {
    // 沖縄県
    const data = await downloadAndExtractNlftpMlitFile('47');
    assert.strictEqual(data.length, 1228);
    assert.strictEqual(data[0].machiaza_id, 'MLIT:472010001001');
    assert.strictEqual(data[0].pref_name, '沖縄県');
    assert.strictEqual(data[0].city_name, '那覇市');
    assert.strictEqual(data[0].oaza_cho, '古波蔵');
    assert.strictEqual(data[0].chome, '一丁目');
    assert.strictEqual(data[0].point.length, 2);
  });
});
