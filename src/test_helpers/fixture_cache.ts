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

// SIGINT/SIGTERM の既定の終了コード (128 + シグナル番号)
const SIGNAL_EXIT_CODES = { SIGINT: 130, SIGTERM: 143 } as const;

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
  // exit イベントはシグナルによる終了では発火しないため、Ctrl-C で中断すると
  // 一時ディレクトリが残る。シグナルを通常の終了に変換して上の後始末を通す。
  // ハンドラを張ると既定の即時終了が無効になるので、同じ終了コードで抜ける。
  for (const [signal, exitCode] of Object.entries(SIGNAL_EXIT_CODES)) {
    process.on(signal, () => { process.exit(exitCode); });
  }
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
