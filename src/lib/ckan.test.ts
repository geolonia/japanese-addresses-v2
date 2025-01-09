import assert from 'node:assert';
import test from 'node:test';

import * as ckan from './ckan.js';

await test.describe('ckan', async () => {
  await test('ckanPackageSearch works', async () => {
    const res = await ckan.ckanPackageSearch('香川県高松市');
    assert.ok(res.length > 0);
  });

  await test('getCkanPackageById works', async () => {
    const res = await ckan.getCkanPackageById('ba-o1-000000_g2-000001');
    assert.strictEqual(res.name, 'ba-o1-000000_g2-000001');
  });

  await test.describe('downloadAndExtract', async () => {
    await test('should download, unzip, and parse the CSV file', async () => {
      const res = ckan.downloadAndExtract<Record<string, string>>('https://catalog.registries.digital.go.jp/rsc/address/mt_town_city372013.csv.zip');
      let count = 0;
      for await (const row of res) {
        count += 1;
        // make sure all rows are parsed, and the header row is not in the results
        assert.strictEqual(row['lg_code'], '372013');
      }
      assert.ok(count > 0);
    });
  });
});
