import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO_ROOT = path.join(import.meta.dirname, '..', '..');
const FIXTURES_DIR = path.join(REPO_ROOT, 'test', 'fixtures', 'cache');

// 作成した一時ディレクトリはプロセス終了時にまとめて削除する。
// テスト毎の after フックに任せると、テストが例外で終了したときに残ってしまう。
// 失敗したテストのキャッシュ内容を調べたい場合は KEEP_TEST_CACHE=1 を指定する。
const tmpCacheDirs: string[] = [];
let cleanupRegistered = false;

function registerCleanup() {
  if (cleanupRegistered) { return; }
  cleanupRegistered = true;
  process.on('exit', () => {
    if (process.env.KEEP_TEST_CACHE) {
      console.log(`KEEP_TEST_CACHE: ${tmpCacheDirs.join(', ')}`);
      return;
    }
    for (const dir of tmpCacheDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

// テスト用に空の一時 CACHE_DIR を割り当てる (process.env.CACHE_DIR)。
// リポジトリ直下の cache/ を触らないため、ローカルの実データキャッシュや
// CI の actions/cache と競合しない。
export function createTempCacheDir(name: string): string {
  const tmpCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), `japanese-addresses-cache-${name}-`));
  tmpCacheDirs.push(tmpCacheDir);
  registerCleanup();
  process.env.CACHE_DIR = tmpCacheDir;
  return tmpCacheDir;
}

// ABRデータ配信CDN(data.address-br.digital.go.jp)は日本国外をブロックするため
// CIから実ネットワークでは取得できない。fetch_tools.ts/hub.ts のファイルキャッシュに
// テスト用 fixture を事前配置することで、テストをオフラインで実行可能にする。
//
// テスト毎に独立した一時 CACHE_DIR を割り当て、並列実行されたテスト間で
// キャッシュが衝突しないようにする。
export function setupFixtureCache(fixtureName: string): string {
  const fixtureDir = path.join(FIXTURES_DIR, fixtureName);
  if (!fs.existsSync(fixtureDir)) {
    throw new Error(`Fixture directory not found: ${fixtureDir}`);
  }
  const tmpCacheDir = createTempCacheDir(fixtureName);
  fs.cpSync(fixtureDir, tmpCacheDir, { recursive: true, force: true });
  return tmpCacheDir;
}
