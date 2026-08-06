import path from 'node:path';
import fs from 'node:fs';

import { parse as csvParse } from 'csv-parse';

import GeoJSON from 'geojson';
import { fetchWithRetry } from './fetch_with_retry.js';
import { unzipAndExtractZipBuffer } from './zip_tools.js';
import { getDownloadStream } from './fetch_tools.js';
import { lgCodeMatch, loadSettings } from './settings.js';
import { PrefectureName } from './prefecture_name_codes.js';

const HUB_BASE_REGISTRY_URL = `https://dataset.address-br.digital.go.jp/api/search/v1`;
const HUB_GROUP_ID = '864dfb9be4ef483d864e886fa25e1c94';
// 1クエリあたりの取得件数上限。1市区町村あたりのデータセットは数件程度だが、
// 将来データセットが増えて上限に達すると、目的のデータセットが結果から漏れて
// 静かにデータ欠落する。上限に達した場合は警告を出す (warnIfTruncated 参照)。
const SEARCH_RESULT_LIMIT = 50;
const USER_AGENT = 'curl/8.7.1';
const DEFAULT_CACHE_DIR = path.join(import.meta.dirname, '..', '..', 'cache');

function getCacheDir(): string {
  return process.env.CACHE_DIR || DEFAULT_CACHE_DIR;
}

export type HubSearchResultList = GeoJSON.FeatureCollection & {
  timestamp: Date,
  numberMatched: number,
  numberReturned: number,
  features: HubSearchResult[],
}

export type HubSearchResult = GeoJSON.Feature & {
  properties: {
    description: string,
    title: string,
    id: string,
    url: string,
    created: number,
    modified: number,
  }
};

export type HubSearchError = {
  message: string,
  error: string,
  statusCode: number,
}

// 検索結果が limit で切り捨てられた場合に警告する。
// 04_make_chiban は目的のデータセットが見つからないと console.error して継続するため、
// 切り捨てに気づかないとデータ欠落が静かに起きる。
function warnIfTruncated(json: HubSearchResultList, query: string): void {
  if (json.numberMatched > json.numberReturned) {
    console.warn(
      `HUB API の検索結果が limit=${SEARCH_RESULT_LIMIT} で切り捨てられました `
      + `(query: ${query}, numberMatched: ${json.numberMatched}, numberReturned: ${json.numberReturned})。`
      + `SEARCH_RESULT_LIMIT の引き上げが必要です。`
    );
  }
}

export async function getHubItemsByQuery(
  query: string,
  categoryLevel?: '全国レベル' | '都道府県レベル' | '市区町村レベル',
  categoryPref?: PrefectureName,
  sortBy?: 'title' | 'created' | 'modified'
): Promise<HubSearchResultList> {
  // limit はレスポンスの内容 (切り捨ての有無) を左右するのでキャッシュキーに含める。
  // 含めないと、より小さい limit で保存された切り捨て済みのキャッシュを読み続けてしまう。
  const cacheKey = `hub_items_by_query_${query}_${categoryLevel}_${categoryPref}_${sortBy}_limit${SEARCH_RESULT_LIMIT}.json`;
  const cacheFile = path.join(getCacheDir(), 'hub', cacheKey);

  let json: HubSearchResultList;
  if (fs.existsSync(cacheFile)) {
    json = await fs.promises.readFile(cacheFile, 'utf-8')
      .then((data) => JSON.parse(data) as HubSearchResultList);
  } else {
    let categoryPart = '';
    if (categoryLevel && categoryPref) {
      categoryPart = ` AND ((categories IN (/categories/${categoryLevel}/${categoryPref})))`;
    } else if (categoryLevel) {
      categoryPart = ` AND ((categories IN (/categories/${categoryLevel})))`;
    }
    let url = `${HUB_BASE_REGISTRY_URL}/collections/all/items?`
      + `filter=((group IN (${HUB_GROUP_ID})))${encodeURIComponent(categoryPart)}`
      + `&limit=${SEARCH_RESULT_LIMIT}`
      + `&q=${encodeURIComponent(query)}`;
    if (sortBy) {
      url += `&sortBy=-properties.${sortBy}`;
    }
    const res = await fetchWithRetry(url, {
      headers: {
        'User-Agent': USER_AGENT,
      },
    });
    if (!res.ok) {
      console.log(url);
      if (res.headers.get('content-type')?.includes('application/geo+json')) {
        const errorJson = await res.json() as HubSearchError;
        throw new Error(`HUB API returned an error: ${JSON.stringify(errorJson)}`);
      } else {
        throw new Error(`HUB API returned an error: ${res.status} ${res.statusText}`);
      }
    }
    json = await res.json() as HubSearchResultList;

    await fs.promises.mkdir(path.dirname(cacheFile), { recursive: true });
    await fs.promises.writeFile(cacheFile, JSON.stringify(json));
  }

  // キャッシュ済みのレスポンスでも切り捨ては起きているので、キャッシュ判定の外で検査する
  warnIfTruncated(json, query);

  return json;
}

