import path from 'node:path';
import fs from 'node:fs';

import { parse as csvParse } from 'csv-parse';

import { fetch } from 'undici';
import { unzipAndExtractZipFile } from './zip_tools.js';
import { getDownloadStream } from './fetch_tools.js';
import { lgCodeMatch, loadSettings } from './settings.js';

const CKAN_BASE_REGISTRY_URL = `https://catalog.registries.digital.go.jp/rc`
const USER_AGENT = 'curl/8.7.1';
const CACHE_DIR = path.join(import.meta.dirname, '..', '..', 'cache');

export type CKANResponse<T = any> = {
  success: false
} | {
  success: true
  result: T
}

export type CKANPackageSearchResultList = {
  count: number,
  sort: string,
  results: CKANPackageSearchResult[]
}

export type CKANPackageSearchResult = {
  id: string
  metadata_created: string,
  metadata_modified: string,
  name: string,
  notes: string,
  num_resources: number,
  num_tags: number,
  title: string,
  type: string,
  extras: { [key: string]: string }[],
  resources: CKANPackageResource[],
}

export type CKANPackageResource = {
  description: string
  last_modified: string
  id: string
  url: string
  format: string
}

export async function ckanPackageSearch(query: string): Promise<CKANPackageSearchResult[]> {
  const cacheKey = `package_search_${query}.json`;
  const cacheFile = path.join(CACHE_DIR, 'ckan', cacheKey);

  let json: CKANResponse<CKANPackageSearchResultList>;
  if (fs.existsSync(cacheFile)) {
    json = await fs.promises.readFile(cacheFile, 'utf-8').then((data) => JSON.parse(data));
  } else {
    const url = new URL(`${CKAN_BASE_REGISTRY_URL}/api/3/action/package_search`);
    url.searchParams.set('q', query);
    const res = await fetch(url.toString(), {
      headers: {
        'User-Agent': USER_AGENT,
      },
    });
    json = await res.json() as CKANResponse<CKANPackageSearchResultList>;

    await fs.promises.mkdir(path.dirname(cacheFile), { recursive: true });
    await fs.promises.writeFile(cacheFile, JSON.stringify(json));
  }

  if (!json.success) {
    throw new Error('CKAN API returned an error: ' + JSON.stringify(json));
  }

  return json.result.results;
}

export async function getCkanPackageById(id: string): Promise<CKANPackageSearchResult> {
  const cacheKey = `package_show_${id}.json`;
  const cacheFile = path.join(CACHE_DIR, 'ckan', cacheKey);

  let json: CKANResponse<CKANPackageSearchResult>;
  if (fs.existsSync(cacheFile)) {
    json = await fs.promises.readFile(cacheFile, 'utf-8').then((data) => JSON.parse(data));
  } else {
    const url = new URL(`${CKAN_BASE_REGISTRY_URL}/api/3/action/package_show`);
    url.searchParams.set('id', id);
    const res = await fetch(url.toString(), {
      headers: {
        'User-Agent': USER_AGENT,
      },
    });
    json = await res.json() as CKANResponse<CKANPackageSearchResult>;

    await fs.promises.mkdir(path.dirname(cacheFile), { recursive: true });
    await fs.promises.writeFile(cacheFile, JSON.stringify(json));
  }
  if (!json.success) {
    throw new Error('CKAN API returned an error: ' + JSON.stringify(json));
  }
  return json.result;
}

export function getUrlForCSVResource(res: CKANPackageSearchResult): string | undefined {
  return res.resources.find((resource) => resource.format.startsWith('CSV'))?.url;
}

export type CSVParserIterator<T> = AsyncIterableIterator<T>;

export async function *combineCSVParserIterators<T>(...iterators: CSVParserIterator<T>[]): CSVParserIterator<T> {
  for (const i of iterators) {
    yield* i;
  }
}

export async function *downloadAndExtract<T>(url: string): CSVParserIterator<T> {
  const bodyStream = await getDownloadStream(url);
  const fileEntries = unzipAndExtractZipFile(bodyStream);
  for await (const entry of fileEntries) {
    const csvParser = entry.pipe(csvParse({
      quote: false,
    }));
    let header: string[] | undefined = undefined;
    for await (const r of csvParser) {
      const record = r as string[];
      // save header
      if (typeof header === 'undefined') {
        header = record as string[];
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
  const res = await getCkanPackageById(id);
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

export function findResultByTypeAndArea(results: CKANPackageSearchResult[], dataType: string, area: string): CKANPackageSearchResult | undefined {
  return results.find((result) => (
    result.extras.findIndex((extra) => (extra.key === "データセット種別" && extra.value === dataType)) > 0 &&
    result.extras.findIndex((extra) => (extra.key === "対象地域" && extra.value === area)) > 0
  ));
}
