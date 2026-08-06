export type PrefData = {
  /// 全国地方公共団体コード
  lg_code: string;
  /// 都道府県名
  pref: string;
  /// 都道府県名_カナ
  pref_kana: string;
  /// 都道府県名_英字
  pref_roma: string;
  /// 効力発生日
  efct_date: string;
  /// 廃止日
  ablt_date: string;
  /// 備考
  remarks: string;
};

export type PrefPosData = {
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

export type PrefDataWithPos = PrefData & PrefPosData;

export function mergePrefectureData(prefData: PrefData[], prefPosData: PrefPosData[]): PrefDataWithPos[] {
  const out: PrefDataWithPos[] = [];
  for (const pref of prefData) {
    const pos = prefPosData.find((pos) => pos.lg_code === pref.lg_code);
    if (pos) {
      out.push({ ...pref, ...pos });
    }
  }
  return out;
}
