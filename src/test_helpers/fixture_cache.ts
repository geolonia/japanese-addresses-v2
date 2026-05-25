import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO_ROOT = path.join(import.meta.dirname, '..', '..');
const FIXTURES_DIR = path.join(REPO_ROOT, 'test', 'fixtures', 'cache');

// ABRデータ配信CDN(data.address-br.digital.go.jp)は日本国外をブロックするため
// CIから実ネットワークでは取得できない。fetch_tools.ts/hub.ts のファイルキャッシュに
// テスト用 fixture を事前配置することで、テストをオフラインで実行可能にする。
//
// テスト毎に独立した一時 CACHE_DIR を割り当て (process.env.CACHE_DIR)、
// 並列実行されたテスト間でキャッシュが衝突しないようにする。
export function setupFixtureCache(fixtureName: string) {
  const fixtureDir = path.join(FIXTURES_DIR, fixtureName);
  if (!fs.existsSync(fixtureDir)) {
    throw new Error(`Fixture directory not found: ${fixtureDir}`);
  }
  const tmpCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), `japanese-addresses-cache-${fixtureName}-`));
  fs.cpSync(fixtureDir, tmpCacheDir, { recursive: true, force: true });
  process.env.CACHE_DIR = tmpCacheDir;
  return tmpCacheDir;
}
