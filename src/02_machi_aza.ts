import { SingleMachiAza } from "./data.js";
import { MachiAzaData, MachiAzaPosData } from "./lib/ckan_data/machi_aza.js";
import { projectABRData } from "./lib/proj.js";

export function rawToMachiAza(raw: MachiAzaData | (MachiAzaData & MachiAzaPosData)): SingleMachiAza {
  return {
    machiaza_id: raw.machiaza_id,

    oaza_cho: raw.oaza_cho === '' ? undefined : raw.oaza_cho,
    oaza_cho_k: raw.oaza_cho_kana === '' ? undefined : raw.oaza_cho_kana,
    oaza_cho_r: raw.oaza_cho_roma === '' ? undefined : raw.oaza_cho_roma,

    chome: raw.chome === '' ? undefined : raw.chome,
    chome_n: raw.chome_number === '' ? undefined : parseInt(raw.chome_number, 10),

    koaza: raw.koaza === '' ? undefined : raw.koaza,
    koaza_k: raw.koaza_kana === '' ? undefined : raw.koaza_kana,
    koaza_r: raw.koaza_roma === '' ? undefined : raw.koaza_roma,

    rsdt: raw.rsdt_addr_flg === '1' ? true : undefined,
    point: 'rep_srid' in raw ? projectABRData(raw) : undefined,
  };
}
