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
   */
  lgCodes?: string[];
}

const DEFAULT_SETTINGS: Settings = {};

// ---

async function loadRawSettings(input: string): Promise<Settings> {
  if (input.startsWith("json:")) {
    return JSON.parse(input.slice(5));
  }

  try {
    const settingsData = await fs.readFile(input, "utf-8");
    return JSON.parse(settingsData);
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

export function lgCodeMatch(settings: ParsedSettings, lgCode: string): boolean {
  if (settings.lgCodes.length === 0) {
    return true;
  }
  for (const re of settings.lgCodes) {
    if (re.test(lgCode)) {
      return true;
    }
  }
  return false;
}
