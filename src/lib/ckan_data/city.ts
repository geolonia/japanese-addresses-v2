export type CityData = {
  /// 全国地方公共団体コード
  lg_code: string;
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
  /// 効力発生日
  efct_date: string;
  /// 廃止日
  ablt_date: string;
  /// 備考
  remarks: string;
};

export type CityPosData = {
  /// 全国地方公共団体コード
  lg_code: string;
  /// 代表点_経度
  rep_lon: string;
  /// 代表点_緯度
  rep_lat: string;
  /// 代表点_座標参照系
  rep_srid: string;
  /// 代表点_地図情報レベル
  rep_scale: string;
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
};

export type CityDataWithPos = CityData & CityPosData;

export function mergeCityData(cityData: CityData[], cityPosData: CityPosData[]): CityDataWithPos[] {
  const out: CityDataWithPos[] = [];
  for (const city of cityData) {
    const pos = cityPosData.find((pos) => pos.lg_code === city.lg_code);
    if (pos) {
      out.push({ ...city, ...pos });
    }
  }
  return out;
}
