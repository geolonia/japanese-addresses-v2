import { parse as csvParse } from 'csv-parse';
import iconv from 'iconv-lite';
import * as turf from '@turf/turf';

import { unzipAndExtractZipFile } from './zip_tools.js';
import { getDownloadStream } from './fetch_tools.js';

// type NlftpMlitCsvRow = {
//   0 "都道府県名": string
//   1 "市区町村名": string
//   2 "大字・丁目名": string
//   3 "小字・通称名": string
//   4 "街区符号・地番": string
//   5 "座標系番号": string
//   6 "Ｘ座標": string
//   7 "Ｙ座標": string
//   8 "緯度": string
//   9 "経度": string
//  10 "住居表示フラグ": string
//  11 "代表フラグ": string
//  12 "更新前履歴フラグ": string
//  13 "更新後履歴フラグ": string
// }

function parseRows(rows: string[][]): NlftpMlitDataRow[] {
  const data: {
    [cityName: string]: {
      [oazaCho: string]: {
        points: [number, number][]
      }
    }
  } = {};

  let prefName: string | undefined = undefined;
  for (const row of rows) {
    // Skip header row
    if (row[0] === '都道府県名') continue;

    prefName ??= row[0];
    const cityName = row[1];
    const oazaCho = row[2];
    const lat = parseFloat(row[8]);
    const lon = parseFloat(row[9]);

    if (!data[cityName]) {
      data[cityName] = {};
    }
    if (!data[cityName][oazaCho]) {
      data[cityName][oazaCho] = {
        points: []
      };
    }

    data[cityName][oazaCho].points.push([lon, lat]);
  }

  const result: NlftpMlitDataRow[] = [];
  const sortedData = Object.entries(data);
  // Sort by city name
  sortedData.sort(([a], [b]) => a.localeCompare(b));
  for (const [cityName, oazaChos] of sortedData) {
    const sortedOazaChos = Object.entries(oazaChos);
    // Sort by oazaCho name
    sortedOazaChos.sort(([a], [b]) => a.localeCompare(b));
    for (const [oazaCho, { points }] of sortedOazaChos) {
      const features = turf.points(points);
      const centerPoint = turf.center(features).geometry.coordinates as [number, number];

      result.push({
        prefName: prefName!,
        cityName,
        oazaCho,
        centerPoint
      });
    }
  }
  return result;
}

type NlftpMlitDataRow = {
  prefName: string
  cityName: string
  oazaCho: string
  centerPoint: [number, number]
}

export async function downloadAndExtractNlftpMlitFile(prefCode: string, version: string): Promise<NlftpMlitDataRow[]> {
  const url = `https://nlftp.mlit.go.jp/isj/dls/data/${version}/${prefCode}000-${version}.zip`;
  const bodyStream = await getDownloadStream(url);
  const entries = unzipAndExtractZipFile(bodyStream);
  for await (const entry of entries) {
    if (entry.path.slice(-4) !== '.csv') continue;
    const rows = await Array.fromAsync<string[]>(
      entry
        .pipe(iconv.decodeStream('Shift_JIS'))
        .pipe(csvParse())
    );
    return parseRows(rows);
  }
  throw new Error('No CSV file detected in archive file');
}
