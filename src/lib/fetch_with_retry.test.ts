import assert from 'node:assert';
import test from 'node:test';
import { Response } from 'undici';
import { fetchWithRetry, parseRetryAfterMs } from './fetch_with_retry.js';
import { withMockAgent } from '../test_helpers/mock_agent.js';

// console.warn を差し替えて fn を実行し、出力された警告を配列で返す
async function withCapturedWarnings(fn: () => Promise<void>): Promise<string[]> {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(' ')); };
  try {
    await fn();
  } finally {
    console.warn = originalWarn;
  }
  return warnings;
}

// レスポンスボディの解放(cancel)が失敗する状況を再現する
async function withFailingBodyCancel<T>(fn: () => Promise<T>): Promise<T> {
  const originalCancel = Object.getOwnPropertyDescriptor(ReadableStream.prototype, 'cancel');
  if (!originalCancel) {
    throw new Error('ReadableStream.prototype.cancel が見つかりません');
  }
  Object.defineProperty(ReadableStream.prototype, 'cancel', {
    ...originalCancel,
    value: () => Promise.reject(new Error('Simulated cancel error')),
  });
  try {
    return await fn();
  } finally {
    Object.defineProperty(ReadableStream.prototype, 'cancel', originalCancel);
  }
}

await test('fetchWithRetry should fetch successfully', async () => {
  await withMockAgent(async (mockAgent) => {
    mockAgent.get('https://example.com')
      .intercept({ path: '/', method: 'GET' })
      .reply(200, 'OK');

    const res = await fetchWithRetry('https://example.com/');
    assert.ok(res instanceof Response);
    assert.strictEqual(res.status, 200);
    // status だけでは別のインターセプタがマッチしても通ってしまうため、本文まで確認する
    assert.strictEqual(await res.text(), 'OK');
  });
});

await test('fetchWithRetry should respect retries option', async () => {
  await withMockAgent(async (mockAgent) => {
    let attempts = 0;
    mockAgent.get('https://example.com')
      .intercept({ path: '/', method: 'GET' })
      .reply(() => {
        attempts += 1;
        throw new Error('Simulated fetch error');
      })
      .persist();

    await assert.rejects(fetchWithRetry('https://example.com/', undefined, 2));
    assert.strictEqual(attempts, 2, 'Should attempt fetch 2 times');
  });
});

await test('fetchWithRetry should not retry on a non-retryable HTTP status', async () => {
  await withMockAgent(async (mockAgent) => {
    let attempts = 0;
    mockAgent.get('https://example.com')
      .intercept({ path: '/not-found', method: 'GET' })
      .reply(() => {
        attempts += 1;
        return { statusCode: 404, data: 'Not Found' };
      })
      .persist();

    const res = await fetchWithRetry('https://example.com/not-found');
    assert.strictEqual(res.status, 404);
    assert.strictEqual(await res.text(), 'Not Found');
    assert.strictEqual(attempts, 1, 'Should not retry on 404');
  });
});

await test('fetchWithRetry should retry on a retryable HTTP status', async () => {
  await withMockAgent(async (mockAgent) => {
    let attempts = 0;
    mockAgent.get('https://example.com')
      .intercept({ path: '/unavailable', method: 'GET' })
      .reply(() => {
        attempts += 1;
        return { statusCode: 503, data: 'Service Unavailable' };
      })
      .persist();

    // 最終試行でも解消しなかった場合は、そのレスポンスを呼び出し元に返す
    const res = await fetchWithRetry('https://example.com/unavailable', undefined, 2);
    assert.strictEqual(res.status, 503);
    assert.strictEqual(await res.text(), 'Service Unavailable');
    assert.strictEqual(attempts, 2, 'Should retry on 503');
  });
});

await test('fetchWithRetry should return the response once a retry succeeds', async () => {
  await withMockAgent(async (mockAgent) => {
    const mockPool = mockAgent.get('https://example.com');
    mockPool.intercept({ path: '/flaky', method: 'GET' }).reply(503, 'Service Unavailable');
    mockPool.intercept({ path: '/flaky', method: 'GET' }).reply(200, 'OK');

    const res = await fetchWithRetry('https://example.com/flaky', undefined, 2);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(await res.text(), 'OK');
  });
});

await test('fetchWithRetry should not retry on 403', async () => {
  await withMockAgent(async (mockAgent) => {
    let attempts = 0;
    mockAgent.get('https://example.com')
      .intercept({ path: '/forbidden', method: 'GET' })
      .reply(() => {
        attempts += 1;
        return { statusCode: 403, data: 'Forbidden' };
      })
      .persist();

    // ABRデータ配信CDNの国外アクセス制限は恒久的な拒否なので、再試行しても無駄になる
    const res = await fetchWithRetry('https://example.com/forbidden');
    assert.strictEqual(res.status, 403);
    assert.strictEqual(await res.text(), 'Forbidden');
    assert.strictEqual(attempts, 1, 'Should not retry on 403');
  });
});

