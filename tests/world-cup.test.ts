import { afterEach, expect, it, vi } from 'vitest';
import { mountWorldCup } from '../src/world-cup';

let root: ReturnType<typeof mountWorldCup> | undefined;
afterEach(() => {
  root?.unmount();
  root = undefined;
  vi.useRealTimers();
});

it.each([
  [1, 3, 1], [1, 3, 3], [1, 4, 1], [1, 4, 4],
  [2, 3, 2], [2, 3, 3], [2, 4, 2], [2, 4, 4],
])('advances candidates %i and %i to the final and crowns candidate %i', (first, second, winner) => {
  vi.useFakeTimers();
  const container = document.createElement('div');
  root = mountWorldCup(container);
  const choices = () => Array.from(container.querySelectorAll<HTMLButtonElement>('.world-cup-choice'));
  const names = () => choices().map(button => button.textContent);
  const status = container.querySelector('[role="status"]')!;

  expect(names()).toEqual(['후보 1', '후보 2']);
  expect(status.textContent).toBe('4강 · 1/2');
  choices()[first - 1].click();
  vi.runOnlyPendingTimers();

  expect(names()).toEqual(['후보 3', '후보 4']);
  expect(status.textContent).toBe('4강 · 2/2');
  choices()[second - 3].click();
  vi.runOnlyPendingTimers();

  expect(names()).toEqual([`후보 ${first}`, `후보 ${second}`]);
  expect(status.textContent).toBe('결승 · 1/1');
  const winningChoice = choices()[winner === first ? 0 : 1];
  const winningPhoto = winningChoice.querySelector('img')!.getAttribute('src');
  winningChoice.click();
  vi.runOnlyPendingTimers();

  expect(choices()).toHaveLength(0);
  expect(status.textContent).toBe('우승 확정');
  expect(container.querySelector('h3')?.textContent).toBe(`후보 ${winner} 우승`);
  expect(container.querySelector('.world-cup-result img')?.getAttribute('src')).toBe(winningPhoto);

  container.querySelector<HTMLButtonElement>('.world-cup-restart')!.click();
  expect(names()).toEqual(['후보 1', '후보 2']);
  expect(status.textContent).toBe('4강 · 1/2');
  expect(container.querySelector('.world-cup-result')).toBeNull();
});

it('shows the first choice during the transition and ignores repeat or opposing clicks', () => {
  vi.useFakeTimers();
  const container = document.createElement('div');
  root = mountWorldCup(container);
  const [first, second] = container.querySelectorAll<HTMLButtonElement>('.world-cup-choice');
  const status = container.querySelector('[role="status"]')!;

  second.click();
  first.click();
  second.click();

  expect(second.dataset.state).toBe('selected');
  expect(first.dataset.state).toBe('passed');
  expect(first.getAttribute('aria-disabled')).toBe('true');
  expect(status.textContent).toBe('4강 · 1/2 · 후보 2 선택');
  expect(vi.getTimerCount()).toBe(1);
  vi.runOnlyPendingTimers();

  expect(status.textContent).toBe('4강 · 2/2');
  expect(first.getAttribute('aria-disabled')).toBeNull();
  first.click();
  vi.runOnlyPendingTimers();
  expect(status.textContent).toBe('결승 · 1/1');
  expect(first.textContent).toBe('후보 2');
  expect(second.textContent).toBe('후보 3');
});

it('cleans up a pending transition on unmount', () => {
  vi.useFakeTimers();
  const container = document.createElement('div');
  root = mountWorldCup(container);
  container.querySelector<HTMLButtonElement>('.world-cup-choice')!.click();
  expect(vi.getTimerCount()).toBe(1);

  root.unmount();
  expect(vi.getTimerCount()).toBe(0);
  root.mount();
  vi.runOnlyPendingTimers();
  expect(container.querySelector('[role="status"]')?.textContent).toBe('4강 · 1/2');
});