export async function getHubItemById(id: string): Promise<HubSearchResult> {
  const cacheKey = `hub_item_by_id_${id}.json`;
  const cacheFile = path.join(getCacheDir(), 'hub', cacheKey);

  let json: HubSearchResult;
  if (fs.existsSync(cacheFile)) {
    json = await fs.promises.readFile(cacheFile, 'utf-8')
      .then((data) => JSON.parse(data) as HubSearchResult);
  } else {
    const url = `${HUB_BASE_REGISTRY_URL}/collections/all/items/${id}`;
    const res = await fetchWithRetry(url, {
      headers: {
        'User-Agent': USER_AGENT,
      },
    });
    if (!res.ok) {
      console.log(url);
      if (res.headers.get('content-type')?.includes('application/geo+json')) {
        const errorJson = await res.json() as HubSearchError;
        throw new Error(`HUB API returned an error: ${JSON.stringify(errorJson)}`);
      } else {
        throw new Error(`HUB API returned an error: ${res.status} ${res.statusText}`);
      }
    }
    json = await res.json() as HubSearchResult;

    await fs.promises.mkdir(path.dirname(cacheFile), { recursive: true });
    await fs.promises.writeFile(cacheFile, JSON.stringify(json));
  }

  return json;
}

export function getUrlForCSVResource(res: HubSearchResult): string | undefined {
  return res.properties.url;
}

export type CSVParserIterator<T> = AsyncIterableIterator<T>;

export async function *combineCSVParserIterators<T>(...iterators: CSVParserIterator<T>[]): CSVParserIterator<T> {
  for (const i of iterators) {
    yield* i;
  }
}

export async function *downloadAndExtract<T>(url: string): CSVParserIterator<T> {
  const bodyStream = await getDownloadStream(url);
  const fileEntries = unzipAndExtractZipBuffer(bodyStream);
  for await (const entry of fileEntries) {
    const csvParser = csvParse(entry, { quote: false });
    let header: string[] | undefined = undefined;
    for await (const r of csvParser) {
      const record = r as string[];
      // save header
      if (typeof header === 'undefined') {
        header = record;
        continue;
      }
      yield record.reduce<Record<string, string>>((acc, value, index) => {
        acc[header![index]] = value;
        return acc;
      }, {}) as T;
    }
  }
}

export async function *getAndStreamCSVDataForId<T = Record<string, string>>(id: string): CSVParserIterator<T> {
  const res = await getHubItemById(id);
  const url = getUrlForCSVResource(res);
  if (!url) {
    throw new Error('No CSV resource found');
  }
  const settings = await loadSettings();
  for await (const record of downloadAndExtract<T>(url)) {
    const lgCode = (record as {'lg_code': string})['lg_code'];
    if (!lgCodeMatch(settings, lgCode)) { continue; }
    yield record;
  }
}

export async function getAndParseCSVDataForId<T = Record<string, string>>(id: string): Promise<T[]> {
  return Array.fromAsync(getAndStreamCSVDataForId<T>(id));
}

export function findResultByTypeAndArea(results: HubSearchResult[], dataType: string, area: string): HubSearchResult | undefined {
  return results.find((result) => (
    result.properties.title === `${area} ${dataType}`
  ));
}
