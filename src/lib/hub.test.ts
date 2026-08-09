import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert';
import { describe, test, beforeEach } from 'node:test';

import * as hub from './hub.js';
import { createTempCacheDir } from '../test_helpers/fixture_cache.js';
import { withMockAgent } from '../test_helpers/mock_agent.js';

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

// 指定した文字列がすべて含まれるリクエストパスにマッチする。
// limit などのクエリ引数が変わってもモックの指定を書き換えずに済むよう、完全一致は避ける。
function pathContaining(...fragments: string[]) {
  return (requestPath: string) => fragments.every((f) => requestPath.includes(encodeURIComponent(f)));
}

// pathContaining は fragment を encodeURIComponent してから照合するため、
// 'startindex=101' を渡すと 'startindex%3D101' になってマッチしない。
// 生のクエリ文字列を見たいページング用に別のヘルパーを用意する。
function pathWithStartIndex(startIndex: number | undefined, ...fragments: string[]) {
  return (requestPath: string) => (
    fragments.every((f) => requestPath.includes(encodeURIComponent(f)))
    && (startIndex === undefined
      ? !requestPath.includes('startindex=')
      : requestPath.includes(`startindex=${startIndex}`))
  );
}

// ページングのテスト用に最小限の feature を作る。
// 実フィクスチャは 1 件 40 プロパティ超あり、ページを手で書くと読めなくなるため。
function makeFeature(id: string, title: string) {
  return {
    id,
    type: 'Feature',
    geometry: null,
    properties: {
      id,
      title,
      description: '',
      url: `https://example.com/${id}.csv.zip`,
      created: 0,
      modified: 0,
    },
  };
}

