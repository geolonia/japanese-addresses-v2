#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import cliProgress from 'cli-progress';

import { getHubItemsByQuery, findResultByTypeAndArea, getAndParseCSVDataForId, getAndStreamCSVDataForId, mayBeTruncated } from '../lib/hub.js';
import { machiAzaName, SingleChiban, SingleMachiAza } from '../data.js';
import { projectABRData } from '../lib/proj.js';
import { MachiAzaData } from '../lib/abr_data/machi_aza.js';
import { rawToMachiAza } from './02_machi_aza.js';
import { ChibanData, ChibanPosData } from '../lib/abr_data/chiban.js';
import { mergeDataLeftJoin } from '../lib/abr_data/index.js';

const HEADER_CHUNK_SIZE = 50_000;
const CONCURRENCY = parseInt(process.env.CHIBAN_CONCURRENCY ?? '4', 10);

type ChibanApi = {
  machiAza: SingleMachiAza;
  chibans: SingleChiban[];
}[];

type HeaderRow = {
  name: string;
  offset: number;
  length: number;
}

function serializeApiDataTxt(apiData: ChibanApi): { headerIterations: number, headerData: HeaderRow[], data: Buffer } {
  const outSections: Buffer[] = [];
  for ( const { machiAza, chibans } of apiData ) {
    const lines: string[] = [
      `地番,${machiAzaName(machiAza)}`,
      `prc_num1,prc_num2,prc_num3,lng,lat`,
    ];
    for (const chiban of chibans) {
      lines.push(`${chiban.prc_num1},${chiban.prc_num2 || ''},${chiban.prc_num3 || ''},${chiban.point?.[0] || ''},${chiban.point?.[1] || ''}`);
    }
    outSections.push(Buffer.from(lines.join('\n') + '\n', 'utf8'));
  }

  const createHeader = (iterations = 1): { iterations: number, data: HeaderRow[], buffer: Buffer } => {
    let header = '';
    const headerMaxSize = HEADER_CHUNK_SIZE * iterations;
    let lastBytePos = headerMaxSize;
    const headerData: HeaderRow[] = [];
    for (const [index, section] of outSections.entries()) {
      const ma = apiData[index].machiAza;

      header += `${machiAzaName(ma)},${lastBytePos},${section.length}\n`;
      headerData.push({
        name: machiAzaName(ma),
        offset: lastBytePos,
        length: section.length,
      });

      lastBytePos += section.length;
    }
    const headerBuf = Buffer.from(header + '=END=\n', 'utf8');
    if (headerBuf.length > headerMaxSize) {
      return createHeader(iterations + 1);
    } else {
      const padding = Buffer.alloc(headerMaxSize - headerBuf.length);
      padding.fill(0x20);
      return {
        iterations,
        data: headerData,
        buffer: Buffer.concat([headerBuf, padding])
      };
    }
  };

  const header = createHeader();
  return {
    headerIterations: header.iterations,
    headerData: header.data,
    data: Buffer.concat([header.buffer, ...outSections]),
  };
}

async function outputChibanData(outDir: string, outFilename: string, apiData: ChibanApi) {
  if (apiData.length === 0) {
    return;
  }

  const outFileTXT = path.join(outDir, 'ja', outFilename + '-地番.txt');
  const txt = serializeApiDataTxt(apiData);
  await fs.promises.mkdir(path.dirname(outFileTXT), { recursive: true });
  await fs.promises.writeFile(outFileTXT, txt.data);

  console.log(`${outFilename}: ${apiData.length.toString(10).padEnd(4, ' ')} 件の町字の地番を出力した`);
}

