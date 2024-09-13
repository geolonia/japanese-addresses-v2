import Database from "better-sqlite3";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";

function _createKey(data: any, keys: string[]): string {
  return keys.map((key) => `${data[key]}`).join("|");
}

export async function *mergeDataLeftJoin<T, U>(left: AsyncIterableIterator<T>, right: AsyncIterableIterator<U>, keys: string[], memory: boolean = false): AsyncIterableIterator<(T | T & U)> {
  let tmpDbPath = ":memory:";

  if (!memory) {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "merge-data-left-join-"));
    tmpDbPath = path.join(tmpDir, "db.sqlite3");
    console.log(`Creating temporary database: ${tmpDbPath}`);
  }

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
    pipeline(left, async function *(source) {
      for await (const data of source) {
        stmt1.run(_createKey(data, keys), JSON.stringify(data));
      }
    }),
    pipeline(right, async function *(source) {
      for await (const data of source) {
        stmt2.run(_createKey(data, keys), JSON.stringify(data));
      }
    }),
  ]);
  db.exec(`
    CREATE INDEX l_key ON l(key);
    CREATE INDEX r_key ON r(key);
  `);

  const select = db.prepare<void[], {d01: string, d02: string}>(`
    SELECT
      json_patch(l.data, coalesce(r.data, '{}')) AS d01
    FROM
      l
      LEFT JOIN r ON l.key = r.key
  `);
  for (const data of select.iterate()) {
    yield JSON.parse(data.d01);
  }

  db.close();
  if (!memory) {
    await fs.rm(path.dirname(tmpDbPath), { recursive: true });
  }
}
