import { fetch, Response, RequestInit } from 'undici';

export async function fetchWithRetry(url: string, options?: RequestInit, retries: number = 3): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fetch(url, options);
    } catch (err) {
      if (attempt < retries - 1) {
        console.warn(`Fetch failed (attempt ${attempt + 1}), retrying...`, (err instanceof Error) ? err.message : String(err));
        await new Promise(res => setTimeout(res, 1000 * (attempt + 1))); // エクスポネンシャルバックオフ
      } else {
        throw err;
      }
    }
  }
  throw new Error("Unreachable");
}