async function processCity(
  ma: MachiAzaData,
  machiAzaDataByCode: Map<string, MachiAzaData>,
  outDir: string,
): Promise<void> {
  let area = `${ma.pref} ${ma.county}${ma.city}`;
  if (ma.ward !== '') {
    area += ma.ward;
  }
  const searchQuery = `${area} 地番マスター`;
  const results = await getHubItemsByQuery(searchQuery, '市区町村レベル', ma.pref);
  const chibanDataRef = findResultByTypeAndArea(results.features, '地番マスター', area);
  const chibanPosDataRef = findResultByTypeAndArea(results.features, '地番マスター位置参照拡張', area);
  // 検索結果が切り捨てられている場合、データセットは存在するのに枠外へ落ちている
  // 可能性がある。「見つからない」というログだけでは「元々存在しない」と読めてしまい
  // データ欠落に気づけないため、地番マスター・位置参照拡張のどちらが欠けた場合も明示する。
  // 文言は hub.ts の warnIfTruncated と揃える。片方だけ言い回しが違うと、
  // ログを grep したときに同じ事象の片側しか見つからない。
  const truncationNote = mayBeTruncated(results)
    ? `HUB API の検索結果を全件取得できませんでした `
      + `(numberMatched: ${results.numberMatched ?? '不明'}, numberReturned: ${results.numberReturned})。`
      + `データセットが存在するのに取得できていない可能性があります。`
    : undefined;

  if (!chibanDataRef) {
    // 地番マスター自体が無いとこの市区町村は丸ごと出力されない
    console.error(
      `Insufficient data found for ${searchQuery} (地番マスター)`
      + (truncationNote ? `。${truncationNote}` : '')
    );
    return;
  }

  if (!chibanPosDataRef) {
    if (truncationNote) {
      console.error(
        `「${area} 地番マスター位置参照拡張」が検索結果に見つかりませんでした。${truncationNote}`
      );
    } else {
      // 位置参照拡張が配信されていない市区町村もあるため、座標なしで続行する
      console.warn(`「${area} 地番マスター位置参照拡張」は配信されていないため、座標なしで出力します`);
    }
  }

  const mainStream = getAndStreamCSVDataForId<ChibanData>(chibanDataRef.properties.id);
  const posStream = chibanPosDataRef ?
    getAndStreamCSVDataForId<ChibanPosData>(chibanPosDataRef.properties.id)
    :
    // 位置参照拡張データが無い場合もある
    (async function*() {})();

  const rawData = mergeDataLeftJoin(mainStream, posStream, ['lg_code', 'machiaza_id', 'prc_id'], true);

  let currentMachiAza: MachiAzaData | undefined = undefined;
  const apiData: ChibanApi = [];
  let currentChibanList: SingleChiban[] = [];
  for await (const raw of rawData) {
    const maEntry = machiAzaDataByCode.get(`${raw.lg_code}|${raw.machiaza_id}`);
    if (!maEntry) {
      continue;
    }
    if (currentMachiAza && (currentMachiAza.machiaza_id !== maEntry.machiaza_id || currentMachiAza.lg_code !== maEntry.lg_code)) {
      apiData.push({
        machiAza: rawToMachiAza(currentMachiAza),
        chibans: currentChibanList,
      });
      currentChibanList = [];
      currentMachiAza = maEntry;
    }
    if (!currentMachiAza) {
      currentMachiAza = maEntry;
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
      machiAza: rawToMachiAza(currentMachiAza),
      chibans: currentChibanList,
    });
  }
  await outputChibanData(outDir, path.join(
    ma.pref,
    `${ma.county}${ma.city}${ma.ward}`,
  ), apiData);
}

async function main(argv: string[]) {
  const outDir = argv[2] || path.join(import.meta.dirname, '..', '..', 'out', 'api');
  fs.mkdirSync(outDir, { recursive: true });

  console.log('事前準備: 町字データを取得中...');
  const machiAzaResults = await getHubItemsByQuery('町字マスター', '全国レベル');
  const machiAzaResult = findResultByTypeAndArea(machiAzaResults.features, '町字マスター', '全国');
  if (!machiAzaResult) {
    throw new Error(`「全国 町字マスター」データセットが見つかりませんでした`);
  }
  const machiAzaData = await getAndParseCSVDataForId<MachiAzaData>(machiAzaResult.properties.id); // 市区町村 & 町字
  const machiAzaDataByCode = new Map(machiAzaData.map((ma) => [
    `${ma.lg_code}|${ma.machiaza_id}`,
    ma
  ]));

  // One representative entry per lg_code, in encounter order.
  const seenLgCodes = new Set<string>();
  const machiAzas: MachiAzaData[] = [];
  for (const ma of machiAzaData) {
    if (seenLgCodes.has(ma.lg_code)) continue;
    seenLgCodes.add(ma.lg_code);
    machiAzas.push(ma);
  }
  console.log('事前準備: 町字データを取得しました');

  const progress = new cliProgress.SingleBar({
    format: ' {bar} {percentage}% | ETA: {eta_formatted} | {value}/{total}',
    barCompleteChar: '█',
    barIncompleteChar: '░',
    etaBuffer: 30,
    fps: 2,
    // No-TTY output is required for CI/CD environments
    noTTYOutput: true,
  });
  progress.start(machiAzas.length, 0);
  try {
    const executing = new Set<Promise<void>>();
    for (const ma of machiAzas) {
      const p: Promise<void> = processCity(ma, machiAzaDataByCode, outDir)
        .finally(() => {
          executing.delete(p);
          progress.increment();
        });
      executing.add(p);
      if (executing.size >= CONCURRENCY) {
        await Promise.race(executing);
      }
    }
    await Promise.all(executing);
  } finally {
    progress.stop();
  }
}

export default main;
