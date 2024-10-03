import { parse as csvParse } from 'csv-parse';
import iconv from 'iconv-lite';

import { unzipAndExtractZipFile } from './zip_tools.js';
import { getDownloadStream } from './fetch_tools.js';

export type NlftpMlitDataRow = {
  machiaza_id: string

  pref_name: string
  city_name: string

  oaza_cho: string
  chome?: string
  point: [number, number]
}

// type NlftpMlitCsvRow = {
//  0 "都道府県コード": string
//  1 "都道府県名": string
//  2 "市区町村コード": string
//  3 "市区町村名": string
//  4 "大字町丁目コード": string
//  5 "大字町丁目名": string
//  6 "緯度": string
//  7 "経度": string
//  8 "原典資料コード": string
//  9 "大字・字・丁目区分コード": string
// }

function parseRows(rows: string[][]): NlftpMlitDataRow[] {
  // remove header row
  rows.shift();
  // sort by code (should already be sorted, just in case)
  rows.sort((a, b) => {
    return a[4].localeCompare(b[4]);
  });

  const result: NlftpMlitDataRow[] = [];
  for (const row of rows) {
    let oaza_cho = row[5];
    let chome: string | undefined = undefined;
    const chomeMatch = oaza_cho.match(/^(.*?)([一二三四五六七八九十]+丁目)$/);
    if (chomeMatch) {
      oaza_cho = chomeMatch[1];
      chome = chomeMatch[2];
    }

    result.push({
      machiaza_id: `MLIT:${row[4]}`,
      pref_name: row[1],
      city_name: row[3],
      oaza_cho,
      chome,
      point: [
        parseFloat(row[7]), // longitude
        parseFloat(row[6]), // latitude
      ],
    });
  }

  return result;
}

/**
 * 国土数値情報からデータをダウンロードしパースします。
 * 参照: https://nlftp.mlit.go.jp/isj/
 */
export async function downloadAndExtractNlftpMlitFile(prefCode: string): Promise<NlftpMlitDataRow[]> {
  const version = '17.0b'; // 大字・町丁目レベル位置参照情報
  // 22.0a は街区レベル位置参照情報なので、ここには必要ない
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
