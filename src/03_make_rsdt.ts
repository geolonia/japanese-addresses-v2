#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { getAndParseCSVDataForId, getAndStreamCSVDataForId } from './lib/ckan.js';
import { mergeRsdtdspRsdtData, RsdtdspRsdtData, RsdtdspRsdtDataWithPos, RsdtdspRsdtPosData } from './lib/ckan_data/rsdtdsp_rsdt.js';
import { RsdtApi } from './data.js';
import { projectABRData } from './lib/proj.js';
import { MachiAzaData } from './lib/ckan_data/machi_aza.js';

function pathParts(machiAzaData: Map<string, MachiAzaData>, rsdtData: RsdtdspRsdtDataWithPos) {
  const ma = machiAzaData.get(`${rsdtData.lg_code}|${rsdtData.machiaza_id}`);
  if (!ma) {
    // 町字のデータが無い時は合併などで廃止された可能性があるため、エラーにしない
    return undefined;
    // throw new Error(`machiAza not found for ${rsdtData.lg_code}|${rsdtData.machiaza_id}`);
  }
  return [
    ma.pref,
    `${ma.county}${ma.city}${ma.ward}`,
    `${ma.oaza_cho}${ma.chome}${ma.koaza}`,
  ];
}

function outputRsdtData(outDir: string, outSubDir: string, apiData: RsdtApi) {
  const outFile = path.join(outDir, 'ja', outSubDir, '住居表示.json');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(apiData, null, 2));
  console.log(`${outSubDir}: ${apiData.length.toString(10).padEnd(4, ' ')} 件の住居を出力した`);
}

async function main(argv: string[]) {
  const outDir = argv[2] || path.join(import.meta.dirname, '..', 'out', 'api');
  fs.mkdirSync(outDir, { recursive: true });

  const machiAzaData = await getAndParseCSVDataForId<MachiAzaData>('ba-o1-000000_g2-000003'); // 市区町村 & 町字
  const machiAzaDataByCode = new Map(machiAzaData.map((city) => [
    `${city.lg_code}|${city.machiaza_id}`,
    city
  ]));

  const mainStream = getAndStreamCSVDataForId<RsdtdspRsdtData>('ba000003');
  const posStream = getAndStreamCSVDataForId<RsdtdspRsdtPosData>('ba000006');
  const rawData = mergeRsdtdspRsdtData(mainStream, posStream);

  let lastOutDir: string | undefined = undefined;
  let apiData: RsdtApi = [];
  for await (const raw of rawData) {
    const parts = pathParts(machiAzaDataByCode, raw);
    if (typeof parts === 'undefined') {
      continue;
    }
    const myOutDir = path.join(...parts);
    if (lastOutDir !== myOutDir && lastOutDir !== undefined) {
      outputRsdtData(outDir, lastOutDir, apiData);
      apiData = [];
    }
    if (lastOutDir !== myOutDir) {
      lastOutDir = myOutDir;
    }
    apiData.push({
      blk_num: raw.blk_num === '' ? undefined : raw.blk_num,
      rsdt_num: raw.rsdt_num,
      rsdt_num2: raw.rsdt_num2 === '' ? undefined : raw.rsdt_num2,
      point: 'rep_srid' in raw ? projectABRData(raw) : undefined,
    });
  }
  if (lastOutDir) {
    outputRsdtData(outDir, lastOutDir, apiData);
  }
}

main(process.argv)
  .then(() => {
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
