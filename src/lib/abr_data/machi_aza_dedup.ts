import { MachiAzaData, MachiAzaPosData } from './machi_aza.js';

// ABR町字マスター(main)・位置参照拡張(pos)ストリームの重複行を、
// JOIN前の段階で解消するためのヘルパー群。
//
// - `dedupeAdjacentByKey` は、重複キーが入力ストリーム中で常に隣接して
//   出現することを前提とする(全国データで検証済み)。この前提により
//   全件をメモリにバッファすることなくストリーミングで畳み込める。
//   前提が崩れている(同一キーが非隣接で再出現する)場合は、黙って
//   取りこぼす代わりにErrorをthrowして処理を止める。
// - `mergeMachiAzaMainRow` は、`rsdt_addr_flg`(住居表示フラグ)について
//   重複する2行のいずれかが `'1'` であれば結果も `'1'` とするOR結合を行う
//   (両方 `'0'` の場合のみ `'0'` のまま)。
// - フラグ以外のフィールドが食い違う想定外のケースでは、警告を出しつつ
//   先に出現した行の値を採用して継続する(全国パイプラインを1件の想定外
//   データで止めない方針)。OR結合はこの場合も従来どおり適用する。

function makeKey<T>(row: T, keys: (keyof T & string)[]): string {
  const record = row as unknown as Record<string, string>;
  return keys.map((key) => record[key]).join('|');
}

export async function* dedupeAdjacentByKey<T>(
  source: AsyncIterableIterator<T>,
  keys: (keyof T & string)[],
  merge: (a: T, b: T) => T,
  label?: string,
): AsyncIterableIterator<T> {
  const finalizedKeys = new Set<string>();
  let currentKey: string | null = null;
  let current: T | null = null;

  for await (const row of source) {
    const key = makeKey(row, keys);

    if (current === null) {
      current = row;
      currentKey = key;
      continue;
    }

    if (key === currentKey) {
      current = merge(current, row);
      continue;
    }

    if (finalizedKeys.has(key)) {
      throw new Error(`dedupeAdjacentByKey${label ? ` (${label})` : ''}: non-adjacent duplicate key detected: ${key}`);
    }
    finalizedKeys.add(currentKey as string);
    yield current;
    current = row;
    currentKey = key;
  }

  if (current !== null) {
    yield current;
  }
}

export function mergeMachiAzaMainRow(a: MachiAzaData, b: MachiAzaData): MachiAzaData {
  const mismatchedFields = (Object.keys(a) as (keyof MachiAzaData)[]).filter((field) => {
    if (field === 'rsdt_addr_flg' || field === 'rsdt_addr_mtd_code') {
      return false;
    }
    return a[field] !== b[field];
  });

  // 想定外の不一致は警告するが、rsdt_addr_flgのOR結合自体は続行する。
  // ここでreturnしてしまうと、重複行の解消という本来の目的(食い違うflgの
  // 統合)が、無関係なフィールドの不一致を巻き添えにして達成できなくなる。
  if (mismatchedFields.length > 0) {
    console.warn(
      `mergeMachiAzaMainRow: unexpected field mismatch for lg_code=${a.lg_code} machiaza_id=${a.machiaza_id}: ${mismatchedFields.join(', ')} (a側の値を採用して継続する)`,
    );
  }

  if (a.rsdt_addr_flg === '1') {
    return a;
  }
  if (b.rsdt_addr_flg === '1') {
    return { ...a, rsdt_addr_flg: '1', rsdt_addr_mtd_code: b.rsdt_addr_mtd_code };
  }
  return a;
}

export function mergeMachiAzaPosRow(a: MachiAzaPosData, b: MachiAzaPosData): MachiAzaPosData {
  // rsdt_addr_flg は 02_make_machi_aza.ts の omitPosRsdtFlg がJOIN前に
  // pos側から破棄する(main側の値を常に優先する)フィールドなので、
  // ここで食い違っていても出力には影響しない。比較対象に含めると
  // 全国実行時に無害な差異で警告が出続けるため除外する。
  const mismatchedFields = (Object.keys(a) as (keyof MachiAzaPosData)[]).filter(
    (field) => field !== 'rsdt_addr_flg' && a[field] !== b[field],
  );

  if (mismatchedFields.length > 0) {
    console.warn(
      `mergeMachiAzaPosRow: unexpected field mismatch for lg_code=${a.lg_code} machiaza_id=${a.machiaza_id}: ${mismatchedFields.join(', ')}`,
    );
  }

  return a;
}
