import assert from 'node:assert';
import test from 'node:test';

import path from 'node:path';
import fs from 'node:fs';

import * as zip_tools from './zip_tools.js';

const fixtureDir = path.join(import.meta.dirname, '..', '..', 'test', 'fixtures', 'lib', 'zip_tools');

await test.describe('unzipAndExtractZipFile', async () => {
  await test('it works for a single layer of zip', async () => {
    const filePath = path.join(fixtureDir, 'single_level.csv.zip');
    const stream = fs.createReadStream(filePath);
    const files = await Array.fromAsync(zip_tools.unzipAndExtractZipFile(stream));
    assert.strictEqual(files.length, 1);
    const file0 = Buffer.concat(await Array.fromAsync(files[0])).toString('utf-8');
    assert.strictEqual(file0, `It,works!\n\n`);
  });

  await test('it works for a double layer of zip', async () => {
    const filePath = path.join(fixtureDir, 'double_level.csv.zip');
    const stream = fs.createReadStream(filePath);
    const files = await Array.fromAsync(zip_tools.unzipAndExtractZipFile(stream));
    assert.strictEqual(files.length, 2);

    const file0 = Buffer.concat(await Array.fromAsync(files[0])).toString('utf-8');
    assert.strictEqual(file0, `It,works!\nDouble,1\n`);

    const file1 = Buffer.concat(await Array.fromAsync(files[1])).toString('utf-8');
    assert.strictEqual(file1, `It,works!\nDouble,2\n`);
  });
});

await test.describe('unzipAndExtractZipBuffer', async () => {
  await test('it works for a single layer of zip', async () => {
    const filePath = path.join(fixtureDir, 'single_level.csv.zip');
    const buffer = await fs.promises.readFile(filePath);
    const files = await Array.fromAsync(zip_tools.unzipAndExtractZipBuffer(buffer));
    assert.strictEqual(files.length, 1);
    const file0 = files[0].toString('utf-8');
    assert.strictEqual(file0, `It,works!\n\n`);
  });

  await test('it works for a double layer of zip', async () => {
    const filePath = path.join(fixtureDir, 'double_level.csv.zip');
    const buffer = await fs.promises.readFile(filePath);
    const files = await Array.fromAsync(zip_tools.unzipAndExtractZipBuffer(buffer));
    assert.strictEqual(files.length, 2);

    const file0 = files[0].toString('utf-8');
    assert.strictEqual(file0, `It,works!\nDouble,1\n`);

    const file1 = files[1].toString('utf-8');
    assert.strictEqual(file1, `It,works!\nDouble,2\n`);
  });
});
