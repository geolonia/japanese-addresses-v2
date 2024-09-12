import Database from "better-sqlite3";
import { joinAsyncIterators } from "../stream_tools.js";

export type ChibanData = {
  /// 全国地方公共団体コード
  lg_code: string
  /// 町字ID
  machiaza_id: string
  /// 地番ID
  prc_id: string
  /// 市区町村名
  city: string
  /// 政令市区名
  ward: string
  /// 大字・町名
  oaza_cho: string
  /// 丁目名
  chome: string
  /// 小字名
  koaza: string
  /// 地番1
  prc_num1: string
  /// 地番2
  prc_num2: string
  /// 地番3
  prc_num3: string
  /// 住居表示フラグ
  rsdt_addr_flg: string
  /// 地番レコード区分フラグ
  prc_rec_flg: string
  /// 地番区域コード
  prc_area_code: string
  /// 効力発生日
  efct_date: string
  /// 廃止日
  ablt_date: string
  /// 原典資料コード
  src_code: string
  /// 備考
  remarks: string
  /// 不動産番号
  real_prop_num: string
};

export type ChibanPosData = {
  /// 全国地方公共団体コード
  lg_code: string;
  /// 町字ID
  machiaza_id: string;
  /// 地番ID
  prc_id: string;
  /// 代表点_経度
  rep_lon: string;
  /// 代表点_緯度
  rep_lat: string;
  /// 代表点_座標参照系
  rep_srid: string;
  /// 代表点_地図情報レベル
  rep_scale: string;
  /// 代表点_原典資料コード
  rep_src_code: string;
  /// ポリゴン_ファイル名
  plygn_fname: string;
  /// ポリゴン_キーコード
  plygn_kcode: string;
  /// ポリゴン_データフォーマット
  plygn_fmt: string;
  /// ポリゴン_座標参照系
  plygn_srid: string;
  /// ポリゴン_地図情報レベル
  plygn_scale: string;
  /// ポリゴン_原典資料コード
  plygn_src_code: string;
  /// 法務省地図_市区町村コード
  moj_map_city_code: string;
  /// 法務省地図_大字コード
  moj_map_oaza_code: string;
  /// 法務省地図_丁目コード
  moj_map_chome_code: string;
  /// 法務省地図_小字コード
  moj_map_koaza_code: string;
  /// 法務省地図_予備コード
  moj_map_spare_code: string;
  /// 法務省地図_筆id
  moj_map_brushid: string;
};

export type ChibanDataWithPos = ChibanData | ChibanData & ChibanPosData;

export function mergeChibanData(chibanData: ChibanData[], chibanPosData: ChibanPosData[]): ChibanDataWithPos[] {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE chiban_data (
      key TEXT,
      data TEXT
    );
    CREATE TABLE chiban_pos_data (
      key TEXT,
      data TEXT
    );
  `);
  const stmt1 = db.prepare("INSERT INTO chiban_data VALUES (?, ?)");
  const stmt2 = db.prepare("INSERT INTO chiban_pos_data VALUES (?, ?)");
  for (const data of chibanData) {
    stmt1.run([data.lg_code,data.machiaza_id,data.prc_id].join('|'), JSON.stringify(data));
  }
  for (const data of chibanPosData) {
    stmt2.run([data.lg_code,data.machiaza_id,data.prc_id].join('|'), JSON.stringify(data));
  }
  const out: ChibanDataWithPos[] = [];
  for (const data of db.prepare<void[], {d01: string, d02: string}>(`
    SELECT
      chiban_data.data as d01,
      chiban_pos_data.data as d02
    FROM
      chiban_data
      LEFT JOIN chiban_pos_data ON chiban_data.key = chiban_pos_data.key
  `).iterate()) {
    out.push({ ...JSON.parse(data.d01), ...JSON.parse(data.d02) });
  }
  return out;
}

// export function mergeChibanData(
//   chibanData: AsyncIterableIterator<ChibanData>,
//   chibanPosData: AsyncIterableIterator<ChibanPosData>
// ): AsyncIterableIterator<ChibanDataWithPos> {
//   return joinAsyncIterators(chibanData, chibanPosData, (x, y) => (
//     x.lg_code === y.lg_code &&
//     x.machiaza_id === y.machiaza_id &&
//     x.prc_id === y.prc_id
//   ), "lg_code");
// }

// export function mergeChibanData(chibanData: ChibanData[], chibanPosData: ChibanPosData[]): ChibanDataWithPos[] {
//   const out: ChibanDataWithPos[] = [];
//   for (const chiban of chibanData) {
//     const pos = chibanPosData.find((pos) => (
//       pos.lg_code === chiban.lg_code &&
//       pos.machiaza_id === chiban.machiaza_id &&
//       pos.prc_id === chiban.prc_id
//     ));
//     if (pos) {
//       out.push({ ...chiban, ...pos });
//     } else {
//       out.push(chiban);
//     }
//   }
//   return out;
// }
