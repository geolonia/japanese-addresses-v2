import assert from 'node:assert';
import test, { describe } from 'node:test';

import * as stream_tools from './stream_tools.js';

describe('stream_tools', () => {
  describe('joinAsyncIterators', () => {
    test('it correctly joins two async iterators when they are ordered', async () => {
      const one = async function *() {
        yield { id: 100, name: 'Alice' };
        yield { id: 101, name: 'Bob' };
      };
      const two = async function *() {
        yield { id: 100, age: 500 };
        yield { id: 101, age: 501 };
      };

      const res = await Array.fromAsync(
        stream_tools.joinAsyncIterators(one(), two(), (a, b) => a.id === b.id)
      );

      assert.deepStrictEqual(res, [
        { id: 100, name: 'Alice', age: 500 },
        { id: 101, name: 'Bob', age: 501 },
      ]);
    });

    test('it correctly joins two async iterators when they are out of order', async () => {
      const one = async function *() {
        yield* [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }, { id: 3, name: 'Charlie' }];
      };
      const two = async function *() {
        yield* [{ id: 2, age: 30 }, { id: 1, age: 25 }, { id: 4, age: 35 }];
      };

      const res = await Array.fromAsync(
        stream_tools.joinAsyncIterators(one(), two(), (a, b) => a.id === b.id)
      );

      assert.deepStrictEqual(res, [
        { id: 1, name: 'Alice', age: 25 },
        { id: 2, name: 'Bob', age: 30 },
        { id: 3, name: 'Charlie' },
      ]);
    });
  });
});
