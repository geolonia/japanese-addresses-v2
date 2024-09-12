import { pipeline } from 'node:stream/promises';
import { Duplex, PassThrough, Readable, Transform } from 'node:stream';

import { parse as csvParse } from 'csv-parse';

import { fetch } from 'undici';
import { unzipAndExtractZipFile } from './zip_tools.js';

const CKAN_BASE_REGISTRY_URL = `https://catalog.registries.digital.go.jp/rc`
const USER_AGENT = 'curl/8.7.1';

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
  const url = new URL(`${CKAN_BASE_REGISTRY_URL}/api/3/action/package_search`);
  url.searchParams.set('q', query);
  const res = await fetch(url.toString(), {
    headers: {
      'User-Agent': USER_AGENT,
    },
  });
  const json = await res.json() as CKANResponse<CKANPackageSearchResultList>;

  if (!json.success) {
    throw new Error('CKAN API returned an error: ' + JSON.stringify(json));
  }

  return json.result.results;
}

export async function getCkanPackageById(id: string): Promise<CKANPackageSearchResult> {
  const url = new URL(`${CKAN_BASE_REGISTRY_URL}/api/3/action/package_show`);
  url.searchParams.set('id', id);
  // console.log(`Start ${url.toString()}`);
  const res = await fetch(url.toString(), {
    headers: {
      'User-Agent': USER_AGENT,
    },
  });
  // console.log(`Status code: ${res.status} ${res.statusText} for ${url.toString()}`);
  const json = await res.json() as CKANResponse<CKANPackageSearchResult>;
  if (!json.success) {
    throw new Error('CKAN API returned an error: ' + JSON.stringify(json));
  }
  return json.result;
}

export function getUrlForCSVResource(res: CKANPackageSearchResult): string | undefined {
  return res.resources.find((resource) => resource.format.startsWith('CSV'))?.url;
}

export type CSVParserIterator<T> = AsyncIterableIterator<T>;

export async function *downloadAndExtract<T>(url: string): CSVParserIterator<T> {
  // console.log(`Start ${url}`);
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
    },
  });
  // console.log(`Status code: ${res.status} ${res.statusText} for ${url}`);
  const body = res.body;
  if (!body) {
    throw new Error('No body');
  }

  const bodyStream = Readable.fromWeb(body);
  const fileEntries = unzipAndExtractZipFile(bodyStream);
  for await (const entry of fileEntries) {
    const csvParser = entry.pipe(csvParse());
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
  yield *downloadAndExtract(url);
}

export async function getAndParseCSVDataForId<T = Record<string, string>>(id: string): Promise<T[]> {
  return Array.fromAsync(getAndStreamCSVDataForId<T>(id));
}

export function findResultByDataType(results: CKANPackageSearchResult[], dataType: string): CKANPackageSearchResult | undefined {
  return results.find((result) => result.extras.find((extra) => extra.key === 'データセット種別' && extra.value === dataType));
}
