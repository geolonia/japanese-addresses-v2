import path from 'node:path';
import fs from 'node:fs';

import { fetch } from 'undici';

const USER_AGENT = 'curl/8.7.1';
const CACHE_DIR = path.join(import.meta.dirname, '..', '..', 'cache');

export async function getDownloadStream(url: string): Promise<Buffer> {
  const cacheKey = url.replace(/[^a-zA-Z0-9]/g, '_');
  const cacheFile = path.join(CACHE_DIR, 'files', cacheKey);

  let buffer: Buffer;
  if (!fs.existsSync(cacheFile)) {
    // console.log(`Downloading ${url}`);
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
      },
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    await fs.promises.mkdir(path.dirname(cacheFile), { recursive: true });
    const body = await res.arrayBuffer();
    buffer = Buffer.from(body);
    await fs.promises.writeFile(cacheFile, buffer);
  } else {
    buffer = await fs.promises.readFile(cacheFile);
  }

  return buffer;
}
