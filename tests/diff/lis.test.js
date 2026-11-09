import { describe, it, expect } from 'vitest';
import { longestIncreasingSubsequence as lis } from '../../src/diff/lis.js';

const valuesAt = (arr, idx) => idx.map((i) => arr[i]);
const isIncreasing = (xs) => xs.every((x, i) => i === 0 || xs[i - 1] < x);

describe('longestIncreasingSubsequence', () => {
  it('가장 긴 증가 부분 수열의 인덱스를 돌려준다', () => {
    const arr = [2, 1, 5, 3, 6, 4, 8, 9, 7];
    const idx = lis(arr);
    expect(idx).toHaveLength(5);
    expect(isIncreasing(valuesAt(arr, idx))).toBe(true);
    expect(isIncreasing(idx)).toBe(true);
  });

  it('빈 배열이면 빈 배열', () => {
    expect(lis([])).toEqual([]);
  });

  it('이미 정렬돼 있으면 전부', () => {
    expect(lis([0, 1, 2, 3])).toEqual([0, 1, 2, 3]);
  });

  it('역순이면 하나만', () => {
    expect(lis([3, 2, 1, 0])).toHaveLength(1);
  });
});
