import { LRUCache } from 'lru-cache';
import path from 'node:path';
import fs from 'node:fs/promises';

const settingsPath = () => {
  if (process.env.SETTINGS_JSON) return "json:" + process.env.SETTINGS_JSON;
  if (process.env.SETTINGS_PATH) return process.env.SETTINGS_PATH;
  return path.join(process.cwd(), "settings.json");
}

/** settings.json */
type Settings = {
  /**
   * 出力する自治体のデータを制限するためのフィルター
   * 全国地方公共団体コードをマッチする正規表現の文字列を配列で指定してください。
   * OR条件で指定されたコードのいずれかに一致するデータのみ出力されます。
   *
   * 設定されていない場合は、全てのデータが出力されます。
   *
   * 例: ["011002", "012025"] は、北海道札幌市と北海道函館市のデータのみ出力されます。
   * 例: ["^01"] は、北海道の全ての自治体のデータのみ出力されます。
   *
   * 複数の自治体を指定する場合は、["011002", "012025"] のように配列の要素を分けることを
   * 推奨します。["011002|012025"] のように1つの正規表現にまとめても動作しますが、
   * 意図が読み取りにくくなります。
   */
  lgCodes?: string[];
}

const DEFAULT_SETTINGS: Settings = {};

// ---

async function loadRawSettings(input: string): Promise<Settings> {
  if (input.startsWith("json:")) {
    return JSON.parse(input.slice(5)) as Settings;
  }

  try {
    const settingsData = await fs.readFile(input, "utf-8");
    return JSON.parse(settingsData) as Settings;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return DEFAULT_SETTINGS;
    }
    throw e;
  }
}

export function parseSettings(settings: Settings): ParsedSettings {
  return {
    lgCodes: settings.lgCodes?.map((code) => new RegExp(code)) || [],
  };
}

const settingsCache = new LRUCache<string, ParsedSettings>({
  max: 10,
  fetchMethod: async (key) => {
    const rawSettings = await loadRawSettings(key);
    return parseSettings(rawSettings);
  },
});

export type ParsedSettings = {
  lgCodes: RegExp[];
}

export async function loadSettings(): Promise<ParsedSettings> {
  const settings = await settingsCache.fetch(settingsPath());
  if (!settings) {
    return { lgCodes: [] };
  }
  return settings;
}

/**
 * 正規表現の全ての選択肢から、市区町村コードの先頭2桁(都道府県コード)を取り出します。
 * 選択(|)を分割せずに先頭だけを見ると、["452092|131059"] のような指定で
 * 2つ目以降の都道府県が判定から漏れてしまいます。
 *
 * 例: "452092|131059" -> ["45", "13"] / "^01" -> [] (市区町村まで指定されていない)
 *
 * これは正規表現を解析せずに `|` で分割する近似判定です。エスケープされた `\|` や
 * 文字クラス内の `[|]` は選択として扱われるため、都道府県コードを過剰に抽出します。
 * その場合に起きるのは「マッチしない都道府県を処理して出力0件になる」だけで
 * 誤ったデータは出力されません。lgCodes は数字のパターンを想定しているため、
 * 完全な正規表現パーサは持たない方針です。
 */
function prefCodesFromPattern(source: string): string[] {
  return source
    .split('|')
    .map((alternative) => /^\D*(\d{2})\d{3}/.exec(alternative))
    .filter((matched): matched is RegExpExecArray => matched !== null)
    .map((matched) => matched[1]);
}

export function lgCodeMatch(settings: ParsedSettings, lgCode: string): boolean {
  if (settings.lgCodes.length === 0) {
    return true;
  }
  for (const re of settings.lgCodes) {
    if (re.test(lgCode)) {
      return true;
    }

    // re が市区町村まで指定されている場合は、都道府県全体に対してマッチする
    for (const prefCode of prefCodesFromPattern(re.source)) {
      if (lgCode.startsWith(prefCode + '000')) {
        return true;
      }
    }
  }
  return false;
}
