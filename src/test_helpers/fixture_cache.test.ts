import assert from 'node:assert';
import fs from 'node:fs';
import test from 'node:test';
import { createTempCacheDir } from './fixture_cache.js';

// シグナル受信時の実際の後始末は、プロセスを落とさないと検証できない。
// ここではハンドラが登録されていること(= 既定の即時終了を上書きしていること)までを確認する。
await test('createTempCacheDir should register cleanup handlers for exit and signals', () => {
  const before = {
    exit: process.listenerCount('exit'),
    SIGINT: process.listenerCount('SIGINT'),
    SIGTERM: process.listenerCount('SIGTERM'),
  };

  const tmpCacheDir = createTempCacheDir('fixture-cache-test');
  assert.ok(fs.existsSync(tmpCacheDir));
  assert.strictEqual(process.env.CACHE_DIR, tmpCacheDir);

  // exit は SIGINT/SIGTERM では発火しないため、シグナル側にも登録が要る
  assert.strictEqual(process.listenerCount('exit'), before.exit + 1);
  assert.strictEqual(process.listenerCount('SIGINT'), before.SIGINT + 1);
  assert.strictEqual(process.listenerCount('SIGTERM'), before.SIGTERM + 1);

  // 2回目以降の呼び出しでハンドラを増やさない(テスト毎に呼ばれるとリーク警告が出る)
  createTempCacheDir('fixture-cache-test-2');
  assert.strictEqual(process.listenerCount('exit'), before.exit + 1);
  assert.strictEqual(process.listenerCount('SIGINT'), before.SIGINT + 1);
  assert.strictEqual(process.listenerCount('SIGTERM'), before.SIGTERM + 1);
});
