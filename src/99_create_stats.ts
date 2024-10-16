import fs from 'node:fs';
import path from 'node:path';
import { cityName, MachiAzaApi, PrefectureApi, prefectureName } from './data.js';

type Stats = {
  prefCount: number;
  lgCount: number;
  machiAzaCount: number;
  machiAzaWithChibanCount: number;
  machiAzaWithRsdtCount: number;
  machiAzaWithChibanAndRsdtCount: number;
  rsdtCount: number;
  chibanCount: number;
}

async function getCountForCSVRange(path: string, range?: { start: number, length: number }): Promise<number> {
  if (!range) { return 0; }
  try {
    const { start, length } = range;
    const fd = await fs.promises.open(path, 'r');
    const stream = fd.createReadStream({
      start,
      end: start + length - 1,
    });
    let lineCount = 0;
    stream.on('data', (chunk) => {
      let idx = -1;
      lineCount--;
      do {
        idx = chunk.indexOf("\n", idx + 1);
        lineCount++;
      } while (idx !== -1);
    });
    await new Promise((resolve, reject) => {
      stream.on('end', resolve);
      stream.on('error', reject);
    });
    await fd.close();
    return lineCount - 3; // remove the two header lines and the trailing newline
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return 0;
    }
    throw e;
  }
}

(async () => {
  const dataDir = path.join(import.meta.dirname, '..', 'out', 'api');

  const jaJSON = await fs.promises.readFile(path.join(dataDir, 'ja.json'), 'utf8');
  const ja = JSON.parse(jaJSON) as PrefectureApi;

  const stats: Stats = {
    prefCount: ja.data.length,
    lgCount: ja.data.reduce((acc, pref) => acc + pref.cities.length, 0),
    machiAzaCount: 0,
    machiAzaWithRsdtCount: 0,
    machiAzaWithChibanCount: 0,
    machiAzaWithChibanAndRsdtCount: 0,
    rsdtCount: 0,
    chibanCount: 0,
  };

  for (const pref of ja.data) {
    for (const lg of pref.cities) {
      const machiAzaJSON = await fs.promises.readFile(path.join(
        dataDir, 'ja', prefectureName(pref), `${cityName(lg)}.json`
      ), 'utf-8');
      const machiAza = JSON.parse(machiAzaJSON) as MachiAzaApi;
      stats.machiAzaCount += machiAza.data.length;

      for (const ma of machiAza.data) {
        if ((ma.csv_ranges || {})['地番']) {
          stats.machiAzaWithChibanCount++;
        }
        if ((ma.csv_ranges || {})['住居表示']) {
          stats.machiAzaWithRsdtCount++;
        }
        if ((ma.csv_ranges || {})['地番'] && (ma.csv_ranges || {})['住居表示']) {
          stats.machiAzaWithChibanAndRsdtCount++;
        }

        stats.chibanCount += await getCountForCSVRange(path.join(
          dataDir, 'ja', prefectureName(pref), `${cityName(lg)}-地番.txt`
        ), (ma.csv_ranges || {})['地番']);

        stats.rsdtCount += await getCountForCSVRange(path.join(
          dataDir, 'ja', prefectureName(pref), `${cityName(lg)}-住居表示.txt`
        ), (ma.csv_ranges || {})['住居表示']);
      }
    }
  }

  await fs.promises.writeFile(path.join(dataDir, 'stats.json'), JSON.stringify(stats, null, 2));
})().then(() => {
  process.exit(0);
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
