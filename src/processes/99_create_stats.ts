import fs from 'node:fs';
import path from 'node:path';
import { parse as csvParse } from 'csv-parse';
import { pipeline } from 'node:stream/promises';
import { cityName, MachiAzaApi, PrefectureApi, prefectureName } from '../data.js';

type Stats = {
  prefCount: number;
  lgCount: number;
  machiAzaCount: number;
  machiAzaWithChibanCount: number;
  machiAzaWithRsdtCount: number;
  machiAzaWithChibanAndRsdtCount: number;
  rsdtCount: number;
  rsdtWithPosCount: number;
  chibanCount: number;
  chibanWithPosCount: number;
}

async function getCountForCSVRange(path: string, range?: { start: number, length: number }): Promise<[number, number]> {
  if (!range) { return [0, 0]; }
  try {
    const { start, length } = range;
    const fd = await fs.promises.open(path, 'r');
    const stream = fd.createReadStream({
      start,
      end: start + length - 1,
    });
    const parser = csvParse({
      columns: true,
      from_line: 2,
    });
    let count = 0;
    let countWithPos = 0;
    await pipeline(stream, parser, async (source) => {
      for await (const record of source) {
        count++;
        if (record['lng'] && record['lat']) {
          countWithPos++;
        }
      }
    });
    return [count, countWithPos];
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return [0, 0];
    }
    throw e;
  }
}

async function main() {
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
    rsdtWithPosCount: 0,
    chibanCount: 0,
    chibanWithPosCount: 0,
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

        const [ chibanCount, chibanWithPosCount ] = await getCountForCSVRange(path.join(
          dataDir, 'ja', prefectureName(pref), `${cityName(lg)}-地番.txt`
        ), (ma.csv_ranges || {})['地番']);
        stats.chibanCount += chibanCount;
        stats.chibanWithPosCount += chibanWithPosCount;

        const [ rsdtCount, rsdtWithPosCount] = await getCountForCSVRange(path.join(
          dataDir, 'ja', prefectureName(pref), `${cityName(lg)}-住居表示.txt`
        ), (ma.csv_ranges || {})['住居表示']);
        stats.rsdtCount += rsdtCount;
        stats.rsdtWithPosCount += rsdtWithPosCount;
      }
    }
  }

  await fs.promises.writeFile(path.join(dataDir, 'stats.json'), JSON.stringify(stats, null, 2));
}

export default main;
