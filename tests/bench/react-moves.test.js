import { describe, it, expect } from 'vitest';
import { lisMovesByKeys as lisMoves, reactMovesByKeys as reactMoves } from '../../scripts/bench/react-moves.js';

const keys = (n) => Array.from({ length: n }, (_, i) => i);

// React 쪽 수는 실제 React를 돌린 값이 아니라 lastPlacedIndex 규칙 모델(demo/integrated/concepts.js의 reactMoves)로 센 값이다.
// 실제 React 18.3.1이 같은 수를 옮기는지는 LIS 실험(docs/perf/lis-experiment.md)에서 브라우저로 쟀다.
describe('이동 횟수 비교: LIS(우리·Vue 3) vs lastPlacedIndex 모델(React 방식)', () => {
  it('순서가 그대로면 둘 다 0번 옮긴다', () => {
    expect(lisMoves(keys(5), keys(5))).toBe(0);
    expect(reactMoves(keys(5), keys(5))).toBe(0);
  });

  it('맨 뒤를 맨 앞으로: LIS는 1번, lastPlacedIndex 모델은 나머지 999개를 옮긴다', () => {
    const old = keys(1000);
    const next = [999, ...old.slice(0, -1)];
    expect(lisMoves(old, next)).toBe(1);
    expect(reactMoves(old, next)).toBe(999);
  });

  it('맨 앞을 맨 뒤로: 둘 다 1번', () => {
    const old = keys(1000);
    const next = [...old.slice(1), 0];
    expect(lisMoves(old, next)).toBe(1);
    expect(reactMoves(old, next)).toBe(1);
  });

  it('1번과 998번 swap: LIS는 2번, lastPlacedIndex 모델은 997번', () => {
    const old = keys(1000);
    const next = old.slice();
    [next[1], next[998]] = [next[998], next[1]];
    expect(lisMoves(old, next)).toBe(2);
    expect(reactMoves(old, next)).toBe(997);
  });

  it('뒤집기: 둘 다 n-1번', () => {
    const old = keys(1000);
    expect(lisMoves(old, old.slice().reverse())).toBe(999);
    expect(reactMoves(old, old.slice().reverse())).toBe(999);
  });

  it('새로 생기거나 사라진 key는 이동으로 세지 않는다', () => {
    expect(lisMoves(['a', 'b'], ['c', 'a', 'b'])).toBe(0);
    expect(reactMoves(['a', 'b', 'x'], ['a', 'b'])).toBe(0);
  });
});
