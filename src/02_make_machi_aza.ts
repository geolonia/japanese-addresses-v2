#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import { getAndParseCSVDataForId } from './lib/ckan.js';
import { CityApi, MachiAzaApi } from './data.js';
import { projectABRData } from './lib/proj.js';
import { MachiAzaData, MachiAzaPosData, mergeMachiAzaData } from './lib/ckan_data/machi_aza.js';

async function outputMachiAzaData(outDir: string, prefName: string, cityName: string, apiData: MachiAzaApi) {
  const outFile = path.join(outDir, prefName, `${cityName}.json`);
  fs.writeFileSync(outFile, JSON.stringify(apiData, null, 2));
  console.log(`${prefName.padEnd(4, '　')} ${cityName}: ${apiData.length.toString(10).padEnd(3, ' ')} 件の市区町村を出力した`);
}

async function main(argv: string[]) {
  const outDir = argv[2] || path.join(import.meta.dirname, '..', 'out', 'api');
  fs.mkdirSync(outDir, { recursive: true });

  const [
    main,
    pos,
  ] = await Promise.all([
    getAndParseCSVDataForId<MachiAzaData>('ba-o1-000000_g2-000003'), // 市区町村
    getAndParseCSVDataForId<MachiAzaPosData>('ba000004'), // 位置参照拡張
  ]);
  const rawData = mergeMachiAzaData(main, pos);

  let lastLGCode: string | undefined = undefined;
  let lastPrefName: string | undefined = undefined;
  let lastCityName: string | undefined = undefined;
  let allCount = 0;
  let apiData: MachiAzaApi = [];
  for (const raw of rawData) {
    allCount++;
    if (lastLGCode !== raw.lg_code && lastLGCode !== undefined) {
      outputMachiAzaData(outDir, lastPrefName!, lastCityName!, apiData);
      apiData = [];
    }
    if (lastLGCode !== raw.lg_code) {
      lastLGCode = raw.lg_code;
      lastPrefName = raw.pref;
      lastCityName = `${raw.county}${raw.city}${raw.ward}`;
    }
    apiData.push({
      machiaza_id: raw.machiaza_id,
      oaza_cho: raw.oaza_cho === '' ? undefined : raw.oaza_cho,
      chome: raw.chome === '' ? undefined : raw.chome,
      koaza: raw.koaza === '' ? undefined : raw.koaza,
      rsdt: raw.rsdt_addr_flg === '1',
      point: projectABRData(raw),
    });
  }
  if (lastLGCode) {
    outputMachiAzaData(outDir, lastPrefName!, lastCityName!, apiData);
  }

  console.log(`全国: ${allCount} 件の町字を出力した`);
}

main(process.argv)
  .then(() => {
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
