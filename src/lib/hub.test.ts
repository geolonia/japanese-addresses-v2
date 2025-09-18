import assert from 'node:assert';
import test from 'node:test';
// TODO: エラー用のモック作成
// import { MockAgent, setGlobalDispatcher } from 'undici';

import * as hub from './hub.js';

await test.describe('hub', async () => {

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

  // TODO: エラー用のモック作成
  /*
  await test('getHubItemsByQuery should handle fetch error', async () => {
    // Set up undici MockAgent
    const mockAgent = new MockAgent();
    setGlobalDispatcher(mockAgent);

    const mockPool = mockAgent.get('https://dataset.address-br.digital.go.jp');
    mockPool.intercept({ path: '/api/search/v1/collections/all/items', method: 'GET' })
      .reply(404, {
          message: "Cannot GET /api/search/v1/collections/all/items",
          error: "Not Found",
          statusCode: 404
        }
      );

    await assert.rejects(
      hub.getHubItemsByQuery('香川県高松市', '市区町村レベル', '香川県'),
      /HUB API returned an error: 404 Not Found/
    );

    // Restore undici dispatcher
    await mockAgent.close();
  });
  */

  await test('getHubItemById should find existing data', async () => {
    const res = await hub.getHubItemById('45bcb60e4dc747b58def5493ab829825');
    assert.strictEqual(res.properties.title, '全国 都道府県マスター');
    assert.strictEqual(res.properties.id, '45bcb60e4dc747b58def5493ab829825');
  });

  await test('getHubItemById should raise exception for non-existing data', async () => {
    await assert.rejects(
      hub.getHubItemById('xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'),
      /HUB API returned an error: {"message":"Cannot find item with recordId xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx in collection All","error":"Not Found","statusCode":404}/
    );
  });

  await test.describe('downloadAndExtract', async () => {
    await test('should download, unzip, and parse the CSV file', async () => {
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
    });

    await test('should raise exception for non-existing data download', async () => {
      const res = hub.downloadAndExtract<Record<string, string>>('https://data.address-br.digital.go.jp/mt_town/city/mt_town_cityXXXXXX.csv.zip');
      await assert.rejects(
        res.next(),
        /HTTP 404: Not Found/
      );
    });
  });
});
