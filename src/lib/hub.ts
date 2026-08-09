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
// HUB API が受け付ける limit の上限。API 定義 (OpenAPI) で
// limit は integer / minimum 0 / maximum 100 と規定されている。
// これを超える値を指定するとレスポンスから numberMatched が消え、
// 切り捨ての検知ができなくなる (実測で確認)。
// 定義: https://dataset.address-br.digital.go.jp/api/search/definition/
const HUB_MAX_LIMIT = 100;
// 1クエリあたりの取得件数上限。
//
// 検索クエリはスペース区切りの語として扱われるため、都道府県名と同名の市
// (長野県長野市など) では県内の全市区町村がマッチして件数が膨らむ。
// この上限を超える分は startindex のページ追随 (fetchAllSearchPages) で取得する。
//
// 「HUB_MAX_LIMIT 以下にすること」という約束はコメントではなく Math.min で担保する。
// 超過すると numberMatched が消えて切り捨ての検知が効かなくなるため、
// 将来この値を引き上げても API の上限で頭打ちになるようにしておく。
const SEARCH_RESULT_LIMIT = Math.min(100, HUB_MAX_LIMIT);

// 1クエリで辿る最大ページ数。API 側の異常で numberMatched が過大に返り続けた場合の
// 暴走防止。10ページ = 1000件で、実測の最大は153件 (長野県長野市, 2026-08-09)。
export const MAX_SEARCH_PAGES = 10;

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
 * 全件取得できたと確定できない可能性があるか。
 * ページ追随の導入後は limit による切り捨てが直接の原因になることはなく、ページ数の上限
 * (MAX_SEARCH_PAGES) に達した、重複排除で件数が減った、あるいは API 自体が numberMatched
 * より少ない件数しか返していない、といった事情で全件取得を確認できないケースを指す。
 * これが true のままだと、目的のデータセットが結果から漏れて静かにデータ欠落する。
 *
 * numberMatched が返らない場合は判定できないため、安全側に倒して true を返します。
 * 「切り捨てられていない」と確定できないケースを false にすると、呼び出し側が
 * データ欠落を「元々存在しない」と誤って扱ってしまうためです。
 *
 * getHubItemsByQuery ではこの関数をキャッシュの健全性チェックにも使っている
 * (true を返すキャッシュは信用せず再取得する)。そちらの用途については同関数側の
 * コメントを参照。
 */
export function mayBeTruncated(json: HubSearchResultList): boolean {
  if (typeof json.numberMatched !== 'number') {
    return true;
  }
  return json.numberMatched > json.numberReturned;
}

