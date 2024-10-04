import { SingleMachiAza } from "../data.js";
import { NlftpMlitDataRow } from "./mlit_nlftp.js";

export function filterMlitDataByPrefCity(mlitData: NlftpMlitDataRow[], prefName: string, cityName: string): NlftpMlitDataRow[] {
  return mlitData.filter(row => row.pref_name === prefName && row.city_name === cityName);
}

export function createMergedApiData(abrData: SingleMachiAza[], mlitData: NlftpMlitDataRow[]): SingleMachiAza[] {
  const out = abrData;

  for (const row of mlitData) {
    if (abrData.find(a => a.oaza_cho === row.oaza_cho && a.chome === row.chome)) {
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
