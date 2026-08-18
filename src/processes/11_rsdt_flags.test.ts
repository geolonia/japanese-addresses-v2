import assert from 'node:assert';
import test from 'node:test';

import { correctRsdtFlag, correctRsdtFlagWithAmbiguity, countMachiAzaNames } from './11_rsdt_flags.js';

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

await test.describe('countMachiAzaNames', async () => {
  await test('counts how many times each name occurs', () => {
    const counts = countMachiAzaNames(['前田町', '前田町', '横田基地内']);
    assert.strictEqual(counts.get('前田町'), 2);
    assert.strictEqual(counts.get('横田基地内'), 1);
    assert.strictEqual(counts.get('存在しない町字'), undefined);
  });

  await test('returns an empty map for an empty input', () => {
    const counts = countMachiAzaNames([]);
    assert.strictEqual(counts.size, 0);
  });
});

await test.describe('correctRsdtFlagWithAmbiguity', async () => {
  await test('behaves exactly like correctRsdtFlag when the name is not ambiguous', () => {
    assert.deepStrictEqual(
      correctRsdtFlagWithAmbiguity(true, undefined, false),
      { rsdt: true, correction: 'to_true' },
    );
    assert.deepStrictEqual(
      correctRsdtFlagWithAmbiguity(false, true, false),
      { rsdt: undefined, correction: 'to_false' },
    );
  });

  await test('suppresses a to_true correction when two machiAza in the same city share a name and only one has real data', () => {
    // 三重県四日市市「前田町」の実例を再現する: machiaza_id 0238000 は実データを持ち既に rsdt: true、
    // machiaza_id 0350000 は同名だが実データを持たない。ヘッダーは名前だけで一致するため
    // hasRsdtData=true が両方に渡ってしまうが、0350000 側は rsdt: true にしてはいけない。
    const result = correctRsdtFlagWithAmbiguity(true, undefined, true);
    assert.deepStrictEqual(result, { rsdt: undefined, correction: undefined });
  });

  await test('does not suppress a to_false correction even when the name is ambiguous', () => {
    // to_false は対象の町字自身が実データを持たないという判定であり、
    // 同名の別町字が実データを持つかどうかに関わらず正しく適用されるべき。
    const result = correctRsdtFlagWithAmbiguity(false, true, true);
    assert.deepStrictEqual(result, { rsdt: undefined, correction: 'to_false' });
  });

  await test('keeps an already-true flag as-is when the name is ambiguous and real data exists', () => {
    const result = correctRsdtFlagWithAmbiguity(true, true, true);
    assert.deepStrictEqual(result, { rsdt: true, correction: undefined });
  });
});
