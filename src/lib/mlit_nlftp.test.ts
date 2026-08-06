import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert';
import test, { before } from 'node:test';
import { MockAgent, setGlobalDispatcher, Agent } from 'undici';

import {
  downloadAndExtractNlftpMlitFile,
} from './mlit_nlftp.js';
import { createTempCacheDir } from '../test_helpers/fixture_cache.js';

const FIXTURES_DIR = path.join(import.meta.dirname, '..', '..', 'test', 'fixtures', 'lib', 'mlit_nlftp');
const NLFTP_ORIGIN = 'https://nlftp.mlit.go.jp';

// 国土数値情報 (nlftp.mlit.go.jp) への実ダウンロードは、第三者サイトの障害で
// CIが落ちる原因になるうえ、リポジトリ直下の cache/ にzipが残る。
// MockAgentで応答を差し替え、ファイルキャッシュも一時 CACHE_DIR に隔離する。
//
// フィクスチャの取得元 (更新する場合はこのURLから再取得する):
//   https://nlftp.mlit.go.jp/isj/dls/data/17.0b/47000-17.0b.zip
await test.describe('downloadAndExtractNlftpMlitFile', async () => {
  before(() => {
    createTempCacheDir('lib_mlit_nlftp');
  });

  await test('it works', async () => {
    const fixtureZip = fs.readFileSync(path.join(FIXTURES_DIR, '47000-17.0b.zip'));

    const mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
    mockAgent.get(NLFTP_ORIGIN)
      .intercept({ path: '/isj/dls/data/17.0b/47000-17.0b.zip', method: 'GET' })
      .reply(200, fixtureZip, {
        headers: { 'content-type': 'application/zip' },
      });

    try {
      // 沖縄県
      const data = await downloadAndExtractNlftpMlitFile('47');
      assert.strictEqual(data.length, 1228);
      assert.strictEqual(data[0].machiaza_id, 'MLIT:472010001001');
      assert.strictEqual(data[0].pref_name, '沖縄県');
      assert.strictEqual(data[0].city_name, '那覇市');
      assert.strictEqual(data[0].oaza_cho, '古波蔵');
      assert.strictEqual(data[0].chome, '一丁目');
      assert.strictEqual(data[0].point.length, 2);
    } finally {
      await mockAgent.close();
      setGlobalDispatcher(new Agent());
    }
  });
});
