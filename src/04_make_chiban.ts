#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { ckanPackageSearch, findResultByTypeAndArea, getAndParseCSVDataForId, getAndStreamCSVDataForId } from './lib/ckan.js';
import { ChibanApi } from './data.js';
import { projectABRData } from './lib/proj.js';
import { MachiAzaData } from './lib/ckan_data/machi_aza.js';
import { ChibanData, ChibanDataWithPos, ChibanPosData, mergeChibanData } from './lib/ckan_data/chiban.js';

function pathParts(machiAzaData: Map<string, MachiAzaData>, rsdtData: ChibanDataWithPos) {
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

function outputChibanData(outDir: string, outSubDir: string, apiData: ChibanApi) {
  if (apiData.length === 0) {
    return;
  }
  const outFile = path.join(outDir, 'ja', outSubDir, '地番.json');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(apiData, null, 2));
  console.log(`${outSubDir}: ${apiData.length.toString(10).padEnd(4, ' ')} 件の地番を出力した`);
}

async function main(argv: string[]) {
  const outDir = argv[2] || path.join(import.meta.dirname, '..', 'out', 'api');
  fs.mkdirSync(outDir, { recursive: true });

  console.log('事前準備: 町字データを取得中...');
  const machiAzaData = await getAndParseCSVDataForId<MachiAzaData>('ba-o1-000000_g2-000003'); // 市区町村 & 町字
  const machiAzaDataByCode = new Map(machiAzaData.map((ma) => [
    `${ma.lg_code}|${ma.machiaza_id}`,
    ma
  ]));
  console.log('事前準備: 町字データを取得しました');
  const alreadyProcessed = new Set<string>();
  for (const ma of machiAzaData) {
    if (alreadyProcessed.has(ma.lg_code)) {
      continue;
    }
    alreadyProcessed.add(ma.lg_code);

    let area = `${ma.pref} ${ma.county}${ma.city}`;
    if (ma.ward !== '') {
      area += ` ${ma.ward}`;
    }
    let searchQuery = `${area} 地番マスター`;
    const results = await ckanPackageSearch(searchQuery);
    const chibanDataRef = findResultByTypeAndArea(results, '地番マスター（市区町村）', area);
    const chibanPosDataRef = findResultByTypeAndArea(results, '地番マスター位置参照拡張（市区町村）', area);
    if (!chibanDataRef) {
      console.error(`Insufficient data found for ${searchQuery} (地番マスター)`)
      continue;
    }

    // const mainStream = getAndStreamCSVDataForId<ChibanData>(chibanDataRef.name);
    // const posStream = getAndStreamCSVDataForId<ChibanPosData>(chibanPosDataRef.name);
    const [
      mainStream,
      posStream,
    ] = await Promise.all([
      getAndParseCSVDataForId<ChibanData>(chibanDataRef.name),
      chibanPosDataRef ? getAndParseCSVDataForId<ChibanPosData>(chibanPosDataRef.name) : [], // 位置参照拡張データが無い場合もある
    ]);
    const rawData = mergeChibanData(mainStream, posStream);

    // console.log(`処理: ${ma.pref} ${ma.county}${ma.city} ${ma.ward} の地番データを処理中...`);

    let lastOutDir: string | undefined = undefined;
    let apiData: ChibanApi = [];
    for await (const raw of rawData) {
      const parts = pathParts(machiAzaDataByCode, raw);
      if (typeof parts === 'undefined') {
        continue;
      }
      const myOutDir = path.join(...parts);
      if (lastOutDir !== myOutDir && lastOutDir !== undefined) {
        outputChibanData(outDir, lastOutDir, apiData);
        apiData = [];
      }
      if (lastOutDir !== myOutDir) {
        lastOutDir = myOutDir;
      }
      apiData.push({
        prc_num1: raw.prc_num1,
        prc_num2: raw.prc_num2 !== '' ? raw.prc_num2 : undefined,
        prc_num3: raw.prc_num3 !== '' ? raw.prc_num3 : undefined,
        point: 'rep_srid' in raw ? projectABRData(raw) : undefined,
      });
    }
    if (lastOutDir) {
      outputChibanData(outDir, lastOutDir, apiData);
    }
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
