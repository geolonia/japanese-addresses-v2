import assert from 'node:assert';
import test from 'node:test';
import { Response, MockAgent, setGlobalDispatcher, Agent } from 'undici';
import { fetchWithRetry } from './fetch_with_retry.js';

// 第三者サービス(httpbin.org等)やDNS解決に依存すると、そのサービスの障害で
// CIが落ちる。undiciのMockAgentで応答を差し替え、オフラインで実行できるようにする。
async function withMockAgent(fn: (mockAgent: MockAgent) => Promise<void>): Promise<void> {
  const mockAgent = new MockAgent();
  mockAgent.disableNetConnect();
  setGlobalDispatcher(mockAgent);
  try {
    await fn(mockAgent);
  } finally {
    await mockAgent.close();
    setGlobalDispatcher(new Agent());
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

await test('fetchWithRetry should raise exception when network is disconnected', async () => {
  await withMockAgent(async () => {
    await assert.rejects(
      fetchWithRetry('https://example.com/'),
      new TypeError('fetch failed')
    );
  });
});
