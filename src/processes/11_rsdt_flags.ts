export type RsdtFlagCorrection = {
  rsdt: true | undefined;
  correction: 'to_true' | 'to_false' | undefined;
};

export function correctRsdtFlag(hasRsdtData: boolean, currentRsdt: true | undefined): RsdtFlagCorrection {
  if (hasRsdtData && currentRsdt !== true) {
    return { rsdt: true, correction: 'to_true' };
  }
  if (!hasRsdtData && currentRsdt === true) {
    return { rsdt: undefined, correction: 'to_false' };
  }
  return { rsdt: currentRsdt, correction: undefined };
}

/**
 * 町字名ごとの出現回数を数えます。同一市区町村内で `machiAzaName()` が
 * 一意かどうかを判定するために使います(`-住居表示.txt` のヘッダーは
 * 町字名のみで町字を識別するため、同市区町村内に同名の町字が複数存在すると
 * どちらが実データを持つ町字か名前だけでは判別できません)。
 * @param names 同一市区町村内の全町字の `machiAzaName()` の配列
 * @returns 町字名をキー、出現回数を値とする Map
 */
export function countMachiAzaNames(names: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const name of names) {
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return counts;
}

/**
 * `correctRsdtFlag()` に、同一市区町村内での町字名の曖昧さ(重複)を加味した補正判定です。
 *
 * `to_false`(実データが無いのに `rsdt: true` になっている誤りの補正)は
 * 町字名が重複していても対象の町字自身が実データを持たないことに変わりはないため、
 * 曖昧さの影響を受けず `correctRsdtFlag()` と同じ結果になります。
 *
 * `to_true`(実データがあるのに `rsdt` が立っていない誤りの補正)は、
 * 同一市区町村内に同名の町字が複数存在する場合、`-住居表示.txt` のヘッダーが
 * どちらの町字を指しているか名前だけでは判別できないため、誤って両方に
 * `rsdt: true` を付けてしまう恐れがあります。そのため町字名が市区町村内で
 * 一意でない場合は `to_true` への補正を抑制し、現状維持とします。
 * @param hasRsdtData 対象町字と同名のヘッダー行が `-住居表示.txt` に存在するか
 * @param currentRsdt 現在の `rsdt` フラグ
 * @param isAmbiguousName 対象町字の `machiAzaName()` が同一市区町村内で複数の町字に共有されているか
 * @returns 補正結果
 */
export function correctRsdtFlagWithAmbiguity(
  hasRsdtData: boolean,
  currentRsdt: true | undefined,
  isAmbiguousName: boolean,
): RsdtFlagCorrection {
  const result = correctRsdtFlag(hasRsdtData, currentRsdt);
  if (result.correction === 'to_true' && isAmbiguousName) {
    return { rsdt: currentRsdt, correction: undefined };
  }
  return result;
}
