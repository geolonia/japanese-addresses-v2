import fs from 'node:fs';
import path from 'node:path';

import { parse as csvParse } from 'csv-parse';
import cliProgress from 'cli-progress';

import { cityName, MachiAzaApi, machiAzaName, PrefectureApi, prefectureName, SingleCity, SinglePrefecture } from '../data.js';
import { HeaderRow } from '../address_data.js';

function readUntilHeaderEnd(path: string): Promise<Buffer> {
  const HEADER_END = Buffer.from('=END=\n', 'utf8');
  return new Promise((resolve, reject) => {
    const readStream = fs.createReadStream(path);
    const chunks: Buffer[] = [];
    let foundEnd = false;
    readStream.on('data', (chunk: Buffer) => {
      if (foundEnd) {
        return;
      }
      const headerEndPos = chunk.indexOf(HEADER_END);
      if (headerEndPos !== -1) {
        foundEnd = true;
        readStream.close();
        chunks.push(chunk.subarray(0, headerEndPos));
      } else {
        chunks.push(chunk);
      }
    });
    readStream.on('close', () => {
      resolve(Buffer.concat(chunks));
    });
    readStream.on('error', (err) => {
      reject(err);
    });
  });
}

async function getRangesFromCSV(path: string): Promise<undefined | HeaderRow[]> {
  try {
    const headerData = await readUntilHeaderEnd(path);
    const headerStream = csvParse(headerData);
    const rows: HeaderRow[] = [];
    for await (const line of headerStream) {
      if (line[0] === '=END=') {
        break;
      }
      const [name, start, length] = line;
      rows.push({
        name,
        offset: parseInt(start),
        length: parseInt(length),
      });
    }
    return rows;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw e;
  }
}

async function main(argv: string[]) {
  const apiDir = argv[2] || path.join(import.meta.dirname, '..', 'out', 'api');
  const jaFile = path.join(apiDir, 'ja.json');
  const api = JSON.parse(fs.readFileSync(jaFile, 'utf-8')) as PrefectureApi;

  const progressInst = new cliProgress.MultiBar({
    format: ' {bar} {percentage}% | ETA: {eta_formatted} | {value}/{total}',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    etaBuffer: 30,
    fps: 2,
    // No-TTY output is required for CI/CD environments
    noTTYOutput: true,
  });

  const flatCities: [SinglePrefecture, SingleCity][] = [];
  for (const pref of api.data) {
    for (const city of pref.cities) {
      flatCities.push([pref, city]);
    }
  }

  const progress = progressInst.create(flatCities.length, 0);

  for (const [pref, city] of flatCities) {
    const cityPrefix = path.join(apiDir, 'ja', prefectureName(pref), cityName(city));
    const [
      chibanHeader,
      rsdtHeader,
    ] = await Promise.all([
      getRangesFromCSV(`${cityPrefix}-地番.txt`),
      getRangesFromCSV(`${cityPrefix}-住居表示.txt`),
    ]);

    if (!chibanHeader && !rsdtHeader) {
      progress.increment();
      continue;
    }

    const maData = JSON.parse(await fs.promises.readFile(`${cityPrefix}.json`, 'utf8')) as MachiAzaApi;
    for (const headerRow of chibanHeader || []) {
      const ma = maData.data.find((ma) => machiAzaName(ma) === headerRow.name);
      if (ma) {
        ma.csv_ranges = ma.csv_ranges || {};
        ma.csv_ranges['地番'] = { start: headerRow.offset, length: headerRow.length };
      }
    }
    for (const headerRow of rsdtHeader || []) {
      const ma = maData.data.find((ma) => machiAzaName(ma) === headerRow.name);
      if (ma) {
        ma.csv_ranges = ma.csv_ranges || {};
        ma.csv_ranges['住居表示'] = { start: headerRow.offset, length: headerRow.length };
      }
    }

    await fs.promises.writeFile(`${cityPrefix}.json`, JSON.stringify(maData));

    progress.increment();
  }

  progress.stop();
}

export default main;