// 検索結果を全件取得できなかった場合に警告する。
// 04_make_chiban は目的のデータセットが見つからないと console.error して継続するため、
// 欠落に気づかないとデータ欠落が静かに起きる。
//
// ページ追随の打ち切りを報告する唯一の場所。fetchAllSearchPages 側では警告を出さない
// (同じ事象に警告が2本出るため)。
function warnIfTruncated(json: HubSearchResultList, query: string): void {
  if (typeof json.numberMatched !== 'number') {
    console.warn(
      `HUB API が numberMatched を返しませんでした (query: ${query})。`
      + `limit=${SEARCH_RESULT_LIMIT} は API の上限 (${HUB_MAX_LIMIT}) 以下に丸めてあるため、`
      + `API 側の仕様変更が疑われます。`
      + `このままでは検索結果の切り捨てを検知できません。`
    );
    return;
  }
  if (mayBeTruncated(json)) {
    console.warn(
      `HUB API の検索結果を全件取得できませんでした `
      + `(query: ${query}, numberMatched: ${json.numberMatched}, numberReturned: ${json.numberReturned})。`
      + `最大 ${MAX_SEARCH_PAGES} ページ (${MAX_SEARCH_PAGES * SEARCH_RESULT_LIMIT} 件) で打ち切られたか、`
      + `ページ間の重複を排除して件数が減ったか、`
      + `API が numberMatched より少ない件数しか返していません。`
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
    console.error(url);
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

// startindex を進めて全ページを取得し、features を結合する。
//
// 継続判定にはレスポンスの links (rel=next) を使わない。links は API 定義
// (OgcItemResponseDto) に記載が無く、実レスポンスにあるだけの未文書フィールドで、
// 将来消えるとページングが1ページ目で静かに止まる。numberMatched は required なので
// こちらで進捗を測る。
async function fetchAllSearchPages(
  query: string,
  categoryLevel?: '全国レベル' | '都道府県レベル' | '市区町村レベル',
  categoryPref?: PrefectureName,
  sortBy?: 'title' | 'created' | 'modified',
): Promise<HubSearchResultList> {
  const firstPage = await fetchHubJson<HubSearchResultList>(
    buildSearchUrl(query, categoryLevel, categoryPref, sortBy)
  );
  const numberMatched = firstPage.numberMatched;

  // サーバ側の進捗 (fetchedCount) と結果 (mergedFeatures) は別々に数える。
  // sortBy の順序安定性は API 定義に保証がなく、ページをまたぐ間にカタログが更新されると
  // 同じ feature が2ページに現れうる。ここで重複排除後の件数を startindex に使うと、
  // 1件排除するたびにサーバ側のオフセットが1つ後ろへずれて取得漏れが出る。
  //
  // 順序が入れ替わると、逆にページ間で feature が飛ばされることもある。ページングが要る
  // クエリを投げる 04_make_chiban は sortBy を渡しておらず、API の既定順序に依存している。
  // これは意図した割り切りで、飛ばされた分は mergedFeatures.length が numberMatched に
  // 届かなくなるため warnIfTruncated が検知する (静かなデータ欠落にはならない)。
  const seenIds = new Set<string>();
  const mergedFeatures: HubSearchResult[] = [];
  const appendFeatures = (features: HubSearchResult[]) => {
    for (const feature of features) {
      if (seenIds.has(feature.properties.id)) { continue; }
      seenIds.add(feature.properties.id);
      mergedFeatures.push(feature);
    }
  };
  appendFeatures(firstPage.features);

  let fetchedCount = firstPage.features.length;
  let lastPageCount = firstPage.features.length;
  let pages = 1;

  while (
    typeof numberMatched === 'number'
    && fetchedCount < numberMatched
    // 0件が返ったら startindex が進まず無限ループになるので止める
    && lastPageCount > 0
    && pages < MAX_SEARCH_PAGES
  ) {
    // startindex は 1 始まり。前回の startindex + limit ではなく実際の取得件数を基準に
    // することで、API が limit より少なく返しても範囲を飛ばさない。
    const nextPage = await fetchHubJson<HubSearchResultList>(
      buildSearchUrl(query, categoryLevel, categoryPref, sortBy, fetchedCount + 1)
    );
    lastPageCount = nextPage.features.length;
    fetchedCount += lastPageCount;
    appendFeatures(nextPage.features);
    pages += 1;
  }

  return {
    ...firstPage,
    features: mergedFeatures,
    numberReturned: mergedFeatures.length,
    // 結合済みの結果をキャッシュに書くので、「まだ続きがある」と読める next は残さない
    links: firstPage.links?.filter((link) => link.rel !== 'next'),
  };
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

  let json: HubSearchResultList | undefined = undefined;
  if (fs.existsSync(cacheFile)) {
    const cached = await fs.promises.readFile(cacheFile, 'utf-8')
      .then((data) => JSON.parse(data) as HubSearchResultList);
    // ページ追随の導入前に保存されたキャッシュは切り捨てられたままの可能性がある。
    // キャッシュキーは同じなのでヒットし続け、そのまま使うと新しい取得ロジックが
    // 一度も走らずデータ欠落が残る。
    //
    // これは一度限りの移行措置ではなく、実行ごとに毎回行う恒常的なヘルスチェックである。
    // ページ数上限 (MAX_SEARCH_PAGES) に達した、重複排除で件数が減った、あるいは API 自体が
    // numberMatched より少ない件数しか返す、といった理由で numberMatched に到達できない
    // クエリは、仕様として毎回このチェックに引っかかり、再取得と警告の再送が続く
    // (実測でパイプライン全体につき数リクエスト程度で無視できるコスト)。
    // 「古いキャッシュの一時対応」と誤読してバージョン番号などによる一回限りの判定に
    // 置き換えると、この分岐が守っている切り捨て検知そのものが無効化されるので注意。
    if (!mayBeTruncated(cached)) {
      json = cached;
    }
  }
  if (!json) {
    json = await fetchAllSearchPages(query, categoryLevel, categoryPref, sortBy);

    await fs.promises.mkdir(path.dirname(cacheFile), { recursive: true });
    await fs.promises.writeFile(cacheFile, JSON.stringify(json));
  }

  // 再取得しても全件揃わないことがあるので、キャッシュ判定の外で検査する
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
