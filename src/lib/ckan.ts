import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

import unzipper from 'unzipper';
import { parse as csvParse } from 'csv-parse';

import { fetch } from 'undici';

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

export function getUrlForCSVResource(res: CKANPackageSearchResult): string | undefined {
  return res.resources.find((resource) => resource.format.startsWith('CSV'))?.url;
}

export type CSVParserIterator = AsyncIterableIterator<{[key: string]: string}>;

export async function *downloadAndExtract(url: string): CSVParserIterator {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
    },
  });
  const body = res.body;
  if (!body) {
    throw new Error('No body');
  }

  const parser = csvParse();

  const promise = pipeline(
    Readable.fromWeb(body),
    unzipper.ParseOne(),
    parser,
  );

  let header: string[] | undefined = undefined;
  for await (const r of parser) {
    const record = r as string[];
    // save header
    if (typeof header === 'undefined') {
      header = record as string[];
      continue;
    }
    yield record.reduce<{[key: string]: string}>((acc, value, index) => {
      acc[header![index]] = value;
      return acc;
    }, {});
  }

  await promise;
  return;
}

export function findResultByDataType(results: CKANPackageSearchResult[], dataType: string): CKANPackageSearchResult | undefined {
  return results.find((result) => result.extras.find((extra) => extra.key === 'データセット種別' && extra.value === dataType));
}
