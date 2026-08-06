import { fetch, Response, RequestInit } from 'undici';

const BASE_DELAY_MS = 1000;

// 一時的な障害として再試行するHTTPステータス。
// 403 はABRデータ配信CDNの国外アクセス制限のような恒久的な拒否で返るため、
// 再試行しても成功しないので対象に含めない。
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

export async function fetchWithRetry(url: string, options?: RequestInit, retries: number = 3): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const isLastAttempt = attempt === retries - 1;
    try {
      const res = await fetch(url, options);
      if (isLastAttempt || !RETRYABLE_STATUS_CODES.has(res.status)) {
        return res;
      }
      console.warn(`Fetch returned ${res.status} (attempt ${attempt + 1}), retrying...`);
      // 再試行するレスポンスのボディは読み捨てて接続を解放する
      await res.body?.cancel();
    } catch (err) {
      if (isLastAttempt) {
        throw err;
      }
      console.warn(`Fetch failed (attempt ${attempt + 1}), retrying...`, (err instanceof Error) ? err.message : String(err));
    }
    // エクスポネンシャルバックオフ (1s, 2s, 4s, ...)
    await new Promise(res => setTimeout(res, BASE_DELAY_MS * 2 ** attempt));
  }
  throw new Error("Unreachable");
}
