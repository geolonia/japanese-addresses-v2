import assert from 'node:assert';
import test from 'node:test';

import * as ckan from './ckan.js';

test.describe('ckanPackageSearch', async () => {
  test('should return success', async () => {
    const res = await ckan.ckanPackageSearch('香川県高松市');
    assert.ok(res.length > 0);
  });
});

test.describe('downloadAndExtract', async () => {
  test('should download, unzip, and parse the CSV file', async () => {
    const res = ckan.downloadAndExtract('https://catalog.registries.digital.go.jp/rsc/address/mt_town_city372013.csv.zip');
    for await (const row of res) {
      // make sure all rows are parsed, and the header row is not in the results
      assert.strictEqual(row['lg_code'], '372013');
    }
  });
});
