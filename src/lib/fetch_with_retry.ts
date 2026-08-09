import { fetch, Response, RequestInit } from 'undici';

const BASE_DELAY_MS = 1000;

// Retry-After はサーバが指定する値なので、極端に大きい待ち時間でパイプライン全体が
// 止まらないよう上限を設ける。
const MAX_RETRY_AFTER_MS = 60_000;

// 一時的な障害として再試行するHTTPステータス。
// 403 はABRデータ配信CDNの国外アクセス制限のような恒久的な拒否で返るため、
// 再試行しても成功しないので対象に含めない。
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

// Retry-After ヘッダ (RFC 9110 10.2.3) は「秒数」または HTTP-date で表される。
// 解釈できない値は null を返し、呼び出し側の指数バックオフに任せる。
// テストから直接検証するために export している。
export function parseRetryAfterMs(headerValue: string | null | undefined, now: number = Date.now()): number | null {
  if (typeof headerValue !== 'string') { return null; }
  const value = headerValue.trim();
  if (value === '') { return null; }

  // delay-seconds
  if (/^\d+$/.test(value)) {
    return Math.min(Number(value) * 1000, MAX_RETRY_AFTER_MS);
  }
  // 負値や小数は仕様外。Date.parse は "-1" を西暦1年と解釈するなど数値も受け付けてしまうため、
  // HTTP-date として解釈する前に数字だけの値を弾く
  if (/^[+-]?[\d.]+$/.test(value)) { return null; }

  const retryAt = Date.parse(value);
  if (Number.isNaN(retryAt)) { return null; }
  // サーバとの時刻ずれで過去日時が来ることがあるため、負の待ち時間にはしない
  return Math.min(Math.max(retryAt - now, 0), MAX_RETRY_AFTER_MS);
}

export async function fetchWithRetry(url: string, options?: RequestInit, retries: number = 3): Promise<Response> {
  // retries はループの上限そのものなので、1未満だと一度もリクエストせずに
  // ループを抜けてしまう。呼び出し側の指定ミスを黙って握り潰さない。
  if (!Number.isInteger(retries) || retries < 1) {
    throw new RangeError(`retries must be an integer >= 1, but got ${retries}`);
  }

  for (let attempt = 0; attempt < retries; attempt++) {
    const isLastAttempt = attempt === retries - 1;
    // エクスポネンシャルバックオフ (1s, 2s, 4s, ...)
    let delayMs = BASE_DELAY_MS * 2 ** attempt;
    try {
      const res = await fetch(url, options);
      if (isLastAttempt || !RETRYABLE_STATUS_CODES.has(res.status)) {
        return res;
      }
      console.warn(`Fetch returned ${res.status} (attempt ${attempt + 1}), retrying...`);
      if (res.status === 429) {
        // レート制限はサーバ側が再開時刻を知っているので、固定のバックオフより優先する
        const retryAfterMs = parseRetryAfterMs(res.headers.get('retry-after'));
        if (retryAfterMs !== null) {
          delayMs = retryAfterMs;
        }
      }
      // 再試行するレスポンスのボディは読み捨てて接続を解放する。
      // ここを fetch と同じ try に入れると、解放の失敗が下の catch に落ちて
      // 「Fetch failed」と二重に警告されるため、独立した try/catch で握り潰す。
      try {
        await res.body?.cancel();
      } catch {
        // 解放に失敗しても再試行は続行できる
      }
    } catch (err) {
      if (isLastAttempt) {
        throw err;
      }
      console.warn(`Fetch failed (attempt ${attempt + 1}), retrying...`, (err instanceof Error) ? err.message : String(err));
    }
    await new Promise(res => setTimeout(res, delayMs));
  }
  throw new Error("Unreachable");
}
