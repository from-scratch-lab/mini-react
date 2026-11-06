import { expect, it } from 'vitest';
import { History } from '../src/history';
import type { VTree } from '../src/core/vdom';
const state = (text: string): VTree => [{ type: 'text', text }];
it('preserves independent frozen snapshots, handles branching and no-op commits', () => {
  const initial = state('A'); const history = new History(initial);
  initial[0] = { type: 'text', text: 'mutated' };
  expect(history.current).toEqual(state('A'));
  const second = state('B'); history.commit(second); second.push({ type: 'text', text: 'mutation' });
  expect(history.current).toEqual(state('B'));
  history.commit(state('C')); history.moveTo(1);
  expect(history.commit(state('B'))).toBe(false); expect(history.length).toBe(3); expect(history.canForward).toBe(true);
  history.commit(state('D')); expect(history.length).toBe(3); expect(history.index).toBe(2); expect(history.canForward).toBe(false);
  expect(history.at(0)).toEqual(state('A')); expect(history.at(1)).toEqual(state('B')); expect(history.at(2)).toEqual(state('D'));
  expect(() => history.at(1).push({ type: 'text', text: 'mutation' })).toThrow();
  history.moveTo(0); expect(history.canBack).toBe(false); expect(() => history.moveTo(-1)).toThrow(); expect(() => history.moveTo(0.5)).toThrow(); expect(history.index).toBe(0);
});
