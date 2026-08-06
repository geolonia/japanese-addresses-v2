import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert';
import { describe, test, beforeEach } from 'node:test';
import { MockAgent, setGlobalDispatcher, Agent } from 'undici';

import * as hub from './hub.js';
import { createTempCacheDir } from '../test_helpers/fixture_cache.js';

const FIXTURES_DIR = path.join(import.meta.dirname, '..', '..', 'test', 'fixtures', 'lib', 'hub');
const HUB_ORIGIN = 'https://dataset.address-br.digital.go.jp';
const CDN_ORIGIN = 'https://data.address-br.digital.go.jp';

// 実APIに当てるテストは既定でスキップする。検索API(dataset.address-br.digital.go.jp)は
// 国外制限が無いため、RUN_NETWORK_TESTS=1 を指定すればABR側のスキーマ変更検知に使える。
const skipNetworkTests = process.env.RUN_NETWORK_TESTS
  ? false
  : 'RUN_NETWORK_TESTS=1 を指定すると実行されます';

function readJsonFixture(name: string): object {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf-8')) as object;
}

async function withMockAgent(fn: (mockAgent: MockAgent) => Promise<void>): Promise<void> {
  const mockAgent = new MockAgent();
  mockAgent.disableNetConnect();
  setGlobalDispatcher(mockAgent);
  try {
    await fn(mockAgent);
  } finally {
    await mockAgent.close();
    setGlobalDispatcher(new Agent());
  }
}

// 指定した文字列がすべて含まれるリクエストパスにマッチする。
// limit などのクエリ引数が変わってもモックの指定を書き換えずに済むよう、完全一致は避ける。
function pathContaining(...fragments: string[]) {
  return (requestPath: string) => fragments.every((f) => requestPath.includes(encodeURIComponent(f)));
}

