import { MachiAzaData, MachiAzaPosData } from './machi_aza.js';

function makeKey<T>(row: T, keys: string[]): string {
  const record = row as unknown as Record<string, string>;
  return keys.map((key) => record[key]).join('|');
}

export async function* dedupeAdjacentByKey<T>(
  source: AsyncIterableIterator<T>,
  keys: string[],
  merge: (a: T, b: T) => T,
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
      throw new Error(`dedupeAdjacentByKey: non-adjacent duplicate key detected: ${key}`);
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

  if (mismatchedFields.length > 0) {
    console.warn(
      `mergeMachiAzaMainRow: unexpected field mismatch for lg_code=${a.lg_code} machiaza_id=${a.machiaza_id}: ${mismatchedFields.join(', ')}`,
    );
    return a;
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
  const mismatchedFields = (Object.keys(a) as (keyof MachiAzaPosData)[]).filter(
    (field) => a[field] !== b[field],
  );

  if (mismatchedFields.length > 0) {
    console.warn(
      `mergeMachiAzaPosRow: unexpected field mismatch for lg_code=${a.lg_code} machiaza_id=${a.machiaza_id}: ${mismatchedFields.join(', ')}`,
    );
  }

  return a;
}
