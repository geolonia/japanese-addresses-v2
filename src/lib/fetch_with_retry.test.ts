import assert from 'node:assert';
import test from 'node:test';
import { Response, MockAgent, setGlobalDispatcher } from 'undici';
import { fetchWithRetry } from './fetch_with_retry.js';

await test('fetchWithRetry should fetch successfully', async () => {
  // Use a public endpoint that always returns 200
  const res = await fetchWithRetry('https://httpbin.org/status/200');
  assert.ok(res instanceof Response);
  assert.strictEqual(res.status, 200);
});

await test('fetchWithRetry should retry and eventually fail on invalid domain', async () => {
  const invalidUrl = 'https://invalid-domain.example.com/';
  let errorCaught = false;
  try {
    await fetchWithRetry(invalidUrl, undefined, 2);
  } catch (err) {
    errorCaught = true;
    assert.ok(err instanceof Error);
  }
  assert.ok(errorCaught, 'Should throw error after retries');
});

await test('fetchWithRetry should respect retries option', async () => {
  let attempts = 0;

  // Set up undici MockAgent
  const mockAgent = new MockAgent();
  setGlobalDispatcher(mockAgent);

  const mockPool = mockAgent.get('https://example.com');
  mockPool.intercept({ path: '/', method: 'GET' }).reply(() => {
    attempts += 1;
    throw new Error('Simulated fetch error');
  });

  try {
    await fetchWithRetry('https://example.com/', undefined, 2);
  } catch {
    // ignore
  }

  assert.strictEqual(attempts, 2, 'Should attempt fetch 2 times');

  // Restore undici dispatcher
  await mockAgent.close();
});
