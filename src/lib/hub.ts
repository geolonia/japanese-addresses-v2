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
// HUB API が受け付ける limit の上限。これを超える値を指定するとレスポンスから
// numberMatched が消え、切り捨ての検知ができなくなる (実測で確認)。
const HUB_MAX_LIMIT = 100;
// 1クエリあたりの取得件数上限 (HUB_MAX_LIMIT 以下にすること)。
//
// 検索クエリはスペース区切りの語として扱われるため、都道府県名と同名の市
// (長野県長野市など) では県内の全市区町村がマッチして件数が膨らむ。実測では
// numberMatched が 2〜153件、目的のデータセットを含むのに必要な件数は最大22件
// (岐阜県岐阜市の地番マスター位置参照拡張が22番目)だった。
// 旧実装の limit=12 では、この位置参照拡張が枠外に落ちて座標なしで出力されていた。
const SEARCH_RESULT_LIMIT = HUB_MAX_LIMIT;
const USER_AGENT = 'curl/8.7.1';
const DEFAULT_CACHE_DIR = path.join(import.meta.dirname, '..', '..', 'cache');

function getCacheDir(): string {
  return process.env.CACHE_DIR || DEFAULT_CACHE_DIR;
}

/** レスポンスの links 要素。API 定義 (OgcItemResponseDto) には記載がなく、
 * 実レスポンスにのみ存在する。ページ継続の判定には使わない (numberMatched を使う)。 */
export type HubLink = {
  rel: string,
  type?: string,
  title?: string,
  href: string,
}

export type HubSearchResultList = GeoJSON.FeatureCollection & {
  timestamp: Date,
  /** limit が HUB_MAX_LIMIT を超えるとレスポンスから省かれる (実測) */
  numberMatched?: number,
  numberReturned: number,
  features: HubSearchResult[],
  links?: HubLink[],
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

/**
 * 検索結果が limit で切り捨てられている (全一致件数より返却件数が少ない) 可能性があるか。
 * 切り捨てられていると、目的のデータセットが結果から漏れて静かにデータ欠落する。
 *
 * numberMatched が返らない場合は判定できないため、安全側に倒して true を返します。
 * 「切り捨てられていない」と確定できないケースを false にすると、呼び出し側が
 * データ欠落を「元々存在しない」と誤って扱ってしまうためです。
 */
export function mayBeTruncated(json: HubSearchResultList): boolean {
  if (typeof json.numberMatched !== 'number') {
    return true;
  }
  return json.numberMatched > json.numberReturned;
}

// 検索結果が limit で切り捨てられた場合に警告する。
// 04_make_chiban は目的のデータセットが見つからないと console.error して継続するため、
// 切り捨てに気づかないとデータ欠落が静かに起きる。
function warnIfTruncated(json: HubSearchResultList, query: string): void {
  if (typeof json.numberMatched !== 'number') {
    console.warn(
      `HUB API が numberMatched を返しませんでした (query: ${query})。`
      + `SEARCH_RESULT_LIMIT=${SEARCH_RESULT_LIMIT} が API の上限 (${HUB_MAX_LIMIT}) を超えている可能性があります。`
      + `このままでは検索結果の切り捨てを検知できません。`
    );
    return;
  }
  if (mayBeTruncated(json)) {
    console.warn(
      `HUB API の検索結果が limit=${SEARCH_RESULT_LIMIT} で切り捨てられました `
      + `(query: ${query}, numberMatched: ${json.numberMatched}, numberReturned: ${json.numberReturned})。`
      + `目的のデータセットが結果に含まれていない場合はデータが欠落します。`
    );
  }
}

// HUB API を取得して JSON を返す。エラー時のメッセージ組み立ては
// 検索・単体取得の両方で同じなので、ここに集約する。
async function fetchHubJson<T>(url: string): Promise<T> {
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
  return await res.json() as T;
}

// 検索の URL を組み立てる。ページ追随でも同じ関数を使い、URL の作り方を1箇所に集約する。
// レスポンスの rel=next の href は未エンコード (生の日本語・生スペース) で返るため、
// それを再パースするより自前で組み立てるほうが安全。
function buildSearchUrl(
  query: string,
  categoryLevel?: '全国レベル' | '都道府県レベル' | '市区町村レベル',
  categoryPref?: PrefectureName,
  sortBy?: 'title' | 'created' | 'modified',
  startIndex?: number,
): string {
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
  // startindex は 1 始まり (API 定義: minimum 1)
  if (typeof startIndex === 'number') {
    url += `&startindex=${startIndex}`;
  }
  return url;
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
    json = await fetchHubJson<HubSearchResultList>(
      buildSearchUrl(query, categoryLevel, categoryPref, sortBy)
    );

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
    json = await fetchHubJson<HubSearchResult>(url);

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
