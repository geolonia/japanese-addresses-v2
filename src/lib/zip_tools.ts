import { Readable } from 'node:stream';
import unzipper, { Entry } from 'unzipper';

/**
 * A function to unzip a file that may or may not contain another zip file.
 * The zip file is extracted and each file is returned as a readable stream.
 */
export async function *unzipAndExtractZipFile(zipFile: Readable): AsyncGenerator<Entry> {
  const files = zipFile.pipe(unzipper.Parse({forceStream: true}));
  for await (const entry_ of files) {
    const entry = entry_ as Entry;
    if (entry.type === 'File' && entry.path.endsWith('.zip')) {
      yield *unzipAndExtractZipFile(entry);
    } else if (entry.type === 'File' && entry.path.endsWith('.csv')) {
      yield entry;
    } else {
      entry.autodrain();
    }
  }
}

export async function *unzipAndExtractZipBuffer(zipFile: Buffer): AsyncGenerator<Buffer & {path: string}> {
  const directory = await unzipper.Open.buffer(zipFile);
  for (const file of directory.files) {
    if (file.type === 'File' && file.path.endsWith('.zip')) {
      const content = await file.buffer();
      yield *unzipAndExtractZipBuffer(content);
    } else if (file.type === 'File' && file.path.endsWith('.csv')) {
      const content = await file.buffer();
      yield Object.assign(content, {path: file.path});
    }
  }
}
