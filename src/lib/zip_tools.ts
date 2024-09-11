import { Readable } from 'node:stream';
import unzipper, { Entry } from 'unzipper';

/**
 * A function to unzip a file that may or may not contain another zip file.
 * The zip file is extracted and each file is returned as a readable stream.
 */
export async function *unzipAndExtractZipFile(zipFile: Readable): AsyncGenerator<Entry> {
  const files = zipFile.pipe(unzipper.Parse({forceStream: true}));
  for await (const entry of files) {
    if (entry.type === 'File' && entry.path.endsWith('.zip')) {
      yield *unzipAndExtractZipFile(entry);
    } else if (entry.type === 'File' && entry.path.endsWith('.csv')) {
      yield entry;
    }
  }
}
