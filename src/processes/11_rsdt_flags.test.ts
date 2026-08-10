import assert from 'node:assert';
import test from 'node:test';

import { correctRsdtFlag } from './11_rsdt_flags.js';

await test('correctRsdtFlag sets rsdt to true when actual data exists but flag was false', () => {
  const result = correctRsdtFlag(true, undefined);
  assert.deepStrictEqual(result, { rsdt: true, correction: 'to_true' });
});

await test('correctRsdtFlag clears rsdt when actual data is missing but flag was true', () => {
  const result = correctRsdtFlag(false, true);
  assert.deepStrictEqual(result, { rsdt: undefined, correction: 'to_false' });
});

await test('correctRsdtFlag keeps rsdt true when actual data exists and flag was already true', () => {
  const result = correctRsdtFlag(true, true);
  assert.deepStrictEqual(result, { rsdt: true, correction: undefined });
});

await test('correctRsdtFlag keeps rsdt undefined when actual data is missing and flag was already undefined', () => {
  const result = correctRsdtFlag(false, undefined);
  assert.deepStrictEqual(result, { rsdt: undefined, correction: undefined });
});
