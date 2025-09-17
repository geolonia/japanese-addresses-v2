import assert from 'node:assert';
import test from 'node:test';

import * as hub from './hub.js';

await test.describe('hub', async () => {
  await test('getHubItemsByQuery works', async () => {
    const res = await hub.getHubItemsByQuery('香川県高松市', '市区町村レベル', '香川県', 'title');
    assert.ok(res.numberMatched > 0);
    assert.ok(res.features.length >= res.numberMatched);
  });

  await test('getHubItemById works', async () => {
    const res = await hub.getHubItemById('45bcb60e4dc747b58def5493ab829825');
    assert.strictEqual(res.properties.title, '全国 都道府県マスター');
    assert.strictEqual(res.properties.id, '45bcb60e4dc747b58def5493ab829825');
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
  });
});
