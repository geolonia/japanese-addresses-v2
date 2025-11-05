import fs from 'node:fs';
import path from 'node:path';
import { getHubItemsByQuery, combineCSVParserIterators, CSVParserIterator, findResultByTypeAndArea, getAndParseCSVDataForId, getAndStreamCSVDataForId } from '../lib/hub.js';
import { mergeRsdtdspRsdtData, RsdtdspRsdtData, RsdtdspRsdtPosData } from '../lib/abr_data/rsdtdsp_rsdt.js';
import { machiAzaName, RsdtApi, SingleRsdt } from '../data.js';
import { projectABRData } from '../lib/proj.js';
import { MachiAzaData } from '../lib/abr_data/machi_aza.js';
import { rawToMachiAza } from './02_machi_aza.js';
import { loadSettings } from '../lib/settings.js';
import { prefectureNameCodes } from '../lib/prefecture_name_codes.js';

const HEADER_CHUNK_SIZE = 50_000;
// const HEADER_PBF_CHUNK_SIZE = 8_192;

function getOutPath(ma: MachiAzaData) {
  return path.join(
    ma.pref,
    `${ma.county}${ma.city}${ma.ward}`,
  );
}

type HeaderRow = {
  name: string;
  offset: number;
  length: number;
}

function serializeApiDataTxt(apiData: RsdtApi): { headerIterations: number, headerData: HeaderRow[], data: Buffer } {
  const outSections: Buffer[] = [];
  for ( const { machiAza, rsdts } of apiData ) {
    let outSection = `住居表示,${machiAzaName(machiAza)}\n` +
                     `blk_num,rsdt_num,rsdt_num2,lng,lat\n`;
    for (const rsdt of rsdts) {
      outSection += `${rsdt.blk_num || ''},${rsdt.rsdt_num},${rsdt.rsdt_num2 || ''},${rsdt.point?.[0] || ''},${rsdt.point?.[1] || ''}\n`;
    }
    outSections.push(Buffer.from(outSection, 'utf8'));
  }

  const createHeader = (iterations = 1) => {
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

// function _stringIfNotInteger(value: string | undefined) {
//   if (!value) { return undefined; }
//   return /^\d+$/.test(value) ? undefined : value;
// }

// function serializeApiDataPbf(apiData: RsdtApi): Buffer {
//   let outSections: Buffer[] = [];
//   for ( const { machiAza, rsdts } of apiData ) {
//     const section: AddrData.Section = {
//       kind: AddrData.Kind.RSDT,
//       name: machiAzaName(machiAza),
//       rsdtRows: [],
//       chibanRows: [],
//     }
//     for (const rsdt of rsdts) {
//       section.rsdtRows.push({
//         blkNum: rsdt.blk_num ? parseInt(rsdt.blk_num, 10) : undefined,
//         rsdtNum: parseInt(rsdt.rsdt_num, 10),
//         rsdtNum2: rsdt.rsdt_num2 ? parseInt(rsdt.rsdt_num2, 10) : undefined,
//         point: rsdt.point ? { lng: rsdt.point[0], lat: rsdt.point[1] } : undefined,
//         blkNumStr: _stringIfNotInteger(rsdt.blk_num),
//         rsdtNumStr: _stringIfNotInteger(rsdt.rsdt_num),
//         rsdtNum2Str: _stringIfNotInteger(rsdt.rsdt_num2),
//       });
//     }
//     const sectionBuf = Buffer.from(AddrData.Section.encode(section).finish());
//     outSections.push(sectionBuf);
//   }

//   const createHeader = (iterations = 1) => {
//     const header: AddrData.Header = {
//       kind: AddrData.Kind.RSDT,
//       rows: [],
//     };
//     const headerMaxSize = HEADER_PBF_CHUNK_SIZE * iterations;
//     let lastBytePos = headerMaxSize;
//     for (const [index, section] of outSections.entries()) {
//       const ma = apiData[index].machiAza;

//       header.rows.push({
//         name: machiAzaName(ma),
//         offset: lastBytePos,
//         length: section.length,
//       });
//       lastBytePos += section.length;
//     }
//     const headerBuf = Buffer.from(AddrData.Header.encode(header).finish());
//     if (headerBuf.length > headerMaxSize) {
//       return createHeader(iterations + 1);
//     } else {
//       const padding = Buffer.alloc(headerMaxSize - headerBuf.length);
//       padding.fill(0x00);
//       return Buffer.concat([headerBuf, padding]);
//     }
//   };

//   const header = createHeader();
//   return Buffer.concat([header, ...outSections]);
// }

async function outputRsdtData(outDir: string, outFilename: string, apiData: RsdtApi) {
  // const machiAzaJSON = path.join(outDir, 'ja', outFilename + '.json');
  // fs.mkdirSync(path.dirname(machiAzaJSON), { recursive: true });
  // fs.writeFileSync(outFileJSON, JSON.stringify(apiData));

  const outFileTXT = path.join(outDir, 'ja', outFilename + '-住居表示.txt');
  const txt = serializeApiDataTxt(apiData);
  await fs.promises.mkdir(path.dirname(outFileTXT), { recursive: true });
  await fs.promises.writeFile(outFileTXT, txt.data);

  // const outFilePbf = path.join(outDir, 'ja', outFilename + '.pbf');
  // fs.writeFileSync(outFilePbf, serializeApiDataPbf(apiData));

  console.log(`${outFilename}-住居表示: ${apiData.length.toString(10).padEnd(4, ' ')} 件の町字の住居表示を出力した`);
}

async function main(argv: string[]) {
  const outDir = argv[2] || path.join(import.meta.dirname, '..', '..', 'out', 'api');
  fs.mkdirSync(outDir, { recursive: true });

  const machiAzaResults = await getHubItemsByQuery('町字マスター', '全国レベル');
  const machiAzaResult = findResultByTypeAndArea(machiAzaResults.features, '町字マスター', '全国');
  if (!machiAzaResult) {
    throw new Error(`「全国 町字マスター」データセットが見つかりませんでした`);
  }
  const machiAzaData = await getAndParseCSVDataForId<MachiAzaData>(machiAzaResult.properties.id); // 市区町村 & 町字
  const machiAzaDataByCode = new Map(machiAzaData.map((city) => [
    `${city.lg_code}|${city.machiaza_id}`,
    city
  ]));

  const hasFilter = (await loadSettings()).lgCodes.length > 0;

  // machiAzaData が既にフィルターされているので、そこからユニークな都道府県のみ抽出し、そのストリームのみ読み込むようにする
  const prefs = hasFilter ? new Set(machiAzaData.map((ma) => ma.pref)) : new Set(Object.keys(prefectureNameCodes));

  const mainStreams: CSVParserIterator<RsdtdspRsdtData>[] = [];
  const posStreams: CSVParserIterator<RsdtdspRsdtPosData>[] = [];
  for (const pref of prefs) {
    const mainResults = await getHubItemsByQuery('住居表示-住居マスター', '都道府県レベル', pref);
    const main = findResultByTypeAndArea(mainResults.features, '住居表示-住居マスター', pref);
    if (!main) {
      throw new Error(`「${pref} 住居表示-住居マスター」データセットが見つかりませんでした`);
    }
    mainStreams.push(getAndStreamCSVDataForId<RsdtdspRsdtData>(main.properties.id));

    const pos = findResultByTypeAndArea(mainResults.features, '住居表示-住居マスター位置参照拡張', pref);
    if (!pos) {
      throw new Error(`「${pref} 住居表示-住居マスター位置参照拡張」データセットが見つかりませんでした`);
    }
    posStreams.push(getAndStreamCSVDataForId<RsdtdspRsdtPosData>(pos.properties.id));
  }
  const mainStream: CSVParserIterator<RsdtdspRsdtData> = combineCSVParserIterators(...mainStreams);
  const posStream: CSVParserIterator<RsdtdspRsdtPosData> = combineCSVParserIterators(...posStreams);

  const rawData = mergeRsdtdspRsdtData(mainStream, posStream);

  let lastOutPath: string | undefined = undefined;

  let apiData: RsdtApi = [];
  let currentRsdtList: SingleRsdt[] = [];
  let currentMachiAza: MachiAzaData | undefined = undefined;
  for await (const raw of rawData) {
    const ma = machiAzaDataByCode.get(`${raw.lg_code}|${raw.machiaza_id}`);
    if (!ma) {
      continue;
    }
    const thisOutPath = getOutPath(ma);
    if (currentMachiAza && (currentMachiAza.machiaza_id !== ma.machiaza_id || currentMachiAza.lg_code !== ma.lg_code)) {
      if (currentRsdtList.length > 0) {
        apiData.push({
          machiAza: rawToMachiAza(currentMachiAza),
          rsdts: currentRsdtList,
        });
      }
      currentMachiAza = ma;
      currentRsdtList = [];
    }
    if (lastOutPath !== thisOutPath && lastOutPath !== undefined) {
      await outputRsdtData(outDir, lastOutPath, apiData);
      apiData = [];
    }
    if (lastOutPath !== thisOutPath) {
      lastOutPath = thisOutPath;
    }
    if (!currentMachiAza) {
      currentMachiAza = ma;
    }

    currentRsdtList.push({
      blk_num: raw.blk_num === '' ? undefined : raw.blk_num,
      rsdt_num: raw.rsdt_num,
      rsdt_num2: raw.rsdt_num2 === '' ? undefined : raw.rsdt_num2,
      point: 'rep_srid' in raw ? projectABRData(raw) : undefined,
    });
  }
  if (currentMachiAza && currentRsdtList.length > 0) {
    apiData.push({
      machiAza: rawToMachiAza(currentMachiAza),
      rsdts: currentRsdtList,
    });
  }
  if (lastOutPath) {
    await outputRsdtData(outDir, lastOutPath, apiData);
  }
}

export default main;
