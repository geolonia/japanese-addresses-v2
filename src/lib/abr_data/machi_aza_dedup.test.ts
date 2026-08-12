import assert from 'node:assert';
import test, { describe } from 'node:test';

import {
  dedupeAdjacentByKey,
  mergeMachiAzaMainRow,
  mergeMachiAzaPosRow,
} from './machi_aza_dedup.js';
import { MachiAzaData, MachiAzaPosData } from './machi_aza.js';

function makeMainRow(overrides: Partial<MachiAzaData> = {}): MachiAzaData {
  return {
    lg_code: '011011',
    machiaza_id: '0074005',
    machiaza_type: '0',
    pref: '北海道',
    pref_kana: 'ホッカイドウ',
    pref_roma: 'HOKKAIDO',
    county: '',
    county_kana: '',
    county_roma: '',
    city: '札幌市',
    city_kana: 'サッポロシ',
    city_roma: 'SAPPORO SHI',
    ward: '中央区',
    ward_kana: 'チュウオウク',
    ward_roma: 'CHUO KU',
    oaza_cho: '南９条西五丁目',
    oaza_cho_kana: 'ミナミキュウジョウニシゴチョウメ',
    oaza_cho_roma: 'MINAMI 9 JO NISHI 5 CHOME',
    chome: '',
    chome_kana: '',
    chome_number: '',
    koaza: '',
    koaza_kana: '',
    koaza_roma: '',
    machiaza_dist: '0',
    rsdt_addr_flg: '0',
    rsdt_addr_mtd_code: '0',
    oaza_cho_aka_flg: '0',
    koaza_aka_code: '0',
    oaza_cho_gsi_uncmn: '0',
    koaza_gsi_uncmn: '0',
    status_flg: '1',
    wake_num_flg: '0',
    efct_date: '1947-04-17',
    ablt_date: '',
    src_code: '0',
    post_code: '',
    remarks: '',
    ...overrides,
  };
}

function makePosRow(overrides: Partial<MachiAzaPosData> = {}): MachiAzaPosData {
  return {
    lg_code: '011011',
    machiaza_id: '0074005',
    rsdt_addr_flg: '0',
    rep_lon: '141.34',
    rep_lat: '43.05',
    rep_srid: '6668',
    rep_scale: '2500',
    rep_src_code: '0',
    plygn_fname: '',
    plygn_kcode: '',
    plygn_fmt: '',
    plygn_srid: '',
    plygn_scale: '',
    plygn_src_code: '',
    pos_oaza_cho_chome_code: '',
    pos_data_mnt_year: '2024',
    cns_bnd_s_area_kcode: '',
    cns_bnd_year: '',
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/require-await
async function* toAsyncIterator<T>(rows: T[]): AsyncIterableIterator<T> {
  yield* rows;
}

await describe('abr_data/machi_aza_dedup', async () => {
  await describe('dedupeAdjacentByKey', async () => {
    await test('重複がなければそのまま素通りする', async () => {
      const rows = [makeMainRow({ machiaza_id: '0001000' }), makeMainRow({ machiaza_id: '0002000' })];
      const merge = () => { throw new Error('merge should not be called'); };

      const result = await Array.fromAsync(
        dedupeAdjacentByKey(toAsyncIterator(rows), ['lg_code', 'machiaza_id'], merge),
      );

      assert.deepStrictEqual(result, rows);
    });

    await test('隣接する重複キーをmergeで畳み込む(3行以上)', async () => {
      const rows = [
        makeMainRow({ machiaza_id: '0003000', remarks: 'a' }),
        makeMainRow({ machiaza_id: '0003000', remarks: 'b' }),
        makeMainRow({ machiaza_id: '0003000', remarks: 'c' }),
      ];
      const merge = (a: MachiAzaData, b: MachiAzaData): MachiAzaData => ({
        ...a,
        remarks: `${a.remarks}+${b.remarks}`,
      });

      const result = await Array.fromAsync(
        dedupeAdjacentByKey(toAsyncIterator(rows), ['lg_code', 'machiaza_id'], merge),
      );

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].remarks, 'a+b+c');
    });

    await test('非隣接の重複キーが再出現したらErrorをthrowする', async () => {
      const rows = [
        makeMainRow({ machiaza_id: '0001000' }),
        makeMainRow({ machiaza_id: '0002000' }),
        makeMainRow({ machiaza_id: '0001000' }),
      ];
      const merge = (a: MachiAzaData) => a;

      await assert.rejects(
        Array.fromAsync(dedupeAdjacentByKey(toAsyncIterator(rows), ['lg_code', 'machiaza_id'], merge)),
        /non-adjacent/,
      );
    });
  });

  await describe('mergeMachiAzaMainRow', async () => {
    await test('flgが0→1の2行はOR結合でflg=1になり、mtd_codeは1側を採用する', () => {
      const a = makeMainRow({ rsdt_addr_flg: '0', rsdt_addr_mtd_code: '0' });
      const b = makeMainRow({ rsdt_addr_flg: '1', rsdt_addr_mtd_code: '2' });

      const merged = mergeMachiAzaMainRow(a, b);

      assert.strictEqual(merged.rsdt_addr_flg, '1');
      assert.strictEqual(merged.rsdt_addr_mtd_code, '2');
    });

    await test('flgが両方0の場合はflg=0のまま維持する', () => {
      const a = makeMainRow({ rsdt_addr_flg: '0', rsdt_addr_mtd_code: '0' });
      const b = makeMainRow({ rsdt_addr_flg: '0', rsdt_addr_mtd_code: '0' });

      const merged = mergeMachiAzaMainRow(a, b);

      assert.strictEqual(merged.rsdt_addr_flg, '0');
    });

    await test('flg/mtd_code以外のフィールドが不一致なら警告してaを採用する', (t) => {
      const warn = t.mock.method(console, 'warn', () => {});
      const a = makeMainRow({ oaza_cho: '南９条西五丁目' });
      const b = makeMainRow({ oaza_cho: '別の町名' });

      const merged = mergeMachiAzaMainRow(a, b);

      assert.strictEqual(merged.oaza_cho, '南９条西五丁目');
      assert.strictEqual(warn.mock.calls.length, 1);
    });
  });

  await describe('mergeMachiAzaPosRow', async () => {
    await test('完全一致の2行は1行(aの内容)に圧縮する', () => {
      const a = makePosRow();
      const b = makePosRow();

      const merged = mergeMachiAzaPosRow(a, b);

      assert.deepStrictEqual(merged, a);
    });

    await test('フィールドが不一致なら警告してaを採用する', (t) => {
      const warn = t.mock.method(console, 'warn', () => {});
      const a = makePosRow({ rep_lon: '141.34' });
      const b = makePosRow({ rep_lon: '141.99' });

      const merged = mergeMachiAzaPosRow(a, b);

      assert.strictEqual(merged.rep_lon, '141.34');
      assert.strictEqual(warn.mock.calls.length, 1);
    });
  });
});
