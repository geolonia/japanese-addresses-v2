import assert from 'node:assert';
import test from 'node:test';

import fs from 'node:fs/promises';

import mainPrefCity from './01_make_prefecture_city.js';
import mainMachiAza from './02_make_machi_aza.js';
import mainRsdt from './03_make_rsdt.js';

import main from './11_fix_rsdt_flags.js';
import { getRangesFromCSV } from './10_refresh_csv_ranges.js';
import { machiAzaName, MachiAzaApi } from '../data.js';
import { setupFixtureCache } from '../test_helpers/fixture_cache.js';

await test.describe('with filter for 132276 (東京都羽村市)', async () => {
  test.before(() => {
    setupFixtureCache('processes_11_fix_rsdt_flags');
    process.env.SETTINGS_JSON = JSON.stringify({ lgCodes: ['132276'] });
  });

  test.after(() => {
    delete process.env.SETTINGS_JSON;
  });

  await test('it corrects the rsdt flag for 神明台一丁目 based on actual -住居表示.txt data', async () => {
    const outDir = './out/api_hamura';
    await fs.rm(outDir, { recursive: true, force: true });
    await mainPrefCity(['', '', outDir]);
    await mainMachiAza(['', '', outDir]);
    await mainRsdt(['', '', outDir]);

    const jsonPath = `${outDir}/ja/東京都/羽村市.json`;

    const beforeApi = JSON.parse(await fs.readFile(jsonPath, 'utf-8')) as MachiAzaApi;
    const beforeShimmeidai1 = beforeApi.data.find((ma) => ma.machiaza_id === '0004001');
    assert(beforeShimmeidai1, '神明台一丁目 (0004001) がフィクスチャに存在しない');
    assert.strictEqual(beforeShimmeidai1.rsdt, true, '補正前は誤って rsdt: true になっているはず');

    const rsdtHeader = await getRangesFromCSV(`${outDir}/ja/東京都/羽村市-住居表示.txt`);
    assert(rsdtHeader, '-住居表示.txt のヘッダーが読めない');
    const otherTownHeader = rsdtHeader.find((h) => !h.name.startsWith('神明台'));
    assert(otherTownHeader, '神明台以外で住居表示データを持つ町字が見つからない');

    await main(['', '', outDir]);

    const afterApi = JSON.parse(await fs.readFile(jsonPath, 'utf-8')) as MachiAzaApi;
    const afterShimmeidai1 = afterApi.data.find((ma) => ma.machiaza_id === '0004001');
    assert(afterShimmeidai1);
    assert.strictEqual(afterShimmeidai1.rsdt, undefined, '補正後は rsdt: undefined に修正されているはず');

    const afterOtherTown = afterApi.data.find((ma) => machiAzaName(ma) === otherTownHeader.name);
    assert(afterOtherTown);
    assert.strictEqual(afterOtherTown.rsdt, true, '実データがある町字の rsdt: true は維持されるはず(回帰防止)');
  });
});
