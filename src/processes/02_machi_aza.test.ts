import assert from 'node:assert';
import test from 'node:test';

import { rawToMachiAza } from './02_machi_aza.js';
import { MachiAzaData } from '../lib/ckan_data/machi_aza.js';

const raw: MachiAzaData = {
  lg_code: '131041',
  machiaza_id: '0020003',
  machiaza_type: '2',
  pref: '東京都',
  pref_kana: 'トウキョウト',
  pref_roma: 'Tokyo',
  county: '',
  county_kana: '',
  county_roma: '',
  city: '新宿区',
  city_kana: 'シンジュクク',
  city_roma: 'Shinjuku-ku',
  ward: '',
  ward_kana: '',
  ward_roma: '',
  oaza_cho: '新宿',
  oaza_cho_kana: 'シンジュク',
  oaza_cho_roma: 'Shinjuku',
  chome: '３丁目',
  chome_kana: '３チョウメ',
  chome_number: '3',
  koaza: '',
  koaza_kana: '',
  koaza_roma: '',
  machiaza_dist: '',
  rsdt_addr_flg: '1',
  rsdt_addr_mtd_code: '1',
  oaza_cho_aka_flg: '0',
  koaza_aka_code: '0',
  oaza_cho_gsi_uncmn: '0',
  koaza_gsi_uncmn: '0',
  status_flg: '1',
  wake_num_flg: '1',
  efct_date: '1947-04-17',
  ablt_date: '',
  src_code: '0',
  post_code: '',
  remarks: '',
};

await test('rawToMachiAza converts 全角算用(アラビア)数字 丁目 with 漢数字', () => {
  const result = rawToMachiAza({ ...raw, chome: '３丁目' });
  assert.strictEqual(result.chome, '三丁目');

  const result2 = rawToMachiAza({ ...raw, chome: '１０丁目' });
  assert.strictEqual(result2.chome, '十丁目');

  const result3 = rawToMachiAza({ ...raw, chome: '２０丁目' });
  assert.strictEqual(result3.chome, '二十丁目');

  const result4 = rawToMachiAza({ ...raw, chome: '４９丁目' });
  assert.strictEqual(result4.chome, '四十九丁目');
});

await test('rawToMachiAza converts 全角算用(アラビア)数字 丁 with 漢数字', () => {
  const result = rawToMachiAza({ ...raw, chome: '３丁' });
  assert.strictEqual(result.chome, '三丁');

  const result2 = rawToMachiAza({ ...raw, chome: '１０丁' });
  assert.strictEqual(result2.chome, '十丁');

  const result3 = rawToMachiAza({ ...raw, chome: '２０丁' });
  assert.strictEqual(result3.chome, '二十丁');

  const result4 = rawToMachiAza({ ...raw, chome: '４９丁' });
  assert.strictEqual(result4.chome, '四十九丁');
});

await test('rawToMachiAza converts 半角算用(アラビア)数字 丁目 with 漢数字', () => {
  const result = rawToMachiAza({ ...raw, chome: '3丁目' });
  assert.strictEqual(result.chome, '三丁目');

  const result2 = rawToMachiAza({ ...raw, chome: '10丁目' });
  assert.strictEqual(result2.chome, '十丁目');

  const result3 = rawToMachiAza({ ...raw, chome: '20丁目' });
  assert.strictEqual(result3.chome, '二十丁目');

  const result4 = rawToMachiAza({ ...raw, chome: '49丁目' });
  assert.strictEqual(result4.chome, '四十九丁目');
});

await test('rawToMachiAza converts 半角算用(アラビア)数字 丁 with 漢数字', () => {
  const result = rawToMachiAza({ ...raw, chome: '3丁' });
  assert.strictEqual(result.chome, '三丁');

  const result2 = rawToMachiAza({ ...raw, chome: '10丁' });
  assert.strictEqual(result2.chome, '十丁');

  const result3 = rawToMachiAza({ ...raw, chome: '20丁' });
  assert.strictEqual(result3.chome, '二十丁');

  const result4 = rawToMachiAza({ ...raw, chome: '49丁' });
  assert.strictEqual(result4.chome, '四十九丁');
});

await test('rawToMachiAza keeps 漢数字 丁目 as it is', () => {
  const result = rawToMachiAza({ ...raw, chome: '三丁目' });
  assert.strictEqual(result.chome, '三丁目');

  const result2 = rawToMachiAza({ ...raw, chome: '十丁目' });
  assert.strictEqual(result2.chome, '十丁目');

  const result3 = rawToMachiAza({ ...raw, chome: '二十丁目' });
  assert.strictEqual(result3.chome, '二十丁目');

  const result4 = rawToMachiAza({ ...raw, chome: '四十九丁目' });
  assert.strictEqual(result4.chome, '四十九丁目');
});

await test('rawToMachiAza keeps 漢数字 丁 as it is', () => {
  const result = rawToMachiAza({ ...raw, chome: '三丁' });
  assert.strictEqual(result.chome, '三丁');

  const result2 = rawToMachiAza({ ...raw, chome: '十丁' });
  assert.strictEqual(result2.chome, '十丁');

  const result3 = rawToMachiAza({ ...raw, chome: '二十丁' });
  assert.strictEqual(result3.chome, '二十丁');

  const result4 = rawToMachiAza({ ...raw, chome: '四十九丁' });
  assert.strictEqual(result4.chome, '四十九丁');
});
