import path from 'node:path';
import fs from 'node:fs';

import { parse as csvParse } from 'csv-parse';

import { fetch } from 'undici';
import { unzipAndExtractZipBuffer } from './zip_tools.js';
import { getDownloadStream } from './fetch_tools.js';
import { lgCodeMatch, loadSettings } from './settings.js';
import GeoJSON from 'geojson';

const HUB_BASE_REGISTRY_URL = `https://dataset.address-br.digital.go.jp/api/search/v1`;
const USER_AGENT = 'curl/8.7.1';
const CACHE_DIR = path.join(import.meta.dirname, '..', '..', 'cache');

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

export async function getHubItemsByQuery(query: string): Promise<HubSearchResultList> {
  const cacheKey = `hub_items_by_query_${query}.json`;
  const cacheFile = path.join(CACHE_DIR, 'hub', cacheKey);

  let json: HubSearchResultList;
  if (fs.existsSync(cacheFile)) {
    json = await fs.promises.readFile(cacheFile, 'utf-8')
      .then((data) => JSON.parse(data) as HubSearchResultList);
  } else {
    const url = new URL(`${HUB_BASE_REGISTRY_URL}/collections/all/items?`
      + 'filter=((group IN (864dfb9be4ef483d864e886fa25e1c94)))&limit=12');
    url.searchParams.set('q', query);
    const res = await fetch(url.toString(), {
      headers: {
        'User-Agent': USER_AGENT,
      },
    });
    if (!res.ok) {
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

  return json;
}

export async function getHubItemById(id: string): Promise<HubSearchResult> {
  const cacheKey = `hub_item_by_id_${id}.json`;
  const cacheFile = path.join(CACHE_DIR, 'hub', cacheKey);

  let json: HubSearchResult;
  if (fs.existsSync(cacheFile)) {
    json = await fs.promises.readFile(cacheFile, 'utf-8')
      .then((data) => JSON.parse(data) as HubSearchResult);
  } else {
    const url = new URL(`${HUB_BASE_REGISTRY_URL}/collections/all/items/${id}`);
    const res = await fetch(url.toString(), {
      headers: {
        'User-Agent': USER_AGENT,
      },
    });
    if (!res.ok) {
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
