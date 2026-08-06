#!/usr/bin/env node
// test/fixtures/cache/processes_* のフィクスチャを最新のABRデータで再生成するスクリプト。
//
// 各 process パイプラインを一時 CACHE_DIR で実行し、ダウンロードされた hub JSON と
// データzipをfixtureディレクトリへ配置する。100KB以上の大きなzipは settings.lgCodes
// に応じて行レベルで絞り込み、フィクスチャ全体のサイズを抑える。
//
// 使い方:
//   npm run refresh:fixtures              # 全fixture
//   npm run refresh:fixtures -- <name>    # 特定のfixtureのみ (例: processes_02_make_machi_aza)
//
// 注意: ABRデータ配信CDNは日本国外をブロックするため、必ず日本国内から実行すること。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { parse as csvParse } from 'csv-parse/sync';

import mainPrefCity from '../processes/01_make_prefecture_city.js';
import mainMachiAza from '../processes/02_make_machi_aza.js';
import mainRsdt from '../processes/03_make_rsdt.js';
import mainChiban from '../processes/04_make_chiban.js';

import { unzipAndExtractZipBuffer } from '../lib/zip_tools.js';
import { lgCodeMatch, parseSettings } from '../lib/settings.js';

const REPO_ROOT = path.join(import.meta.dirname, '..', '..');
const FIXTURES_DIR = path.join(REPO_ROOT, 'test', 'fixtures', 'cache');

// この閾値を超える zip は lg_code で絞り込んでサイズを抑える。
const SIZE_THRESHOLD = 100_000;

type ProcessMain = (argv: string[]) => Promise<void>;

type FixtureSpec = {
  name: string;
  lgCodes: string[];
  steps: ProcessMain[];
};

const SPECS: FixtureSpec[] = [
  {
    name: 'processes_01_make_prefecture_city',
    lgCodes: ['^01'],
    steps: [mainPrefCity],
  },
  {
    name: 'processes_02_make_machi_aza',
    lgCodes: ['452092'],
    steps: [mainMachiAza],
  },
  {
    name: 'processes_03_make_rsdt',
    lgCodes: ['131059'],
    steps: [mainRsdt],
  },
  {
    name: 'processes_04_make_chiban',
    lgCodes: ['465054'],
    steps: [mainChiban],
  },
  {
    name: 'processes_10_refresh_csv_ranges',
    lgCodes: ['302015'],
    steps: [mainPrefCity, mainMachiAza, mainRsdt, mainChiban],
  },
];

// zipエントリ名に `../` が含まれると、展開先が workDir の外へ解決されてしまう。
// 書き込み前に workDir 配下であることを検証する。
function resolveInsideWorkDir(workDir: string, entryPath: string): string {
  const resolved = path.resolve(workDir, entryPath);
  const relative = path.relative(workDir, resolved);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Unsafe zip entry path: ${entryPath}`);
  }
  return resolved;
}

async function filterZipByLgCode(srcPath: string, destPath: string, lgCodes: string[]): Promise<void> {
  const settings = parseSettings({ lgCodes });
  const srcBuffer = fs.readFileSync(srcPath);

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'refresh-filter-'));
  try {
    let innerPath: string | undefined = undefined;
    for await (const entry of unzipAndExtractZipBuffer(srcBuffer)) {
      const rows = csvParse(entry, { quote: false }) as string[][];
      const header = rows[0];
      const filtered = [header, ...rows.slice(1).filter((row) => lgCodeMatch(settings, row[0]))];
      const outCsv = filtered.map((row) => row.join(',')).join('\n') + '\n';
      fs.writeFileSync(resolveInsideWorkDir(workDir, entry.path), outCsv);
      innerPath = entry.path;
      break; // 最初のCSVのみ処理(ABR配信zipは1ファイル前提)
    }
    if (!innerPath) {
      throw new Error(`No CSV entry found in ${srcPath}`);
    }
    // zip CLI は出力パスに .zip 拡張子が無いと勝手に付与するため、
    // 一時パスに .zip 付きで作成してから destPath にリネームする。
    const tmpZipPath = path.join(workDir, '_out.zip');
    // Info-ZIP は `--` をオプション終端として扱わないため、`-` で始まるファイル名は
    // オプションと解釈されてしまう。`./` を付けて回避する。
    const zipArg = innerPath.startsWith('-') ? `./${innerPath}` : innerPath;
    const result = spawnSync('zip', ['-q', tmpZipPath, zipArg], { cwd: workDir });
    if (result.status !== 0) {
      throw new Error(`zip command failed (status=${result.status}): ${result.stderr?.toString()}`);
    }
    fs.rmSync(destPath, { force: true });
    fs.renameSync(tmpZipPath, destPath);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

async function refresh(spec: FixtureSpec): Promise<void> {
  console.log(`\n=== Refreshing ${spec.name} (lgCodes=${JSON.stringify(spec.lgCodes)}) ===`);
  const tmpCache = fs.mkdtempSync(path.join(os.tmpdir(), `refresh-cache-${spec.name}-`));
  const tmpOut = fs.mkdtempSync(path.join(os.tmpdir(), `refresh-out-${spec.name}-`));

  process.env.CACHE_DIR = tmpCache;
  process.env.SETTINGS_JSON = JSON.stringify({ lgCodes: spec.lgCodes });

  try {
    for (const step of spec.steps) {
      await step(['', '', tmpOut]);
    }

    const dest = path.join(FIXTURES_DIR, spec.name);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(path.join(dest, 'hub'), { recursive: true });
    fs.mkdirSync(path.join(dest, 'files'), { recursive: true });

    const hubSrc = path.join(tmpCache, 'hub');
    if (fs.existsSync(hubSrc)) {
      for (const f of fs.readdirSync(hubSrc)) {
        fs.cpSync(path.join(hubSrc, f), path.join(dest, 'hub', f));
      }
    }

    const filesSrc = path.join(tmpCache, 'files');
    if (fs.existsSync(filesSrc)) {
      for (const f of fs.readdirSync(filesSrc)) {
        const src = path.join(filesSrc, f);
        const out = path.join(dest, 'files', f);
        const size = fs.statSync(src).size;
        if (size < SIZE_THRESHOLD) {
          fs.cpSync(src, out);
        } else {
          await filterZipByLgCode(src, out, spec.lgCodes);
          const newSize = fs.statSync(out).size;
          console.log(`  Filtered ${f}: ${size} -> ${newSize} bytes`);
        }
      }
    }

    const total = sizeOfDir(dest);
    console.log(`  Done: ${spec.name} (total ${formatBytes(total)})`);
  } finally {
    fs.rmSync(tmpCache, { recursive: true, force: true });
    fs.rmSync(tmpOut, { recursive: true, force: true });
    delete process.env.CACHE_DIR;
    delete process.env.SETTINGS_JSON;
  }
}

function sizeOfDir(dir: string): number {
  let total = 0;
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    total += f.isDirectory() ? sizeOfDir(p) : fs.statSync(p).size;
  }
  return total;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

async function main() {
  const requested = process.argv[2];
  const targets = requested ? SPECS.filter((s) => s.name === requested) : SPECS;
  if (targets.length === 0) {
    console.error(`No matching fixture spec: ${requested}`);
    console.error(`Available: ${SPECS.map((s) => s.name).join(', ')}`);
    process.exit(1);
  }
  for (const spec of targets) {
    await refresh(spec);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