await describe('hub', async () => {
  // テスト毎に空の一時 CACHE_DIR を割り当てる。リポジトリ直下の cache/ を消すと
  // ローカルの実データキャッシュや CI の actions/cache (path: cache) を壊すため。
  beforeEach(() => {
    createTempCacheDir('lib_hub');
  });

  await test.describe('getHubItemsByQuery', async () => {
    await test('getHubItemsByQuery should find existing data', async () => {
      await withMockAgent(async (mockAgent) => {
        mockAgent.get(HUB_ORIGIN)
          .intercept({ path: pathContaining('香川県高松市', '市区町村レベル', '香川県'), method: 'GET' })
          .reply(200, readJsonFixture('search_takamatsu_city_level.json'));

        const res = await hub.getHubItemsByQuery('香川県高松市', '市区町村レベル', '香川県', 'title');
        assert.ok(res.numberMatched > 0);
        assert.strictEqual(res.features.length, res.numberReturned);
        // 切り捨てが起きると numberReturned < numberMatched になる
        assert.ok(res.numberMatched >= res.numberReturned);
        assert.ok(
          hub.findResultByTypeAndArea(res.features, '地番マスター', '香川県 高松市'),
          '「香川県 高松市 地番マスター」が結果に含まれること'
        );
      });
    });

    await test('getHubItemsByQuery should not find non-existing data', async () => {
      await withMockAgent(async (mockAgent) => {
        mockAgent.get(HUB_ORIGIN)
          .intercept({ path: pathContaining('香川県高松市', '全国レベル', '香川県'), method: 'GET' })
          .reply(200, readJsonFixture('search_takamatsu_national_level.json'));

        const res = await hub.getHubItemsByQuery('香川県高松市', '全国レベル', '香川県');
        assert.ok(res.numberMatched === 0);
        assert.ok(res.features.length === 0);
      });
    });

    await test('getHubItemsByQuery should not reuse a cache saved with a different limit', async () => {
      await withMockAgent(async (mockAgent) => {
        // limit を含まない旧形式のキャッシュを配置しても読まれないことを確認する。
        // 旧キャッシュは小さい limit で切り捨てられている可能性があるため。
        const staleCacheFile = path.join(
          process.env.CACHE_DIR!,
          'hub',
          'hub_items_by_query_香川県高松市_市区町村レベル_香川県_undefined.json'
        );
        fs.mkdirSync(path.dirname(staleCacheFile), { recursive: true });
        fs.writeFileSync(staleCacheFile, JSON.stringify({
          type: 'FeatureCollection',
          numberMatched: 12,
          numberReturned: 12,
          features: [],
        }));

        mockAgent.get(HUB_ORIGIN)
          .intercept({ path: pathContaining('香川県高松市', '市区町村レベル', '香川県'), method: 'GET' })
          .reply(200, readJsonFixture('search_takamatsu_city_level.json'));

        const res = await hub.getHubItemsByQuery('香川県高松市', '市区町村レベル', '香川県');
        // 旧キャッシュ (numberMatched: 12 / features: 0) ではなく、実際に取得した結果が返る
        assert.strictEqual(res.numberMatched, 4);
        assert.ok(res.features.length > 0);
      });
    });

    await test('getHubItemsByQuery should warn when the result is truncated', async () => {
      await withMockAgent(async (mockAgent) => {
        // numberMatched > numberReturned = limit で切り捨てられた状態を再現する
        const truncated = {
          ...readJsonFixture('search_takamatsu_city_level.json'),
          numberMatched: 120,
          numberReturned: 50,
        };
        mockAgent.get(HUB_ORIGIN)
          .intercept({ path: pathContaining('香川県高松市', '市区町村レベル', '香川県'), method: 'GET' })
          .reply(200, truncated);

        const warnings: string[] = [];
        const originalWarn = console.warn;
        console.warn = (...args: unknown[]) => { warnings.push(args.join(' ')); };
        try {
          await hub.getHubItemsByQuery('香川県高松市', '市区町村レベル', '香川県');
        } finally {
          console.warn = originalWarn;
        }

        assert.strictEqual(warnings.length, 1, '切り捨て時に警告が1件出ること');
        assert.match(warnings[0], /切り捨てられました/);
        assert.match(warnings[0], /numberMatched: 120/);
      });
    });

    await test('getHubItemsByQuery should handle hub handled error', async () => {
      await withMockAgent(async (mockAgent) => {
        mockAgent.get(HUB_ORIGIN)
          .intercept({ path: pathContaining('香川県高松市', '市区町村レベル', '香川県'), method: 'GET' })
          .reply(
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
      });
    });

    await test('getHubItemsByQuery should handle hub unhandled error', async () => {
      await withMockAgent(async (mockAgent) => {
        mockAgent.get(HUB_ORIGIN)
          .intercept({ path: pathContaining('香川県高松市', '市区町村レベル', '香川県'), method: 'GET' })
          .reply(404, "Not Found");

        await assert.rejects(
          hub.getHubItemsByQuery('香川県高松市', '市区町村レベル', '香川県'),
          new Error('HUB API returned an error: 404 Not Found')
        );
      });
    });

    await test('getHubItemsByQuery should handle fetch error when network is disconnected', async () => {
      await withMockAgent(async () => {
        await assert.rejects(
          hub.getHubItemsByQuery('香川県高松市', '市区町村レベル', '香川県'),
          new TypeError('fetch failed')
        );
      });
    });

    await test('getHubItemsByQuery should match the live API [network]', { skip: skipNetworkTests }, async () => {
      const res = await hub.getHubItemsByQuery('香川県高松市', '市区町村レベル', '香川県', 'title');
      assert.ok(res.numberMatched > 0);
      assert.strictEqual(res.features.length, res.numberReturned);
      assert.ok(res.numberMatched >= res.numberReturned);
      assert.ok(hub.findResultByTypeAndArea(res.features, '地番マスター', '香川県 高松市'));

      const none = await hub.getHubItemsByQuery('香川県高松市', '全国レベル', '香川県');
      assert.ok(none.numberMatched === 0);
    });
  });

  await test.describe('getHubItemById', async () => {
    await test('getHubItemById should find existing data', async () => {
      await withMockAgent(async (mockAgent) => {
        mockAgent.get(HUB_ORIGIN)
          .intercept({ path: '/api/search/v1/collections/all/items/45bcb60e4dc747b58def5493ab829825', method: 'GET' })
          .reply(200, readJsonFixture('item_mt_pref_all.json'));

        const res = await hub.getHubItemById('45bcb60e4dc747b58def5493ab829825');
        assert.strictEqual(res.properties.title, '全国 都道府県マスター');
        assert.strictEqual(res.properties.id, '45bcb60e4dc747b58def5493ab829825');
      });
    });

    await test('getHubItemById should raise exception for non-existing data', async () => {
      await withMockAgent(async (mockAgent) => {
        mockAgent.get(HUB_ORIGIN)
          .intercept({ path: '/api/search/v1/collections/all/items/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', method: 'GET' })
          .reply(
            404, {
              message: "Cannot find item with recordId xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx in collection All",
              error: "Not Found",
              statusCode: 404
            }, {
              headers: { 'content-type': 'application/geo+json' }
            }
          );

        await assert.rejects(
          hub.getHubItemById('xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'),
          new Error('HUB API returned an error: {"message":"Cannot find item with recordId xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx in collection All","error":"Not Found","statusCode":404}')
        );
      });
    });

    await test('getHubItemById should match the live API [network]', { skip: skipNetworkTests }, async () => {
      const res = await hub.getHubItemById('45bcb60e4dc747b58def5493ab829825');
      assert.strictEqual(res.properties.title, '全国 都道府県マスター');
      assert.strictEqual(res.properties.id, '45bcb60e4dc747b58def5493ab829825');

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

      await withMockAgent(async (mockAgent) => {
        mockAgent.get(CDN_ORIGIN)
          .intercept({ path: '/mt_town/city/mt_town_city372013.csv.zip', method: 'GET' })
          .reply(200, fixtureZip, {
            headers: { 'content-type': 'application/octet-stream' },
          });

        const res = hub.downloadAndExtract<Record<string, string>>(`${CDN_ORIGIN}/mt_town/city/mt_town_city372013.csv.zip`);
        let count = 0;
        for await (const row of res) {
          count += 1;
          // make sure all rows are parsed, and the header row is not in the results
          assert.strictEqual(row['lg_code'], '372013');
          assert.strictEqual(row['pref'], '香川県');
          assert.strictEqual(row['city'], '高松市');
        }
        assert.ok(count > 0);
      });
    });

    await test('should raise exception for non-existing data download', async () => {
      await withMockAgent(async (mockAgent) => {
        mockAgent.get(CDN_ORIGIN)
          .intercept({ path: '/mt_town/city/mt_town_cityXXXXXX.csv.zip', method: 'GET' })
          .reply(404, 'Not Found');

        const res = hub.downloadAndExtract<Record<string, string>>(`${CDN_ORIGIN}/mt_town/city/mt_town_cityXXXXXX.csv.zip`);
        await assert.rejects(
          res.next(),
          new Error('HTTP 404: Not Found')
        );
      });
    });
  });
});
