#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import { getAndParseCSVDataForId } from './lib/ckan.js';
import { CityApi } from './data.js';
import { projectABRData } from './lib/proj.js';
import { CityData, CityPosData, mergeCityData } from './lib/ckan_data/city.js';

async function outputPrefectureData(outDir: string, prefName: string, apiData: CityApi) {
  // 政令都市の「区名」が無い場合は出力から除外する
  const filteredApiData = apiData.filter((city) => {
    return (
      // 区名がある場合はそのまま出力
      city.ward !== undefined ||
      // 区名が無い場合は、同じ市区町村名で区名があるデータが無いか確認（ある＝政令都市のため、出力しない。ない＝政令都市ではない）
      apiData.filter((c2) => c2.city === city.city).every((c2) => c2.ward === undefined)
    );
  });

  const outFile = path.join(outDir, `${prefName}.json`);
  fs.writeFileSync(outFile, JSON.stringify(filteredApiData, null, 2));
  console.log(`${prefName.padEnd(4, '　')}: ${filteredApiData.length.toString(10).padEnd(3, ' ')} 件の市区町村を出力した`);
}

async function main(argv: string[]) {
  const outDir = argv[2] || path.join(import.meta.dirname, '..', 'out', 'api');
  fs.mkdirSync(outDir, { recursive: true });

  const [
    main,
    pos,
  ] = await Promise.all([
    getAndParseCSVDataForId<CityData>('ba-o1-000000_g2-000002'), // 市区町村
    getAndParseCSVDataForId<CityPosData>('ba-o1-000000_g2-000013'), // 位置参照拡張
  ]);
  const rawData = mergeCityData(main, pos);

  let lastPref: string | undefined = undefined;
  let allCount = 0;
  let apiData: CityApi = [];
  for (const raw of rawData) {
    allCount++;
    if (lastPref !== raw.pref && lastPref !== undefined) {
      outputPrefectureData(outDir, lastPref, apiData);
      apiData = [];
    }
    if (lastPref !== raw.pref) {
      lastPref = raw.pref;
    }
    apiData.push({
      code: parseInt(raw.lg_code),
      county: raw.county === '' ? undefined : raw.county,
      city: raw.city,
      ward: raw.ward === '' ? undefined : raw.ward,
      point: projectABRData(raw),
    });
  }
  if (lastPref) {
    outputPrefectureData(outDir, lastPref, apiData);
  }

  console.log(`全国: ${allCount} 件の市区町村を出力した`);
}

main(process.argv)
  .then(() => {
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
