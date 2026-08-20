import assert from 'node:assert';
import test from 'node:test';

import fs from 'node:fs/promises';
import main, { resolveConcurrency, runWithConcurrency } from './04_make_chiban.js';
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

  // 桁数が多すぎる入力は Number が Infinity を返す。`Infinity > 0` は真なので
  // 弾かないと `executing.size >= CONCURRENCY` が常に false になり上限が消える。
  await test('it rejects values too large to be a safe integer', () => {
    assert.equal(resolveConcurrency('9'.repeat(400)), 4);
    // 2^53 (Number.MAX_SAFE_INTEGER + 1)
    assert.equal(resolveConcurrency('9007199254740992'), 4);
    // 2^53 - 1 は安全な整数なので、そのまま通る境界値
    assert.equal(resolveConcurrency('9007199254740991'), 9007199254740991);
  });
});

// 1市区町村の失敗でプロセスが落ちる方針は維持するが、落ちる前に実行中の
// 市区町村を書き切らせる必要がある。待たずに抜けると呼び出し元の process.exit(1) が
// 書き込み中の -地番.txt を切り捨て、ヘッダーだけが揃った壊れたファイルが残る。
await test.describe('runWithConcurrency', async () => {
  await test('it never exceeds the concurrency limit', async () => {
    let inFlight = 0;
    let peak = 0;
    await runWithConcurrency(
      Array.from({ length: 12 }, (_, i) => i),
      4,
      async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
      },
    );
    assert.equal(peak, 4);
  });

  await test('it calls onSettled once per item', async () => {
    let settled = 0;
    await runWithConcurrency(
      Array.from({ length: 12 }, (_, i) => i),
      4,
      async () => {},
      () => { settled += 1; },
    );
    assert.equal(settled, 12);
  });

  await test('it lets in-flight workers finish before rethrowing', async () => {
    const started: number[] = [];
    const finished: number[] = [];
    await assert.rejects(
      runWithConcurrency(
        Array.from({ length: 12 }, (_, i) => i),
        4,
        async (i) => {
          started.push(i);
          if (i === 5) {
            throw new Error('city 5 failed');
          }
          await new Promise((resolve) => setTimeout(resolve, 20));
          finished.push(i);
        },
      ),
      /city 5 failed/,
    );
    // 起動した worker のうち、失敗した 5 以外はすべて完了していること。
    // 実行中を待たない実装では、5 と同時に走っていたものが未完了のまま残る。
    assert.deepStrictEqual(
      finished.slice().sort((a, b) => a - b),
      started.filter((i) => i !== 5),
    );
    // 失敗以降の市区町村は起動しない (中断する方針は変えていない)
    assert.ok(started.length < 12, `started=${started.length}`);
  });

  // onSettled は .finally で呼ぶため、失敗した worker の分も1回呼ばれる。
  // 進捗バーの母数が実際の起動数と合っている必要がある。
  await test('it counts the failed worker in onSettled', async () => {
    const started: number[] = [];
    let settled = 0;
    await assert.rejects(
      runWithConcurrency(
        Array.from({ length: 12 }, (_, i) => i),
        4,
        async (i) => {
          started.push(i);
          if (i === 5) {
            throw new Error('city 5 failed');
          }
          await new Promise((resolve) => setTimeout(resolve, 20));
        },
        () => { settled += 1; },
      ),
      /city 5 failed/,
    );
    assert.equal(settled, started.length);
  });

  // 実行中の worker が追加で失敗しても、投げ直すのは最初の例外にする。
  // allSettled が後続の reject を吸うため unhandled rejection にもならない。
  await test('it rethrows the first failure when another worker also fails', async () => {
    await assert.rejects(
      runWithConcurrency([0, 1, 2, 3], 4, async (i) => {
        if (i === 0) {
          throw new Error('first failure');
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
        if (i === 1) {
          throw new Error('second failure');
        }
      }),
      /first failure/,
    );
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
