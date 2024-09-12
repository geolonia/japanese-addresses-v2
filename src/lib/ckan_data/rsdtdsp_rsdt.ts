import { joinAsyncIterators } from "../stream_tools.js";

export type RsdtdspRsdtData = {
  /// 全国地方公共団体コード
  lg_code: string;
  /// 町字ID
  machiaza_id: string;
  /// 街区ID
  blk_id: string;
  /// 住居ID
  rsdt_id: string;
  /// 住居2ID
  rsdt2_id: string;
  /// 市区町村名
  city: string;
  /// 政令市区名
  ward: string;
  /// 大字・町名
  oaza_cho: string;
  /// 丁目名
  chome: string;
  /// 小字名
  koaza: string;
  /// 街区符号
  blk_num: string;
  /// 住居番号
  rsdt_num: string;
  /// 住居番号2
  rsdt_num2: string;
  /// 基礎番号・住居番号区分
  basic_rsdt_div: string;
  /// 住居表示フラグ
  rsdt_addr_flg: string;
  /// 住居表示方式コード
  rsdt_addr_mtd_code: string;
  /// 状態フラグ
  status_flg: string;
  /// 効力発生日
  efct_date: string;
  /// 廃止日
  ablt_date: string;
  /// 原典資料コード
  src_code: string;
  /// 備考
  remarks: string;
};

export type RsdtdspRsdtPosData = {
  /// 全国地方公共団体コード
  lg_code: string;
  /// 町字ID
  machiaza_id: string;
  /// 街区ID
  blk_id: string;
  /// 住居ID
  rsdt_id: string;
  /// 住居2ID
  rsdt2_id: string;
  /// 住居表示フラグ
  rsdt_addr_flg: string;
  /// 住居表示方式コード
  rsdt_addr_mtd_code: string;
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
  /// 電子国土基本図（地名情報）「住居表示住所」_住所コード（可読）
  rsdt_addr_code_rdbl: string;
  /// 電子国土基本図（地名情報）「住居表示住所」_データ整備日
  rsdt_addr_data_mnt_date: string;
  /// 基礎番号・住居番号区分
  basic_rsdt_div: string;
};

export type RsdtdspRsdtDataWithPos = RsdtdspRsdtData | RsdtdspRsdtData & RsdtdspRsdtPosData;

export function mergeRsdtdspRsdtData(
  rsdtdspRsdtData: AsyncIterableIterator<RsdtdspRsdtData>,
  rsdtdspRsdtPosData: AsyncIterableIterator<RsdtdspRsdtPosData>
): AsyncIterableIterator<RsdtdspRsdtDataWithPos> {
  return joinAsyncIterators(rsdtdspRsdtData, rsdtdspRsdtPosData, (x, y) => (
    x.lg_code === y.lg_code &&
    x.machiaza_id === y.machiaza_id &&
    x.blk_id === y.blk_id &&
    x.rsdt_id === y.rsdt_id &&
    x.rsdt2_id === y.rsdt2_id
  ), "lg_code");
}
