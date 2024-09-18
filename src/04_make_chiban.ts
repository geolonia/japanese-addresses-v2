#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import cliProgress from 'cli-progress';

import { ckanPackageSearch, findResultByTypeAndArea, getAndParseCSVDataForId, getAndStreamCSVDataForId } from './lib/ckan.js';
import { ChibanApi, machiAzaName, SingleChiban } from './data.js';
import { projectABRData } from './lib/proj.js';
import { MachiAzaData } from './lib/ckan_data/machi_aza.js';
import { ChibanData, ChibanPosData } from './lib/ckan_data/chiban.js';
import { mergeDataLeftJoin } from './lib/ckan_data/index.js';

const HEADER_CHUNK_SIZE = 50_000;

function serializeApiDataTxt(apiData: ChibanApi): Buffer {
  let outSections: Buffer[] = [];
  for ( const { machiAza, chibans } of apiData ) {
    let outSection = `地番,${machiAzaName(machiAza)}\n` +
                     `prc_num1,prc_num2,prc_num3,lng,lat\n`;
    for (const chiban of chibans) {
      outSection += `${chiban.prc_num1},${chiban.prc_num2 || ''},${chiban.prc_num3 || ''},${chiban.point?.[0] || ''},${chiban.point?.[1] || ''}\n`;
    }
    outSections.push(Buffer.from(outSection, 'utf8'));
  }

  const createHeader = (iterations = 1) => {
    let header = '';
    const headerMaxSize = HEADER_CHUNK_SIZE * iterations;
    let lastBytePos = headerMaxSize;
    for (const [index, section] of outSections.entries()) {
      const ma = apiData[index].machiAza;

      header += `${machiAzaName(ma)},${lastBytePos},${section.length}\n`;
      lastBytePos += section.length;
    }
    const headerBuf = Buffer.from(header + '=END=\n', 'utf8');
    if (headerBuf.length > headerMaxSize) {
      return createHeader(iterations + 1);
    } else {
      const padding = Buffer.alloc(headerMaxSize - headerBuf.length);
      padding.fill(0x20);
      return Buffer.concat([headerBuf, padding]);
    }
  };

  const header = createHeader();
  return Buffer.concat([header, ...outSections]);
}

async function outputChibanData(outDir: string, outFilename: string, apiData: ChibanApi) {
  if (apiData.length === 0) {
    return;
  }
  const outFile = path.join(outDir, 'ja', outFilename + '.json');
  await fs.promises.mkdir(path.dirname(outFile), { recursive: true });
  // await fs.promises.writeFile(outFile, JSON.stringify(apiData, null, 2));

  const outFileTXT = path.join(outDir, 'ja', outFilename + '.txt');
  await fs.promises.writeFile(outFileTXT, serializeApiDataTxt(apiData));

  console.log(`${outFilename}: ${apiData.length.toString(10).padEnd(4, ' ')} 件の町字の地番を出力した`);
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
  const machiAzas: MachiAzaData[] = [];
  for (const ma of machiAzaData) {
    if (machiAzas.findIndex((c) => c.lg_code === ma.lg_code) > 0) {
      continue;
    }
    machiAzas.push(ma);
  }
  console.log('事前準備: 町字データを取得しました');

  const progressInst = new cliProgress.MultiBar({
    format: ' {bar} {percentage}% | ETA: {eta_formatted} | {value}/{total}',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    etaBuffer: 30,
    fps: 2,
    // No-TTY output is required for CI/CD environments
    noTTYOutput: true,
  });
  const progress = progressInst.create(machiAzas.length, 0);

  let currentLgCode: string | undefined = undefined;
  for (const ma of machiAzas) {
    if (currentLgCode && ma.lg_code === currentLgCode) {
      // we have already processed this lg_code, so we can skip it
      continue;
    } else if (currentLgCode !== ma.lg_code) {
      currentLgCode = ma.lg_code;
    }
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

    const mainStream = getAndStreamCSVDataForId<ChibanData>(chibanDataRef.name);
    const posStream = chibanPosDataRef ?
      getAndStreamCSVDataForId<ChibanPosData>(chibanPosDataRef.name)
      :
      // 位置参照拡張データが無い場合もある
      (async function*() {})();

    const rawData = mergeDataLeftJoin(mainStream, posStream, ['lg_code', 'machiaza_id', 'prc_id'], true);
    // console.log(`処理: ${ma.pref} ${ma.county}${ma.city} ${ma.ward} の地番データを処理中...`);

    let currentMachiAza: MachiAzaData | undefined = undefined;
    const apiData: ChibanApi = [];
    let currentChibanList: SingleChiban[] = [];
    for await (const raw of rawData) {
      let ma = machiAzaDataByCode.get(`${raw.lg_code}|${raw.machiaza_id}`);
      if (!ma) {
        continue;
      }
      if (currentMachiAza && (currentMachiAza.machiaza_id !== ma.machiaza_id || currentMachiAza.lg_code !== ma.lg_code)) {
        apiData.push({
          machiAza: currentMachiAza,
          chibans: currentChibanList,
        });
        currentChibanList = [];
        currentMachiAza = ma;
      }
      if (!currentMachiAza) {
        currentMachiAza = ma;
      }

      currentChibanList.push({
        prc_num1: raw.prc_num1,
        prc_num2: raw.prc_num2 !== '' ? raw.prc_num2 : undefined,
        prc_num3: raw.prc_num3 !== '' ? raw.prc_num3 : undefined,
        point: 'rep_srid' in raw ? projectABRData(raw) : undefined,
      });
    }
    if (currentMachiAza && currentChibanList.length > 0) {
      apiData.push({
        machiAza: currentMachiAza,
        chibans: currentChibanList,
      });
    }
    await outputChibanData(outDir, path.join(
      ma.pref,
      `${ma.county}${ma.city}${ma.ward}-地番`,
    ), apiData);
    progress.increment();
  }
  progress.stop();
}

main(process.argv)
  .then(() => {
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