await test('fetchWithRetry should not report a body cancel failure as a fetch failure', async () => {
  await withMockAgent(async (mockAgent) => {
    mockAgent.get('https://example.com')
      .intercept({ path: '/unavailable', method: 'GET' })
      .reply(503, 'Service Unavailable')
      .persist();

    // ボディの解放に失敗する状況を再現する。cancel が fetch と同じ try に入っていると、
    // 「Fetch returned 503」と「Fetch failed」の警告が同じ試行で二重に出る。
    const warnings = await withFailingBodyCancel(() => withCapturedWarnings(async () => {
      const res = await fetchWithRetry('https://example.com/unavailable', undefined, 2);
      assert.strictEqual(res.status, 503);
    }));

    assert.deepStrictEqual(
      warnings,
      ['Fetch returned 503 (attempt 1), retrying...'],
      'ボディ解放の失敗を fetch の失敗として報告してはいけない',
    );
  });
});

await test('fetchWithRetry should reject a retries option below 1', async () => {
  await withMockAgent(async (mockAgent) => {
    let attempts = 0;
    mockAgent.get('https://example.com')
      .intercept({ path: '/', method: 'GET' })
      .reply(() => {
        attempts += 1;
        return { statusCode: 200, data: 'OK' };
      })
      .persist();

    // retries=0 ではループが1度も回らず、内部エラー("Unreachable")になってしまう
    await assert.rejects(
      fetchWithRetry('https://example.com/', undefined, 0),
      /retries must be an integer >= 1/,
    );
    await assert.rejects(
      fetchWithRetry('https://example.com/', undefined, 1.5),
      /retries must be an integer >= 1/,
    );
    assert.strictEqual(attempts, 0, 'バリデーションはリクエスト前に行う');
  });
});

await test('fetchWithRetry should honor Retry-After on 429', async () => {
  await withMockAgent(async (mockAgent) => {
    const mockPool = mockAgent.get('https://example.com');
    // Retry-After: 0 は「すぐ再試行してよい」。指数バックオフ(1s)より短くなる
    mockPool.intercept({ path: '/rate-limited', method: 'GET' })
      .reply(429, 'Too Many Requests', { headers: { 'retry-after': '0' } });
    mockPool.intercept({ path: '/rate-limited', method: 'GET' }).reply(200, 'OK');

    const startedAt = process.hrtime.bigint();
    const warnings = await withCapturedWarnings(async () => {
      const res = await fetchWithRetry('https://example.com/rate-limited', undefined, 2);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(await res.text(), 'OK');
    });
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

    assert.deepStrictEqual(warnings, ['Fetch returned 429 (attempt 1), retrying...']);
    assert.ok(elapsedMs < 500, `Retry-After より指数バックオフが優先されている (${elapsedMs}ms)`);
  });
});

await test('parseRetryAfterMs should parse delay-seconds and HTTP-date', () => {
  const now = Date.parse('2026-08-10T00:00:00Z');

  // delay-seconds
  assert.strictEqual(parseRetryAfterMs('0', now), 0);
  assert.strictEqual(parseRetryAfterMs(' 3 ', now), 3000);
  // HTTP-date
  assert.strictEqual(parseRetryAfterMs('Mon, 10 Aug 2026 00:00:05 GMT', now), 5000);
  // サーバ時刻のずれで過去日時が来ても負の待ち時間にはしない
  assert.strictEqual(parseRetryAfterMs('Mon, 10 Aug 2026 00:00:00 GMT', now), 0);
  assert.strictEqual(parseRetryAfterMs('Sun, 09 Aug 2026 23:59:00 GMT', now), 0);
  // 上限で頭打ちにして、サーバ指定の長時間待機でパイプラインが止まらないようにする
  assert.strictEqual(parseRetryAfterMs('86400', now), 60_000);
  // 解釈できない値は無視して指数バックオフに任せる
  assert.strictEqual(parseRetryAfterMs(null, now), null);
  assert.strictEqual(parseRetryAfterMs('', now), null);
  assert.strictEqual(parseRetryAfterMs('soon', now), null);
  // Date.parse は数字だけの文字列も日付として受け付けるので、仕様外の値が紛れ込まないことを確認する
  assert.strictEqual(parseRetryAfterMs('-1', now), null);
  assert.strictEqual(parseRetryAfterMs('1.5', now), null);
});

await test('fetchWithRetry should raise exception when network is disconnected', async () => {
  await withMockAgent(async () => {
    await assert.rejects(
      fetchWithRetry('https://example.com/'),
      new TypeError('fetch failed')
    );
  });
});
