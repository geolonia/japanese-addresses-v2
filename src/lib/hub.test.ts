import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert';
import { describe, test, beforeEach } from 'node:test';
import { MockAgent, setGlobalDispatcher, Agent } from 'undici';

import * as hub from './hub.js';
import { createTempCacheDir } from '../test_helpers/fixture_cache.js';

const FIXTURES_DIR = path.join(import.meta.dirname, '..', '..', 'test', 'fixtures', 'lib', 'hub');

await describe('hub', async () => {
  // テスト毎に空の一時 CACHE_DIR を割り当てる。リポジトリ直下の cache/ を消すと
  // ローカルの実データキャッシュや CI の actions/cache (path: cache) を壊すため。
  beforeEach(() => {
    createTempCacheDir('lib_hub');
  });

  await test.describe('getHubItemsByQuery', async () => {
    await test('getHubItemsByQuery should find existing data', async () => {
      const res = await hub.getHubItemsByQuery('香川県高松市', '市区町村レベル', '香川県', 'title');
      assert.ok(res.numberMatched > 0);
      assert.ok(res.features.length >= res.numberMatched);
    });

    await test('getHubItemsByQuery should not find non-existing data', async () => {
      const res = await hub.getHubItemsByQuery('香川県高松市', '全国レベル', '香川県');
      assert.ok(res.numberMatched === 0);
      assert.ok(res.features.length === 0);
    });

    await test('getHubItemsByQuery should handle hub handled error', async () => {
      const mockAgent = new MockAgent();
      setGlobalDispatcher(mockAgent);

      const mockPool = mockAgent.get('https://dataset.address-br.digital.go.jp');
      mockPool.intercept({
          path: '/api/search/v1/collections/all/items?filter=((group IN (864dfb9be4ef483d864e886fa25e1c94)))%20AND%20((categories%20IN%20(%2Fcategories%2F%E5%B8%82%E5%8C%BA%E7%94%BA%E6%9D%91%E3%83%AC%E3%83%99%E3%83%AB%2F%E9%A6%99%E5%B7%9D%E7%9C%8C)))&limit=12&q=%E9%A6%99%E5%B7%9D%E7%9C%8C%E9%AB%98%E6%9D%BE%E5%B8%82',
          method: 'GET',
        }).reply(
          404, {
            message: "Cannot GET /api/search/v1/collections/all/items",
            error: "Not Found",
            statusCode: 404
          }, {
            headers: { 'content-type': 'application/geo+json' }
          }
        );

      await assert.rejects(
        hub.getHubItemsByQuery('香川県高松市', '市区町村レベル', '香川県'),
        new Error('HUB API returned an error: {"message":"Cannot GET /api/search/v1/collections/all/items","error":"Not Found","statusCode":404}')
      );

      await mockAgent.close();
      setGlobalDispatcher(new Agent());
    });

    await test('getHubItemsByQuery should handle hub unhandled error', async () => {
      const mockAgent = new MockAgent();
      setGlobalDispatcher(mockAgent);

      const mockPool = mockAgent.get('https://dataset.address-br.digital.go.jp');
      mockPool.intercept({
          path: '/api/search/v1/collections/all/items?filter=((group IN (864dfb9be4ef483d864e886fa25e1c94)))%20AND%20((categories%20IN%20(%2Fcategories%2F%E5%B8%82%E5%8C%BA%E7%94%BA%E6%9D%91%E3%83%AC%E3%83%99%E3%83%AB%2F%E9%A6%99%E5%B7%9D%E7%9C%8C)))&limit=12&q=%E9%A6%99%E5%B7%9D%E7%9C%8C%E9%AB%98%E6%9D%BE%E5%B8%82',
          method: 'GET',
        }).reply(
          404,
          "Not Found"
        );

      await assert.rejects(
        hub.getHubItemsByQuery('香川県高松市', '市区町村レベル', '香川県'),
        new Error('HUB API returned an error: 404 Not Found')
      );

      await mockAgent.close();
      setGlobalDispatcher(new Agent());
    });

    await test('getHubItemsByQuery should handle fetch error when network is disconnected', async () => {
      const mockAgent = new MockAgent();
      setGlobalDispatcher(mockAgent);
      mockAgent.disableNetConnect();

      await assert.rejects(
        hub.getHubItemsByQuery('香川県高松市', '市区町村レベル', '香川県'),
        new TypeError('fetch failed')
      );

      await mockAgent.close();
      setGlobalDispatcher(new Agent());
    });
  });

  await test.describe('getHubItemById', async () => {
    await test('getHubItemById should find existing data', async () => {
      const res = await hub.getHubItemById('45bcb60e4dc747b58def5493ab829825');
      assert.strictEqual(res.properties.title, '全国 都道府県マスター');
      assert.strictEqual(res.properties.id, '45bcb60e4dc747b58def5493ab829825');
    });

    await test('getHubItemById should raise exception for non-existing data', async () => {
      await assert.rejects(
        hub.getHubItemById('xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'),
        new Error('HUB API returned an error: {"message":"Cannot find item with recordId xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx in collection All","error":"Not Found","statusCode":404}')
      );
    });
  });

  await test.describe('downloadAndExtract', async () => {
    // ABRデータの配信CDN (data.address-br.digital.go.jp) が日本国外からのアクセスを
    // 403で拒否するため、CI(US基盤のGitHub Actions runner)からは実ネットワークでテストできない。
    // MockAgentでレスポンスを差し替えてオフライン実行可能にする。
    // ファイルキャッシュは外側の beforeEach が割り当てる空の一時 CACHE_DIR を使う。

    await test('should download, unzip, and parse the CSV file', async () => {
      const fixtureZip = fs.readFileSync(path.join(FIXTURES_DIR, 'mt_town_city372013.csv.zip'));

      const mockAgent = new MockAgent();
      setGlobalDispatcher(mockAgent);
      const mockPool = mockAgent.get('https://data.address-br.digital.go.jp');
      mockPool.intercept({
        path: '/mt_town/city/mt_town_city372013.csv.zip',
        method: 'GET',
      }).reply(200, fixtureZip, {
        headers: { 'content-type': 'application/octet-stream' },
      });

      try {
        const res = hub.downloadAndExtract<Record<string, string>>('https://data.address-br.digital.go.jp/mt_town/city/mt_town_city372013.csv.zip');
        let count = 0;
        for await (const row of res) {
          count += 1;
          // make sure all rows are parsed, and the header row is not in the results
          assert.strictEqual(row['lg_code'], '372013');
          assert.strictEqual(row['pref'], '香川県');
          assert.strictEqual(row['city'], '高松市');
        }
        assert.ok(count > 0);
      } finally {
        await mockAgent.close();
        setGlobalDispatcher(new Agent());
      }
    });

    await test('should raise exception for non-existing data download', async () => {
      const mockAgent = new MockAgent();
      setGlobalDispatcher(mockAgent);
      const mockPool = mockAgent.get('https://data.address-br.digital.go.jp');
      mockPool.intercept({
        path: '/mt_town/city/mt_town_cityXXXXXX.csv.zip',
        method: 'GET',
      }).reply(404, 'Not Found');

      try {
        const res = hub.downloadAndExtract<Record<string, string>>('https://data.address-br.digital.go.jp/mt_town/city/mt_town_cityXXXXXX.csv.zip');
        await assert.rejects(
          res.next(),
          new Error('HTTP 404: Not Found')
        );
      } finally {
        await mockAgent.close();
        setGlobalDispatcher(new Agent());
      }
    });
  });
});
