#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import { getAndParseCSVDataForId } from './lib/ckan.js';
import { mergePrefectureData, PrefData, PrefPosData } from './lib/ckan_data/prefecture.js';
import { PrefectureApi } from './data.js';
import { projectABRData } from './lib/proj.js';

async function main(argv: string[]) {
  const outDir = argv[2] || path.join(import.meta.dirname, '..', 'out', 'api');
  fs.mkdirSync(outDir, { recursive: true });

  const [
    main,
    pos,
  ] = await Promise.all([
    getAndParseCSVDataForId<PrefData>('ba-o1-000000_g2-000001'), // 都道府県
    getAndParseCSVDataForId<PrefPosData>('ba-o1-000000_g2-000012'), // 位置参照拡張
  ]);
  const rawData = mergePrefectureData(main, pos);

  const apiData: PrefectureApi = [];
  for (const raw of rawData) {
    apiData.push({
      code: parseInt(raw.lg_code),
      pref: raw.pref,
      point: projectABRData(raw),
    });
  }

  const outFile = path.join(outDir, 'ja.json');
  fs.writeFileSync(outFile, JSON.stringify(apiData, null, 2));
}

main(process.argv)
  .then(() => {
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
