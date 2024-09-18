import { SingleMachiAza } from "./data.js";
import { MachiAzaData, MachiAzaPosData } from "./lib/ckan_data/machi_aza.js";
import { projectABRData } from "./lib/proj.js";

export function rawToMachiAza(raw: MachiAzaData | (MachiAzaData & MachiAzaPosData)): SingleMachiAza {
  return {
    machiaza_id: raw.machiaza_id,
    oaza_cho: raw.oaza_cho === '' ? undefined : raw.oaza_cho,
    chome: raw.chome === '' ? undefined : raw.chome,
    koaza: raw.koaza === '' ? undefined : raw.koaza,
    rsdt: raw.rsdt_addr_flg === '1' ? true : undefined,
    point: 'rep_srid' in raw ? projectABRData(raw) : undefined,
  };
}
