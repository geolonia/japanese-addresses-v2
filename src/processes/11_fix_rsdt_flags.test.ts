import assert from 'node:assert';
import test from 'node:test';

import fs from 'node:fs/promises';

import mainPrefCity from './01_make_prefecture_city.js';
import mainMachiAza from './02_make_machi_aza.js';
import mainRsdt from './03_make_rsdt.js';

import main from './11_fix_rsdt_flags.js';
import mainRefreshRanges, { getRangesFromCSV } from './10_refresh_csv_ranges.js';
import { MachiAzaApi } from '../data.js';
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
    // 10 (csv_ranges 付与) を先に実行しておき、11 がその後の JSON 書き戻しで
    // csv_ranges を失っていないことも合わせて検証する。
    await mainRefreshRanges(['', '', outDir]);

    const jsonPath = `${outDir}/ja/東京都/羽村市.json`;

    const beforeApi = JSON.parse(await fs.readFile(jsonPath, 'utf-8')) as MachiAzaApi;
    const beforeShimmeidai1 = beforeApi.data.find((ma) => ma.machiaza_id === '0004001');
    assert(beforeShimmeidai1, '神明台一丁目 (0004001) がフィクスチャに存在しない');
    assert.strictEqual(beforeShimmeidai1.rsdt, true, '補正前は誤って rsdt: true になっているはず');

    // 双葉町一丁目 (machiaza_id 0002001) は町字マスター・位置参照拡張の両方が
    // rsdt_addr_flg=1 で一致し、実際に -住居表示.txt にデータが存在する町字。
    // 名前ベースの動的検索(`machiAzaName(ma) === otherTownHeader.name`)は、
    // 同名の町字が市区町村内に複数存在するケースでは誤ったエントリに一致し
    // うるため、回帰防止アサーションは machiaza_id を直接指定して固定する。
    const beforeFutabacho1 = beforeApi.data.find((ma) => ma.machiaza_id === '0002001');
    assert(beforeFutabacho1, '双葉町一丁目 (0002001) がフィクスチャに存在しない');
    assert.strictEqual(beforeFutabacho1.rsdt, true, '実データを持つ町字は補正前から rsdt: true のはず');
    assert(beforeFutabacho1.csv_ranges?.['住居表示'], '10_refresh_csv_ranges 実行後は csv_ranges が付与されているはず');

    const rsdtHeader = await getRangesFromCSV(`${outDir}/ja/東京都/羽村市-住居表示.txt`);
    assert(rsdtHeader, '-住居表示.txt のヘッダーが読めない');
    const otherTownHeader = rsdtHeader.find((h) => !h.name.startsWith('神明台'));
    assert(otherTownHeader, '神明台以外で住居表示データを持つ町字が見つからない(フィクスチャのサニティチェック)');

    await main(['', '', outDir]);

    const afterApi = JSON.parse(await fs.readFile(jsonPath, 'utf-8')) as MachiAzaApi;
    const afterShimmeidai1 = afterApi.data.find((ma) => ma.machiaza_id === '0004001');
    assert(afterShimmeidai1);
    assert.strictEqual(afterShimmeidai1.rsdt, undefined, '補正後は rsdt: undefined に修正されているはず');

    const afterFutabacho1 = afterApi.data.find((ma) => ma.machiaza_id === '0002001');
    assert(afterFutabacho1);
    assert.strictEqual(afterFutabacho1.rsdt, true, '実データがある町字の rsdt: true は維持されるはず(回帰防止)');
    assert(afterFutabacho1.csv_ranges?.['住居表示'], 'step 11 の書き戻し後も csv_ranges (step 10 の出力) が失われていないはず');
  });
});
