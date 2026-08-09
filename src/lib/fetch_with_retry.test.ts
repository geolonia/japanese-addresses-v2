import assert from 'node:assert';
import test from 'node:test';
import { Response } from 'undici';
import { fetchWithRetry } from './fetch_with_retry.js';
import { withMockAgent } from '../test_helpers/mock_agent.js';

await test('fetchWithRetry should fetch successfully', async () => {
  await withMockAgent(async (mockAgent) => {
    mockAgent.get('https://example.com')
      .intercept({ path: '/', method: 'GET' })
      .reply(200, 'OK');

    const res = await fetchWithRetry('https://example.com/');
    assert.ok(res instanceof Response);
    assert.strictEqual(res.status, 200);
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
    assert.strictEqual(attempts, 1, 'Should not retry on 403');
  });
});

await test('fetchWithRetry should raise exception when network is disconnected', async () => {
  await withMockAgent(async () => {
    await assert.rejects(
      fetchWithRetry('https://example.com/'),
      new TypeError('fetch failed')
    );
  });
});
