import assert from 'node:assert';
import fsp from 'node:fs/promises';
import os from 'node:os';
import test, { describe } from 'node:test';

import * as index from './index.js';

// mergeDataLeftJoin は memory 引数で実装が切り替わる。
//   memory: false → 一時ファイル上の SQLite で LEFT JOIN
//   memory: true  → 右側を Map に読み込み、左側をストリーム照合する高速パス
// 通常の結合結果は両者で一致する必要があるため、同じケースを両経路で検証する。
const JOIN_PATHS = [
  { label: 'sqlite path (memory: false)', memory: false },
  { label: 'in-memory Map path (memory: true)', memory: true },
] as const;

await describe('abr_data/index', async () => {
  await describe('joinAsyncIterators', async () => {
    for (const { label, memory } of JOIN_PATHS) {
      await describe(label, async () => {
        await test('it correctly joins two async iterators when they are ordered', async () => {
          const one = async function*(){
            await new Promise((resolve) => setTimeout(resolve, 10));
            yield *[
              { id: 100, name: 'Alice' },
              { id: 101, name: 'Bob' }
            ];
          };
          const two = async function*(){
            await new Promise((resolve) => setTimeout(resolve, 10));
            yield *[
              { id: 100, age: 500 },
              { id: 101, age: 501 }
            ];
          };

          const res = await Array.fromAsync(
            index.mergeDataLeftJoin(one(), two(), ['id'], memory)
          );

          assert.deepStrictEqual(res, [
            { id: 100, name: 'Alice', age: 500 },
            { id: 101, name: 'Bob', age: 501 },
          ]);
        });

        await test('it correctly joins two async iterators when they are out of order', async () => {
          const one = async function *() {
            await new Promise((resolve) => setTimeout(resolve, 10));
            yield *[{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }, { id: 3, name: 'Charlie' }];
          };
          const two = async function *() {
            await new Promise((resolve) => setTimeout(resolve, 10));
            yield *[{ id: 2, age: 30 }, { id: 1, age: 25 }, { id: 4, age: 35 }];
          };

          const res = await Array.fromAsync(
            index.mergeDataLeftJoin(one(), two(), ['id'], memory)
          );

          assert.deepStrictEqual(res, [
            { id: 1, name: 'Alice', age: 25 },
            { id: 2, name: 'Bob', age: 30 },
            { id: 3, name: 'Charlie' },
          ]);
        });

        // 02_make_machi_aza などは lg_code が連続していることを前提に市区町村ごとの
        // 出力ファイルを確定する。結合結果がキー順に並び替えられると、同じ市区町村を
        // 複数回出力して後続の断片が先行ファイルを上書きしてしまう。
        await test('it preserves the order of the left iterator', async () => {
          const one = async function *() {
            await new Promise((resolve) => setTimeout(resolve, 10));
            yield *[
              { id: 3, name: 'Charlie' },
              { id: 1, name: 'Alice' },
              { id: 2, name: 'Bob' },
            ];
          };
          const two = async function *() {
            await new Promise((resolve) => setTimeout(resolve, 10));
            yield *[{ id: 1, age: 25 }, { id: 2, age: 30 }, { id: 3, age: 35 }];
          };

          const res = await Array.fromAsync(
            index.mergeDataLeftJoin(one(), two(), ['id'], memory)
          );

          assert.deepStrictEqual(res, [
            { id: 3, name: 'Charlie', age: 35 },
            { id: 1, name: 'Alice', age: 25 },
            { id: 2, name: 'Bob', age: 30 },
          ]);
        });

        // 複合キーは _createKey が '|' 連結する。先頭の lg_code だけが一致する行
        // (011002|0001 と 012025|0001 など) が誤って結合されないことを確認する。
        // なお値そのものに '|' が含まれるとキーが衝突し得るが、呼び出し元が渡すのは
        // ABR の数字コード項目のみなので現れない (_createKey のコメント参照)。
        await test('it joins on composite keys', async () => {
          const one = async function *() {
            await Promise.resolve();
            yield *[
              { lg_code: '011002', machiaza_id: '0001', name: 'A' },
              { lg_code: '011002', machiaza_id: '0002', name: 'B' },
              { lg_code: '012025', machiaza_id: '0001', name: 'C' },
            ];
          };
          const two = async function *() {
            await Promise.resolve();
            yield *[
              { lg_code: '012025', machiaza_id: '0001', lat: 43.0 },
              { lg_code: '011002', machiaza_id: '0002', lat: 43.1 },
            ];
          };

          const res = await Array.fromAsync(
            index.mergeDataLeftJoin(one(), two(), ['lg_code', 'machiaza_id'], memory)
          );

          assert.deepStrictEqual(res, [
            { lg_code: '011002', machiaza_id: '0001', name: 'A' },
            { lg_code: '011002', machiaza_id: '0002', name: 'B', lat: 43.1 },
            { lg_code: '012025', machiaza_id: '0001', name: 'C', lat: 43.0 },
          ]);
        });

        await test('it yields the left rows unchanged when the right side is empty', async () => {
          const one = async function *() {
            await Promise.resolve();
            yield *[{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }];
          };
          // 位置参照拡張データが存在しない市区町村では空のイテレータが渡される。
          const two = async function *(): AsyncIterableIterator<{ id: number, age: number }> {};

          const res = await Array.fromAsync(
            index.mergeDataLeftJoin(one(), two(), ['id'], memory)
          );

          assert.deepStrictEqual(res, [
            { id: 1, name: 'Alice' },
            { id: 2, name: 'Bob' },
          ]);
        });
      });
    }

    // SQLite パスは os.tmpdir() 配下に一時ディレクトリを作る。ジェネレータは yield 地点で
    // 中断されるため、後始末を finally に置かないと消費側の break や例外で残留する。
    await describe('temporary database cleanup on the sqlite path', async () => {
      const TMP_PREFIX = 'merge-data-left-join-';
      const countTmpDirs = async () => {
        const entries = await fsp.readdir(os.tmpdir());
        return entries.filter((entry) => entry.startsWith(TMP_PREFIX)).length;
      };

      const left = async function *() {
        await Promise.resolve();
        yield *[{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }, { id: 3, name: 'Charlie' }];
      };
      const right = async function *() {
        await Promise.resolve();
        yield *[{ id: 1, age: 25 }, { id: 2, age: 30 }, { id: 3, age: 35 }];
      };

      await test('it removes the temporary directory when the consumer breaks early', async () => {
        const before = await countTmpDirs();

        let seen = 0;
        for await (const row of index.mergeDataLeftJoin(left(), right(), ['id'])) {
          void row;
          seen++;
          break;
        }

        assert.strictEqual(seen, 1);
        assert.strictEqual(await countTmpDirs(), before);
      });

      await test('it removes the temporary directory when the consumer throws', async () => {
        const before = await countTmpDirs();

        await assert.rejects(async () => {
          for await (const row of index.mergeDataLeftJoin(left(), right(), ['id'])) {
            void row;
            throw new Error('consumer failed');
          }
        }, /consumer failed/);

        assert.strictEqual(await countTmpDirs(), before);
      });
    });

    // 以下は 2 つの経路で挙動が異なる箇所。どちらが正しいという話ではなく、
    // 差分を明示して意図しない変化に気付けるようにするための特性テスト。
    // memory: true を渡すのは 04_make_chiban.ts のみなので、影響範囲は地番の結合に限られる。
    await describe('semantic differences between the two paths', async () => {
      const left = async function *() {
        await Promise.resolve();
        yield *[{ id: 1, name: 'Alice' }];
      };

      // SQLite の LEFT JOIN は右側に同一キーが複数あると行が増える (ファンアウト) が、
      // Map は最後の 1 件だけを保持するため 1 行に畳まれる。
      await test('duplicate right-side keys fan out on the sqlite path', async () => {
        const right = async function *() {
          await Promise.resolve();
          yield *[{ id: 1, age: 10 }, { id: 1, age: 20 }];
        };

        const res = await Array.fromAsync(
          index.mergeDataLeftJoin(left(), right(), ['id'], false)
        );

        assert.deepStrictEqual(res, [
          { id: 1, name: 'Alice', age: 10 },
          { id: 1, name: 'Alice', age: 20 },
        ]);
      });

      await test('duplicate right-side keys collapse to the last one on the Map path', async () => {
        const right = async function *() {
          await Promise.resolve();
          yield *[{ id: 1, age: 10 }, { id: 1, age: 20 }];
        };

        const res = await Array.fromAsync(
          index.mergeDataLeftJoin(left(), right(), ['id'], true)
        );

        assert.deepStrictEqual(res, [
          { id: 1, name: 'Alice', age: 20 },
        ]);
      });

      // SQLite パスの json_patch は値が null のキーを削除する RFC 7396 の挙動を持つが、
      // Map パスの Object.assign は null をそのまま上書きする。
      // 実際の CSV 由来のレコードは全フィールドが文字列 (Record<string, string>) なので
      // 現状のパイプラインでは発生しないが、経路を差し替える際の注意点として残す。
      await test('null right-side values delete the key on the sqlite path but survive on the Map path', async () => {
        const right = async function *() {
          await Promise.resolve();
          yield *[{ id: 1, age: null }];
        };

        assert.deepStrictEqual(
          await Array.fromAsync(index.mergeDataLeftJoin(left(), right(), ['id'], false)),
          [{ id: 1, name: 'Alice' }],
        );
        assert.deepStrictEqual(
          await Array.fromAsync(index.mergeDataLeftJoin(left(), right(), ['id'], true)),
          [{ id: 1, name: 'Alice', age: null }],
        );
      });
    });
  });
});
