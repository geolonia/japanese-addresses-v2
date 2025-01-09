import assert from 'node:assert';
import test from 'node:test';

import proj from './proj.js';

await test.describe('proj', async () => {
  await test('should project coordinates from EPSG:6668 to EPSG:4326', () => {
    const coords = [139.6917, 35.6895];
    const projected = proj('EPSG:6668', 'EPSG:4326', coords);
    assert.deepStrictEqual(projected, [139.6917, 35.6895]);
  });
});
