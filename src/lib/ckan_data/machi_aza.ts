import { joinAsyncIterators } from "../stream_tools.js";

export type MachiAzaData = {
  /// 全国地方公共団体コード
  lg_code: string;
  /// 町字ID
  machiaza_id: string;
  /// 町字区分コード
  machiaza_type: string;
  /// 都道府県名
  pref: string;
  /// 都道府県名_カナ
  pref_kana: string;
  /// 都道府県名_英字
  pref_roma: string;
  /// 郡名
  county: string;
  /// 郡名_カナ
  county_kana: string;
  /// 郡名_英字
  county_roma: string;
  /// 市区町村名
  city: string;
  /// 市区町村名_カナ
  city_kana: string;
  /// 市区町村名_英字
  city_roma: string;
  /// 政令市区名
  ward: string;
  /// 政令市区名_カナ
  ward_kana: string;
  /// 政令市区名_英字
  ward_roma: string;
  /// 大字・町名
  oaza_cho: string;
  /// 大字・町名_カナ
  oaza_cho_kana: string;
  /// 大字・町名_英字
  oaza_cho_roma: string;
  /// 丁目名
  chome: string;
  /// 丁目名_カナ
  chome_kana: string;
  /// 丁目名_数字
  chome_number: string;
  /// 小字名
  koaza: string;
  /// 小字名_カナ
  koaza_kana: string;
  /// 小字名_英字
  koaza_roma: string;
  /// 同一町字識別情報
  machiaza_dist: string;
  /// 住居表示フラグ
  rsdt_addr_flg: string;
  /// 住居表示方式コード
  rsdt_addr_mtd_code: string;
  /// 大字・町名_通称フラグ
  oaza_cho_aka_flg: string;
  /// 小字名_通称コード
  koaza_aka_code: string;
  /// 大字・町名_電子国土基本図外字
  oaza_cho_gsi_uncmn: string;
  /// 小字名_電子国土基本図外字
  koaza_gsi_uncmn: string;
  /// 状態フラグ
  status_flg: string;
  /// 起番フラグ
  wake_num_flg: string;
  /// 効力発生日
  efct_date: string;
  /// 廃止日
  ablt_date: string;
  /// 原典資料コード
  src_code: string;
  /// 郵便番号
  post_code: string;
  /// 備考
  remarks: string;
};

export type MachiAzaPosData = {
  /// 全国地方公共団体コード
  lg_code: string;
  /// 町字ID
  machiaza_id: string;
  /// 住居表示フラグ
  rsdt_addr_flg: string;
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
  /// 位置参照情報_大字町丁目コード
  pos_oaza_cho_chome_code: string;
  /// 位置参照情報_データ整備年度
  pos_data_mnt_year: string;
  /// 国勢調査_境界_小地域（町丁・字等別）_KEY_CODE
  cns_bnd_s_area_kcode: string;
  /// 国勢調査_境界_データ整備年度
  cns_bnd_year: string;
};

export type MachiAzaDataWithPos = MachiAzaData | MachiAzaData & MachiAzaPosData;

export function mergeMachiAzaData(
  machiAzaData: AsyncIterableIterator<MachiAzaData>,
  machiAzaPosData: AsyncIterableIterator<MachiAzaPosData>
): AsyncIterableIterator<MachiAzaDataWithPos> {
  return joinAsyncIterators(machiAzaData, machiAzaPosData, (machiAza, pos) => (
    machiAza.lg_code === pos.lg_code && machiAza.machiaza_id === pos.machiaza_id
  ), "lg_code");
}