// 1ページ分のレスポンスを作る。numberMatched は全体の一致件数、
// numberReturned はこのページの件数。
// nextStartIndex を渡すと、実APIが後続ページのあるレスポンスに付ける rel=next リンクを模した
// リンクを追加する (次のページが無い場合は省略する = 実APIの挙動)。
function makePage(numberMatched: number | undefined, features: ReturnType<typeof makeFeature>[], nextStartIndex?: number) {
  const links: Record<string, string>[] = [
    { rel: 'self', type: 'application/geo+json', title: 'This document as GeoJSON', href: 'https://dataset.address-br.digital.go.jp/api/search/v1/collections/all/items' },
  ];
  if (typeof nextStartIndex === 'number') {
    links.push({ rel: 'next', type: 'application/geo+json', title: 'items (next)', href: `https://dataset.address-br.digital.go.jp/api/search/v1/collections/all/items?startindex=${nextStartIndex}` });
  }
  const page: Record<string, unknown> = {
    type: 'FeatureCollection',
    timestamp: '2026-08-09T00:00:00.000Z',
    numberReturned: features.length,
    features,
    links,
  };
  if (typeof numberMatched === 'number') {
    page.numberMatched = numberMatched;
  }
  return page;
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
        // SEARCH_RESULT_LIMIT が API の上限以下なら numberMatched は必ず返る
        assert.strictEqual(typeof res.numberMatched, 'number');
        assert.ok(res.numberMatched! > 0);
        assert.strictEqual(res.features.length, res.numberReturned);
        // 切り捨てが起きると numberReturned < numberMatched になる
        assert.ok(res.numberMatched! >= res.numberReturned);
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

    await test('getHubItemsByQuery should follow startindex and merge all pages', async () => {
      await withMockAgent(async (mockAgent) => {
        // numberMatched 6 に対し 1ページ目は 4 件しか返らない。
        // 残り 2 件は startindex=5 の 2ページ目にあり、そこに目的のデータセットが入っている。
        // 1ページ目には実APIと同様に rel=next リンクを付け、2ページ目 (最終ページ) には付けない。
        mockAgent.get(HUB_ORIGIN)
          .intercept({ path: pathWithStartIndex(undefined, '香川県高松市', '市区町村レベル', '香川県'), method: 'GET' })
          .reply(200, makePage(6, [
            makeFeature('id-1', '香川県 高松市 町字マスター（フルセット）'),
            makeFeature('id-2', '香川県 高松市 町字マスター'),
            makeFeature('id-3', 'ダミー3'),
            makeFeature('id-4', 'ダミー4'),
          ], 5));
        mockAgent.get(HUB_ORIGIN)
          .intercept({ path: pathWithStartIndex(5, '香川県高松市', '市区町村レベル', '香川県'), method: 'GET' })
          .reply(200, makePage(6, [
            makeFeature('id-5', '香川県 高松市 地番マスター位置参照拡張'),
            makeFeature('id-6', '香川県 高松市 地番マスター'),
          ]));

        const res = await hub.getHubItemsByQuery('香川県高松市', '市区町村レベル', '香川県');

        assert.strictEqual(res.features.length, 6, '2ページ分が結合されること');
        assert.strictEqual(res.numberReturned, 6, 'numberReturned が実件数に更新されること');
        assert.strictEqual(res.numberMatched, 6);
        assert.strictEqual(hub.mayBeTruncated(res), false, '全件取得できたので切り捨て扱いにならないこと');
        assert.ok(
          hub.findResultByTypeAndArea(res.features, '地番マスター', '香川県 高松市'),
          '2ページ目にしか無いデータセットが見つかること'
        );
        assert.ok(
          !res.links?.some((link) => link.rel === 'next'),
          '結合済みの結果には「まだ続きがある」rel=next を残さないこと'
        );
        assert.ok(
          res.links?.some((link) => link.rel === 'self'),
          'rel=next 以外のリンク (self) は残ること'
        );
      });
    });

    await test('getHubItemsByQuery should not fetch a second page when complete', async () => {
      await withMockAgent(async (mockAgent) => {
        // intercept を 1 つだけ登録する (.times() を使わない)。
        // 2 回目のリクエストが飛べばマッチする intercept が無く、テストは失敗する。
        mockAgent.get(HUB_ORIGIN)
          .intercept({ path: pathWithStartIndex(undefined, '香川県高松市', '市区町村レベル', '香川県'), method: 'GET' })
          .reply(200, makePage(2, [
            makeFeature('id-1', 'ダミー1'),
            makeFeature('id-2', 'ダミー2'),
          ]));

        const res = await hub.getHubItemsByQuery('香川県高松市', '市区町村レベル', '香川県');
        assert.strictEqual(res.features.length, 2);
      });
    });

    await test('getHubItemsByQuery should not paginate without numberMatched', async () => {
      await withMockAgent(async (mockAgent) => {
        // numberMatched が無いと全体の件数が分からないので、ページを進めようがない。
        // intercept は 1 つだけ登録し、追加リクエストが飛ばないことを確かめる。
        mockAgent.get(HUB_ORIGIN)
          .intercept({ path: pathWithStartIndex(undefined, '香川県高松市', '市区町村レベル', '香川県'), method: 'GET' })
          .reply(200, makePage(undefined, [makeFeature('id-1', 'ダミー1')]));

        const warnings: string[] = [];
        const originalWarn = console.warn;
        console.warn = (...args: unknown[]) => { warnings.push(args.join(' ')); };
        try {
          const res = await hub.getHubItemsByQuery('香川県高松市', '市区町村レベル', '香川県');
          assert.strictEqual(res.features.length, 1);
        } finally {
          console.warn = originalWarn;
        }
        assert.strictEqual(warnings.length, 1);
        assert.match(warnings[0], /numberMatched を返しませんでした/);
      });
    });

    await test('getHubItemsByQuery should stop when a page returns no features', async () => {
      await withMockAgent(async (mockAgent) => {
        // numberMatched は 8 だが 2ページ目が 0 件。進捗しないので打ち切る
        // (ここで止めないと startindex が同じ値のまま無限にリクエストが飛ぶ)。
        mockAgent.get(HUB_ORIGIN)
          .intercept({ path: pathWithStartIndex(undefined, '香川県高松市', '市区町村レベル', '香川県'), method: 'GET' })
          .reply(200, makePage(8, [
            makeFeature('id-1', 'ダミー1'),
            makeFeature('id-2', 'ダミー2'),
          ]));
        mockAgent.get(HUB_ORIGIN)
          .intercept({ path: pathWithStartIndex(3, '香川県高松市', '市区町村レベル', '香川県'), method: 'GET' })
          .reply(200, makePage(8, []));

        const warnings: string[] = [];
        const originalWarn = console.warn;
        console.warn = (...args: unknown[]) => { warnings.push(args.join(' ')); };
        try {
          const res = await hub.getHubItemsByQuery('香川県高松市', '市区町村レベル', '香川県');
          assert.strictEqual(res.features.length, 2);
          assert.strictEqual(res.numberReturned, 2);
        } finally {
          console.warn = originalWarn;
        }
        assert.strictEqual(warnings.length, 1, '全件取れなかったので警告が1件出ること');
        // numberMatched (8) 自体は返っているので、「numberMatched が無い」ケースの警告ではなく
        // 「切り捨てられた」ケースの警告であることを本文で確認する。
        assert.match(warnings[0], /切り捨てられました/);
        assert.match(warnings[0], /numberMatched: 8/);
        assert.match(warnings[0], /numberReturned: 2/);
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
      // 実APIでも SEARCH_RESULT_LIMIT が上限以下である限り numberMatched は返る
      assert.strictEqual(typeof res.numberMatched, 'number');
      assert.ok(res.numberMatched! > 0);
      assert.strictEqual(res.features.length, res.numberReturned);
      assert.ok(res.numberMatched! >= res.numberReturned);
      assert.ok(hub.findResultByTypeAndArea(res.features, '地番マスター', '香川県 高松市'));

      const none = await hub.getHubItemsByQuery('香川県高松市', '全国レベル', '香川県');
      assert.ok(none.numberMatched === 0);
    });
  });

  await test.describe('mayBeTruncated', async () => {
    const asResultList = (partial: Partial<hub.HubSearchResultList>) =>
      partial as hub.HubSearchResultList;

    await test('should be false when all matched results are returned', () => {
      assert.strictEqual(hub.mayBeTruncated(asResultList({ numberMatched: 4, numberReturned: 4 })), false);
    });

    await test('should be true when the results are truncated', () => {
      assert.strictEqual(hub.mayBeTruncated(asResultList({ numberMatched: 153, numberReturned: 100 })), true);
    });

    await test('should be true when numberMatched is missing', () => {
      // limit が API の上限を超えると numberMatched が返らず判定できないため、
      // 「切り捨てられていない」と誤認しないよう安全側に倒す
      assert.strictEqual(hub.mayBeTruncated(asResultList({ numberReturned: 100 })), true);
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
