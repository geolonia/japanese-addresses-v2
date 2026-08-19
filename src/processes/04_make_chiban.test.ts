import assert from 'node:assert';
import test from 'node:test';

import fs from 'node:fs/promises';
import main, { resolveConcurrency } from './04_make_chiban.js';
import { getRangesFromCSV } from './10_refresh_csv_ranges.js';
import { setupFixtureCache } from '../test_helpers/fixture_cache.js';

// CHIBAN_CONCURRENCY は同時実行数の上限になる。不正値がそのまま使われると
// 上限チェックが機能しなくなるため、既定値に落とすことを保証する。
await test.describe('resolveConcurrency', async () => {
  await test('it uses a valid positive integer as-is', () => {
    assert.equal(resolveConcurrency('1'), 1);
    assert.equal(resolveConcurrency('8'), 8);
  });

  await test('it tolerates surrounding whitespace', () => {
    assert.equal(resolveConcurrency(' 8 '), 8);
  });

  await test('it falls back to the default for unset, empty, or non-numeric values', () => {
    assert.equal(resolveConcurrency(undefined), 4);
    // 空文字列は ?? では拾われないため parseInt('') = NaN になる経路。
    assert.equal(resolveConcurrency(''), 4);
    assert.equal(resolveConcurrency('abc'), 4);
  });

  await test('it falls back to the default for zero and negative values', () => {
    assert.equal(resolveConcurrency('0'), 4);
    assert.equal(resolveConcurrency('-2'), 4);
  });

  // parseInt は末尾の不正文字を切り捨てるため、これらを弾かないと
  // '1000workers' で同時実行数 1000 が通ってしまう。
  await test('it rejects values that are only partially numeric', () => {
    assert.equal(resolveConcurrency('1000workers'), 4);
    assert.equal(resolveConcurrency('1.5'), 4);
    assert.equal(resolveConcurrency('0x10'), 4);
    assert.equal(resolveConcurrency('4 8'), 4);
  });
});

await test.describe('with filter for 465054 (鹿児島県熊毛郡屋久島町)', async () => {
  test.before(() => {
    setupFixtureCache('processes_04_make_chiban');
    process.env.SETTINGS_JSON = JSON.stringify({ lgCodes: ['465054'] });
  });

  test.after(() => {
    delete process.env.SETTINGS_JSON;
  });

  await test('it generates the API', async () => {
    await fs.rm('./out/api_kagoshima_yakushima', { recursive: true, force: true });
    await main(['', '', './out/api_kagoshima_yakushima']);

    const headers = await getRangesFromCSV('./out/api_kagoshima_yakushima/ja/鹿児島県/熊毛郡屋久島町-地番.txt');
    assert(typeof headers !== 'undefined');
    assert.equal(headers[0].name, '安房');
  });
});
