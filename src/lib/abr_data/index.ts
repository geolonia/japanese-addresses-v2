import Database from "better-sqlite3";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function _createKey(data: any, keys: string[]): string {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  return keys.map((key) => `${data[key]}`).join("|");
}

export async function *mergeDataLeftJoin<T, U>(left: AsyncIterableIterator<T>, right: AsyncIterableIterator<U>, keys: string[], memory: boolean = false): AsyncIterableIterator<(T | T & U)> {
  if (memory) {
    // Fast path: load right side into a Map then stream left, avoiding SQLite and JSON round-trips.
    const rightMap = new Map<string, U>();
    for await (const data of right) {
      rightMap.set(_createKey(data, keys), data);
    }
    for await (const data of left) {
      const rightData = rightMap.get(_createKey(data, keys));
      yield (rightData !== undefined
        ? Object.assign({}, data, rightData)
        : data) as T | (T & U);
    }
    return;
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "merge-data-left-join-"));
  const tmpDbPath = path.join(tmpDir, "db.sqlite3");
  console.log(`Creating temporary database: ${tmpDbPath}`);

  const db = new Database(tmpDbPath);
  db.pragma("synchronous = OFF");
  db.pragma("journal_mode = MEMORY");
  db.exec(`
    CREATE TABLE l (
      key TEXT,
      data JSONB
    );
    CREATE TABLE r (
      key TEXT,
      data JSONB
    );
  `);
  const stmt1 = db.prepare("INSERT INTO l VALUES (?, ?)");
  const stmt2 = db.prepare("INSERT INTO r VALUES (?, ?)");

  await Promise.all([
    pipeline(left, async function (source) {
      for await (const data of source) {
        stmt1.run(_createKey(data, keys), JSON.stringify(data));
      }
    }),
    pipeline(right, async function (source) {
      for await (const data of source) {
        stmt2.run(_createKey(data, keys), JSON.stringify(data));
      }
    }),
  ]);
  db.exec(`
    CREATE INDEX l_key ON l(key);
    CREATE INDEX r_key ON r(key);
  `);

  // 呼び出し元 (02_make_machi_aza など) は lg_code が連続していることを前提に
  // 市区町村ごとの出力ファイルを確定するため、左入力の順序を保つ必要がある。
  // ORDER BY が無いと順序はクエリプラン任せ (l_key インデックス走査が選ばれると
  // キー順になる) なので、挿入順である rowid 順を明示する。
  // rowid 順のスキャンは l の自然順なので、追加のソートコストは発生しない。
  const select = db.prepare<void[], {d01: string, d02: string}>(`
    SELECT
      json_patch(l.data, coalesce(r.data, '{}')) AS d01
    FROM
      l
      LEFT JOIN r ON l.key = r.key
    ORDER BY
      l.rowid
  `);
  for (const data of select.iterate()) {
    yield JSON.parse(data.d01);
  }

  db.close();
  await fs.rm(path.dirname(tmpDbPath), { recursive: true });
}
