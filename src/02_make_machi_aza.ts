#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import { getAndStreamCSVDataForId } from './lib/ckan.js';
import { MachiAzaApi, SingleMachiAza } from './data.js';
import { MachiAzaData, MachiAzaPosData } from './lib/ckan_data/machi_aza.js';
import { mergeDataLeftJoin } from './lib/ckan_data/index.js';
import { rawToMachiAza } from './02_machi_aza.js';
import { downloadAndExtractNlftpMlitFile, NlftpMlitDataRow } from './lib/mlit_nlftp.js';
import { createMergedApiData, filterMlitDataByPrefCity } from './lib/abr_mlit_merge_tools.js';

async function outputMachiAzaData(
  outDir: string,
  prefName: string,
  cityName: string,
  api: MachiAzaApi,
): Promise<number> {
  const outFile = path.join(outDir, 'ja', prefName, `${cityName}.json`);
  await fs.promises.mkdir(path.dirname(outFile), { recursive: true });
  await fs.promises.writeFile(outFile, JSON.stringify(api));
  console.log(`${prefName.padEnd(4, '　')} ${cityName.padEnd(10, '　')}: ${api.data.length.toString(10).padEnd(4, ' ')} 件の町字を出力した`);
  return api.data.length;
}

async function main(argv: string[]) {
  const updated = Math.floor(Date.now() / 1000);
  const outDir = argv[2] || path.join(import.meta.dirname, '..', 'out', 'api');
  fs.mkdirSync(outDir, { recursive: true });


  const mainStream = getAndStreamCSVDataForId<MachiAzaData>('ba-o1-000000_g2-000003');
  const posStream = getAndStreamCSVDataForId<MachiAzaPosData>('ba000004');
  const rawData = mergeDataLeftJoin(mainStream, posStream, ['lg_code', 'machiaza_id']);
  // const rawData = mergeMachiAzaData(mainStream, posStream);

  let lastLGCode: string | undefined = undefined;
  let lastPrefName: string | undefined = undefined;
  let lastCityName: string | undefined = undefined;
  let lastMlitData: NlftpMlitDataRow[] | undefined = undefined;
  let allCount = 0;
  let apiData: SingleMachiAza[] = [];
  for await (const raw of rawData) {
    if (lastLGCode !== raw.lg_code && lastLGCode !== undefined) {
      const filteredMlit = filterMlitDataByPrefCity(lastMlitData!, lastPrefName!, lastCityName!);
      apiData = createMergedApiData(apiData, filteredMlit);
      const api: MachiAzaApi = { meta: { updated }, data: apiData };
      allCount += await outputMachiAzaData(outDir, lastPrefName!, lastCityName!, api);
      apiData = [];
    }
    if (lastPrefName !== raw.pref) {
      // 都道府県が変わったので、都道府県レベルの新しいデータを取得する
      lastMlitData = await downloadAndExtractNlftpMlitFile(raw.lg_code.slice(0, 2));
    }
    if (lastLGCode !== raw.lg_code) {
      lastLGCode = raw.lg_code;
      lastPrefName = raw.pref;
      lastCityName = `${raw.county}${raw.city}${raw.ward}`;
    }

    apiData.push(rawToMachiAza(raw));
  }
  if (lastLGCode) {
    const filteredMlit = filterMlitDataByPrefCity(lastMlitData!, lastPrefName!, lastCityName!);
    apiData = createMergedApiData(apiData, filteredMlit);
    const api: MachiAzaApi = { meta: { updated }, data: apiData };
    allCount += await outputMachiAzaData(outDir, lastPrefName!, lastCityName!, api);
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
