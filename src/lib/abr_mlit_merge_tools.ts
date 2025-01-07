import { SingleMachiAza } from "../data.js";
import { NlftpMlitDataRow } from "./mlit_nlftp.js";

export function filterMlitDataByPrefCity(mlitData: NlftpMlitDataRow[], prefName: string, cityName: string): NlftpMlitDataRow[] {
  return mlitData.filter(row => row.pref_name === prefName && row.city_name === cityName);
}

export function createMergedApiData(abrData: SingleMachiAza[], mlitData: NlftpMlitDataRow[]): SingleMachiAza[] {
  const out = abrData;

  for (const row of mlitData) {
    // ABRデータに重複があるかのチェック
    if (abrData.find(a => (
      (a.oaza_cho === row.oaza_cho && a.chome === row.chome) || // 大字と丁目が一致する場合
      (a.koaza === row.oaza_cho) || // 小字が一致する場合
      ((a.oaza_cho || '') + (a.koaza || '') === row.oaza_cho) // 大字と小字を結合したものが一致する場合
    ))) {
      continue;
    }
    out.push({
      machiaza_id: row.machiaza_id,
      oaza_cho: row.oaza_cho,
      chome: row.chome,
      point: row.point,
    })
  }

  return out;
}
