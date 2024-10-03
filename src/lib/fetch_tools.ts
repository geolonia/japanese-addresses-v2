import path from 'node:path';
import fs from 'node:fs';
import { Readable } from 'node:stream';

import { fetch } from 'undici';

const USER_AGENT = 'curl/8.7.1';
const CACHE_DIR = path.join(import.meta.dirname, '..', '..', 'cache');

export async function getDownloadStream(url: string): Promise<Readable> {
  const cacheKey = url.replace(/[^a-zA-Z0-9]/g, '_');
  const cacheFile = path.join(CACHE_DIR, 'files', cacheKey);

  let bodyStream: Readable;
  if (fs.existsSync(cacheFile)) {
    // console.log(`${cacheFile} found in cache`);
    bodyStream = fs.createReadStream(cacheFile);
  } else {
    // console.log(`Downloading ${url}`);
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
      },
    });

    const body = res.body;
    if (!body) {
      throw new Error('No body');
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const [bodyA, bodyB] = body.tee();
    bodyStream = Readable.fromWeb(bodyA);

    await fs.promises.mkdir(path.dirname(cacheFile), { recursive: true });
    const cacheStream = fs.createWriteStream(cacheFile);
    Readable.fromWeb(bodyB).pipe(cacheStream);
  }

  return bodyStream;
}
