import fs from 'node:fs';
import path from 'node:path';

import { getHubItemsByQuery, findResultByTypeAndArea, getAndStreamCSVDataForId } from '../lib/hub.js';
import { MachiAzaApi, SingleMachiAza } from '../data.js';
import { MachiAzaData, MachiAzaPosData } from '../lib/abr_data/machi_aza.js';
import { mergeDataLeftJoin } from '../lib/abr_data/index.js';
import { dedupeAdjacentByKey, mergeMachiAzaMainRow, mergeMachiAzaPosRow } from '../lib/abr_data/machi_aza_dedup.js';
import { rawToMachiAza } from './02_machi_aza.js';
import { downloadAndExtractNlftpMlitFile, NlftpMlitDataRow } from '../lib/mlit_nlftp.js';
import { createMergedApiData, filterMlitDataByPrefCity } from '../lib/abr_mlit_merge_tools.js';
import { prefectureNameCodes } from '../lib/prefecture_name_codes.js';
import { lgCodeMatch, loadSettings } from '../lib/settings.js';

// mergeDataLeftJoin は SQLite の json_patch(main, pos) で行を結合しており、
// 第2引数(pos)側のフィールドが第1引数(main)側の同名フィールドを無条件に
// 上書きする。MachiAzaData と MachiAzaPosData は両方とも rsdt_addr_flg を
// 持つため、このヘルパーを挟まないと pos 側の生の(main側と食い違うことが
// ある)フラグが、main 側で dedup 時に正しくOR結合済みのフラグを黙って
// 上書きしてしまう。そのため JOIN前に pos の全行から rsdt_addr_flg を除去し、
// main 側の値を常に優先させる(重複行に限らず全行に適用する)。
async function* omitPosRsdtFlg(
  source: AsyncIterableIterator<MachiAzaPosData>,
): AsyncIterableIterator<Omit<MachiAzaPosData, 'rsdt_addr_flg'>> {
  for await (const row of source) {
    const { rsdt_addr_flg, ...rest } = row;
    void rsdt_addr_flg;
    yield rest;
  }
}

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
  const outDir = argv[2] || path.join(import.meta.dirname, '..', '..', 'out', 'api');
  fs.mkdirSync(outDir, { recursive: true });

  let allCount = 0;
  const settings = await loadSettings();

  for (const prefName of Object.keys(prefectureNameCodes)) {
    const prefCode = prefectureNameCodes[prefName];
    // settings.lgCodes でフィルタが指定されている場合、該当しない都道府県の処理をスキップする
    if (!lgCodeMatch(settings, `${prefCode}000`)) {
      continue;
    }
    const machiAzaResults = await getHubItemsByQuery('町字マスター', '都道府県レベル', prefName);
    const machiAzaResult = findResultByTypeAndArea(machiAzaResults.features, '町字マスター', prefName);
    if (!machiAzaResult) {
      throw new Error(`「${prefName} 町字マスター」データセットが見つかりませんでした`);
    }
    const machiAzaPosResult = findResultByTypeAndArea(machiAzaResults.features, '町字マスター位置参照拡張', prefName);
    if (!machiAzaPosResult) {
      throw new Error(`「${prefName} 町字マスター位置参照拡張」データセットが見つかりませんでした`);
    }
    const mainStream = dedupeAdjacentByKey(
      getAndStreamCSVDataForId<MachiAzaData>(machiAzaResult.properties.id),
      ['lg_code', 'machiaza_id'],
      mergeMachiAzaMainRow,
      'main',
    );
    const posStream = dedupeAdjacentByKey(
      getAndStreamCSVDataForId<MachiAzaPosData>(machiAzaPosResult.properties.id),
      ['lg_code', 'machiaza_id'],
      mergeMachiAzaPosRow,
      'pos',
    );
    const rawData = mergeDataLeftJoin(mainStream, omitPosRsdtFlg(posStream), ['lg_code', 'machiaza_id']);

    let lastLGCode: string | undefined = undefined;
    let lastCityName: string | undefined = undefined;
    const mlitData: NlftpMlitDataRow[] = await downloadAndExtractNlftpMlitFile(prefectureNameCodes[prefName]);
    let apiData: SingleMachiAza[] = [];
    for await (const raw of rawData) {
      if (lastLGCode !== raw.lg_code && lastLGCode !== undefined) {
        const filteredMlit = filterMlitDataByPrefCity(mlitData, prefName, lastCityName!);
        apiData = createMergedApiData(apiData, filteredMlit);
        const api: MachiAzaApi = { meta: { updated }, data: apiData };
        allCount += await outputMachiAzaData(outDir, prefName, lastCityName!, api);
        apiData = [];
      }
      if (lastLGCode !== raw.lg_code) {
        lastLGCode = raw.lg_code;
        lastCityName = `${raw.county}${raw.city}${raw.ward}`;
      }
      apiData.push(rawToMachiAza(raw));
    }
    if (lastLGCode) {
      const filteredMlit = filterMlitDataByPrefCity(mlitData, prefName, lastCityName!);
      apiData = createMergedApiData(apiData, filteredMlit);
      const api: MachiAzaApi = { meta: { updated }, data: apiData };
      allCount += await outputMachiAzaData(outDir, prefName, lastCityName!, api);
    }
  }
  console.log(`全国: ${allCount} 件の町字を出力した`);
}

export default main;
