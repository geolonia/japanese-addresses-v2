type JoinCondition<T, U> = (left: T, right: U) => boolean;

/**
 * Joins two asynchronous iterators based on a specified condition, similar to a SQL LEFT JOIN operation.
 * This function supports out-of-order iterators and buffers the right iterator to ensure no matches are missed.
 *
 * @template T The type of elements in the left iterator
 * @template U The type of elements in the right iterator
 *
 * @param {AsyncIterableIterator<T>} leftIterator - The primary async iterator (left side of the join)
 * @param {AsyncIterableIterator<U>} rightIterator - The secondary async iterator (right side of the join)
 * @param {JoinCondition<T, U>} joinCondition - A function that determines whether two elements should be joined
 *
 * @returns {AsyncGenerator<T | T & U>} An async generator that yields:
 *   - Merged objects (T & U) when a match is found
 *   - Objects from the left iterator (T) when no match is found
 *
 * @example
 * ```typescript
 * const leftIterator = async function*() {
 *   yield* [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }, { id: 3, name: 'Charlie' }];
 * };
 *
 * const rightIterator = async function*() {
 *   yield* [{ id: 2, age: 30 }, { id: 1, age: 25 }, { id: 4, age: 35 }];
 * };
 *
 * const joinCondition = (left, right) => left.id === right.id;
 *
 * for await (const result of joinAsyncIterators(leftIterator(), rightIterator(), joinCondition)) {
 *   console.log(result);
 * }
 *
 * // Output:
 * // { id: 1, name: 'Alice', age: 25 }
 * // { id: 2, name: 'Bob', age: 30 }
 * // { id: 3, name: 'Charlie' }
 * ```
 *
 * @remarks
 * - The function performs a left join, meaning all elements from the left iterator will be yielded,
 *   even if no match is found in the right iterator.
 * - The right iterator is buffered to handle out-of-order scenarios, which may lead to increased memory usage
 *   if the right iterator produces many elements before finding matches.
 * - The order of the output follows the order of the left iterator.
 * - If multiple elements in the right iterator match an element from the left iterator,
 *   only the first match encountered will be joined.
 */
export async function* joinAsyncIterators<T extends object, U extends object>(
  leftIterator: AsyncIterableIterator<T>,
  rightIterator: AsyncIterableIterator<U>,
  joinCondition: JoinCondition<T, U>,
  segmentKey?: string,
): AsyncGenerator<T | T & U> {
  const rightBuffer: U[] = [];
  let currentRightSegment: string | undefined = undefined;
  async function getMatchingRight(currentLeft: T): Promise<U | undefined> {
    let matchingIdx = -1;
    while (matchingIdx < 0) {
      // console.log('advancing right buffer', rightBuffer.length, JSON.stringify(currentLeft));
      const { done, value } = await rightIterator.next();
      if (done) {
        return undefined;
      }

      rightBuffer.push(value);
      matchingIdx = rightBuffer.findIndex((right) => joinCondition(currentLeft, right));

      if (segmentKey) {
        const thisSegment = segmentKey in value ? ((value as any)[segmentKey] as string) : undefined;
        if (matchingIdx < 0 && currentRightSegment !== undefined && thisSegment !== currentRightSegment) {
          // segment changed, so we can't match this left with any right
          // because the segment changed, we know we can get rid of the buffer
          rightBuffer.splice(0, rightBuffer.length);
          return undefined;
        }
        currentRightSegment = thisSegment;
      }
    }
    // console.log(`rightbuffer: ${rightBuffer.length}`);
    // Remove the element from the buffer and return it
    return rightBuffer.splice(matchingIdx, 1)[0];
  }
  for await (const left of leftIterator) {
    // console.log(`left: ${left}`);
    const right = await getMatchingRight(left);
    if (right) {
      yield { ...left, ...right };
    } else {
      yield left;
    }
  }
}
