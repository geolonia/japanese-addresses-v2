import { kanji2number, number2kanji } from '@geolonia/japanese-numeral'
import { SingleMachiAza } from "../data.js";
import { MachiAzaData, MachiAzaPosData } from "../lib/abr_data/machi_aza.js";
import { projectABRData } from "../lib/proj.js";

export function rawToMachiAza(raw: MachiAzaData | (MachiAzaData & MachiAzaPosData)): SingleMachiAza {
  let kanjiChome = undefined;
  if (raw.chome !== '') {
    const numberChomePattern = /([０-９0-9]+)(丁目?)/;
    const matches = raw.chome.match(numberChomePattern);
    if (!matches) {
      kanjiChome = raw.chome;
    } else if (matches.length === 3) {
      const number = kanji2number(matches[1]);
      kanjiChome = number2kanji(number) + matches[2];
    }
  }
  return {
    machiaza_id: raw.machiaza_id,

    oaza_cho: raw.oaza_cho === '' ? undefined : raw.oaza_cho,
    oaza_cho_k: raw.oaza_cho_kana === '' ? undefined : raw.oaza_cho_kana,
    oaza_cho_r: raw.oaza_cho_roma === '' ? undefined : raw.oaza_cho_roma,

    chome: kanjiChome,
    chome_n: raw.chome_number === '' ? undefined : parseInt(raw.chome_number, 10),

    koaza: raw.koaza === '' ? undefined : raw.koaza,
    koaza_k: raw.koaza_kana === '' ? undefined : raw.koaza_kana,
    koaza_r: raw.koaza_roma === '' ? undefined : raw.koaza_roma,

    rsdt: raw.rsdt_addr_flg === '1' ? true : undefined,
    point: 'rep_srid' in raw ? projectABRData(raw) : undefined,
  };
}
