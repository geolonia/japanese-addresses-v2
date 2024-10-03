import assert from 'node:assert';
import test from 'node:test';

import {
  downloadAndExtractNlftpMlitFile,
} from './mlit_nlftp.js';

test.describe('downloadAndExtractNlftpMlitFile', () => {
  test('it works', async () => {
    // 沖縄県
    const data = await downloadAndExtractNlftpMlitFile('47', '22.0a');
    assert.strictEqual(data.length, 986);
    assert.strictEqual(data[0].prefName, '沖縄県');
    assert.strictEqual(data[0].cityName, 'うるま市');
    assert.strictEqual(data[0].oazaCho, 'みどり町一丁目');
  });
});
