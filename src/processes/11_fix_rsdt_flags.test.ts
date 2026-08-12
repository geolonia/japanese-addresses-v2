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

  await test('it leaves an already-correct rsdt flag untouched and preserves real-data towns (神明台一丁目 / 双葉町一丁目)', async () => {
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
    // 神明台一丁目は町字マスター(main)側の rsdt_addr_flg=0 に対し、位置参照拡張
    // (pos)側は rsdt_addr_flg=1 で食い違っている。かつては mergeDataLeftJoin の
    // json_patch(main, pos) がpos側の値でmain側を無条件上書きしていたため、
    // 02_make_machi_aza の時点で誤って rsdt: true になり、11_fix_rsdt_flags が
    // それを実データ(-住居表示.txt)の有無から事後補正していた。
    // 02_make_machi_aza.ts 側の修正(posStreamからrsdt_addr_flgを除去してから
    // JOINする)により、この上書きは発生しなくなり、02の出力時点で既に
    // 正しい rsdt: undefined になる。そのため11_fix_rsdt_flagsによる補正は
    // 発生しない(このフィクスチャ内には他にPOS上書きに依存しない
    // to_true/to_false の実例は存在しない。純粋な補正ロジック自体の
    // to_true/to_false 挙動は 11_rsdt_flags.test.ts の単体テストで別途検証済み)。
    assert.strictEqual(beforeShimmeidai1.rsdt, undefined, '02_make_machi_aza の修正により、補正前から既に rsdt: undefined(正しい状態)のはず');

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
    assert.strictEqual(afterShimmeidai1.rsdt, undefined, '既に正しい rsdt: undefined のまま、11_fix_rsdt_flags実行後も変化しないはず(誤ってtrue化されない)');

    const afterFutabacho1 = afterApi.data.find((ma) => ma.machiaza_id === '0002001');
    assert(afterFutabacho1);
    assert.strictEqual(afterFutabacho1.rsdt, true, '実データがある町字の rsdt: true は維持されるはず(回帰防止)');
    assert(afterFutabacho1.csv_ranges?.['住居表示'], 'step 11 の書き戻し後も csv_ranges (step 10 の出力) が失われていないはず');
  });
});
