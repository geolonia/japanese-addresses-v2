import fs from 'node:fs';
import path from 'node:path';

import { cityName, MachiAzaApi, machiAzaName, PrefectureApi, prefectureName, SingleCity, SinglePrefecture } from '../data.js';
import { getRangesFromCSV } from './10_refresh_csv_ranges.js';
import { correctRsdtFlagWithAmbiguity, countMachiAzaNames } from './11_rsdt_flags.js';

async function main(argv: string[]) {
  const apiDir = argv[2] || path.join(import.meta.dirname, '..', '..', 'out', 'api');
  const jaFile = path.join(apiDir, 'ja.json');
  const api = JSON.parse(fs.readFileSync(jaFile, 'utf-8')) as PrefectureApi;

  const flatCities: [SinglePrefecture, SingleCity][] = [];
  for (const pref of api.data) {
    for (const city of pref.cities) {
      flatCities.push([pref, city]);
    }
  }

  let totalToTrue = 0;
  let totalToFalse = 0;

  for (const [pref, city] of flatCities) {
    const prefName = prefectureName(pref);
    const cName = cityName(city);
    const cityPrefix = path.join(apiDir, 'ja', prefName, cName);

    const rsdtHeader = await getRangesFromCSV(`${cityPrefix}-住居表示.txt`);
    const rsdtNames = new Set((rsdtHeader || []).map((h) => h.name));

    let maData: MachiAzaApi;
    try {
      maData = JSON.parse(await fs.promises.readFile(`${cityPrefix}.json`, 'utf8')) as MachiAzaApi;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        continue;
      }
      throw e;
    }

    const nameCounts = countMachiAzaNames(maData.data.map((ma) => machiAzaName(ma)));

    let toTrue = 0;
    let toFalse = 0;
    for (const ma of maData.data) {
      const name = machiAzaName(ma);
      const hasRsdtData = rsdtNames.has(name);
      const isAmbiguousName = (nameCounts.get(name) || 0) > 1;
      const result = correctRsdtFlagWithAmbiguity(hasRsdtData, ma.rsdt, isAmbiguousName);
      if (result.correction === 'to_true') {
        toTrue++;
      } else if (result.correction === 'to_false') {
        toFalse++;
      }
      ma.rsdt = result.rsdt;
    }

    if (toTrue > 0 || toFalse > 0) {
      await fs.promises.writeFile(`${cityPrefix}.json`, JSON.stringify(maData));
    }

    console.log(`${prefName.padEnd(4, '　')} ${cName.padEnd(10, '　')}: true化 ${toTrue} 件 / false化 ${toFalse} 件`);

    totalToTrue += toTrue;
    totalToFalse += toFalse;
  }

  console.log(`全国: true化 ${totalToTrue} 件 / false化 ${totalToFalse} 件`);
}

export default main;
