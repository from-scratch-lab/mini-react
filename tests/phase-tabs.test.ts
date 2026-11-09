import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { bindPhaseTabs } from '../src/phase-tabs';

let phase1: HTMLButtonElement;
let phase2: HTMLButtonElement;
let worldCupTab: HTMLButtonElement;
let closeWorldCup: HTMLButtonElement;
let dom: HTMLElement;
let hooks: HTMLElement;
let worldCup: HTMLElement;

function renderTabs(): void {
  document.body.innerHTML = `
    <div role="tablist">
      <button role="tab" aria-controls="dom" aria-selected="true">Phase 1</button>
      <button role="tab" aria-controls="hooks" aria-selected="false" tabindex="-1">Phase 2</button>
      <button role="tab" aria-controls="world-cup" aria-selected="false" tabindex="-1" hidden>Phase2.1(이상형 월드컵)</button>
    </div>
    <button type="button" hidden>이상형 월드컵 닫기</button>
    <section id="dom" role="tabpanel"></section>
    <section id="hooks" role="tabpanel" hidden></section>
    <section id="world-cup" role="tabpanel" hidden></section>
  `;
  [phase1, phase2, worldCupTab, closeWorldCup] = document.querySelectorAll('button');
  dom = document.querySelector('#dom')!;
  hooks = document.querySelector('#hooks')!;
  worldCup = document.querySelector('#world-cup')!;
  bindPhaseTabs(document.querySelector('[role="tablist"]')!, worldCupTab, closeWorldCup);
}

function unlockWorldCup(): void {
  phase2.click();
  phase1.click();
  phase2.click();
  phase1.click();
}

beforeEach(() => {
  sessionStorage.clear();
  renderTabs();
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

it('selects one panel at a time and keeps only its tab in the tab order', () => {
  phase2.click();
  expect([dom.hidden, hooks.hidden, worldCup.hidden]).toEqual([true, false, true]);
  expect([phase1.tabIndex, phase2.tabIndex, worldCupTab.tabIndex]).toEqual([-1, 0, -1]);
  expect(phase2.getAttribute('aria-selected')).toBe('true');
  phase1.click();
  phase2.click();
  phase1.click();
  expect([dom.hidden, hooks.hidden, worldCup.hidden]).toEqual([true, true, false]);
  expect([phase1.tabIndex, phase2.tabIndex, worldCupTab.tabIndex]).toEqual([-1, -1, 0]);
  expect(worldCupTab.getAttribute('aria-selected')).toBe('true');
  phase1.click();
  expect([dom.hidden, hooks.hidden, worldCup.hidden]).toEqual([false, true, true]);
  expect([phase1.tabIndex, phase2.tabIndex, worldCupTab.tabIndex]).toEqual([0, -1, -1]);
  expect(worldCupTab.getAttribute('aria-selected')).toBe('false');
});

it('restores the selected panel and its keyboard tab stop when the page is rebuilt', () => {
  unlockWorldCup();
  renderTabs();

  expect(worldCupTab.hidden).toBe(false);
  expect(closeWorldCup.hidden).toBe(false);
  expect([dom.hidden, hooks.hidden, worldCup.hidden]).toEqual([true, true, false]);
  expect([phase1.tabIndex, phase2.tabIndex, worldCupTab.tabIndex]).toEqual([-1, -1, 0]);
  expect(worldCupTab.getAttribute('aria-selected')).toBe('true');
});

it('closes the active World Cup, restores Phase 1 focus and requires a new full sequence', () => {
  expect(closeWorldCup.hidden).toBe(true);
  unlockWorldCup();
  expect(closeWorldCup.hidden).toBe(false);

  closeWorldCup.click();
  expect([worldCupTab.hidden, closeWorldCup.hidden, worldCup.hidden]).toEqual([true, true, true]);
  expect(phase1.getAttribute('aria-selected')).toBe('true');
  expect(document.activeElement).toBe(phase1);

  phase2.click();
  phase1.click();
  phase2.click();
  expect(worldCupTab.hidden).toBe(true);
  phase1.click();
  expect(worldCup.hidden).toBe(false);
});

it('keeps the current phase selected when closing the inactive World Cup and after reload', () => {
  unlockWorldCup();
  phase2.click();
  closeWorldCup.click();
  expect(hooks.hidden).toBe(false);
  expect(document.activeElement).toBe(phase2);

  renderTabs();
  expect([worldCupTab.hidden, closeWorldCup.hidden, worldCup.hidden]).toEqual([true, true, true]);
  expect(phase2.getAttribute('aria-selected')).toBe('true');
  expect(hooks.hidden).toBe(false);
});

it.each(['removed-panel', 'world-cup'])('keeps the default panel when the stored panel %s is unavailable', panel => {
  sessionStorage.setItem('mini-react:active-panel', panel);
  renderTabs();
  expect(worldCupTab.hidden).toBe(true);
  expect([dom.hidden, hooks.hidden, worldCup.hidden]).toEqual([false, true, true]);
});

it('unlocks and focuses the World Cup tab at three seconds and ignores repeated clicks', () => {
  const now = vi.spyOn(performance, 'now').mockReturnValue(0);
  phase1.click();
  worldCupTab.click();
  expect(worldCupTab.hidden).toBe(true);
  expect(worldCup.hidden).toBe(true);

  phase2.click();
  phase2.click();
  phase1.click();
  now.mockReturnValue(1500);
  phase2.click();
  expect(worldCupTab.hidden).toBe(true);

  now.mockReturnValue(3000);
  phase1.click();
  expect(worldCupTab.hidden).toBe(false);
  expect(worldCup.hidden).toBe(false);
  expect(document.activeElement).toBe(worldCupTab);
});

it('rejects a sequence longer than three seconds and recognizes the next fast sequence', () => {
  const now = vi.spyOn(performance, 'now').mockReturnValue(0);
  phase2.click();
  now.mockReturnValue(100);
  phase1.click();
  now.mockReturnValue(200);
  phase2.click();
  now.mockReturnValue(3001);
  phase1.click();
  expect(dom.hidden).toBe(false);
  expect(worldCupTab.hidden).toBe(true);

  now.mockReturnValue(3100);
  phase2.click();
  phase1.click();
  expect(worldCup.hidden).toBe(false);
});

it('still switches panels and closes the World Cup when session storage is blocked', () => {
  vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
    throw new DOMException('Storage is blocked', 'SecurityError');
  });
  renderTabs();
  expect([dom.hidden, hooks.hidden, worldCup.hidden]).toEqual([false, true, true]);
  phase2.click();
  expect([dom.hidden, hooks.hidden, worldCup.hidden]).toEqual([true, false, true]);
  phase1.click();
  phase2.click();
  phase1.click();
  expect(worldCup.hidden).toBe(false);
  closeWorldCup.click();
  expect(worldCup.hidden).toBe(true);
});

it.each([
  ['ArrowUp', 0, 1],
  ['ArrowDown', 1, 0],
  ['End', 0, 1],
])('skips the hidden World Cup tab with %s', (key, from, to) => {
  const tabs = [phase1, phase2];
  tabs[from].click();
  tabs[from].focus();
  const event = new KeyboardEvent('keydown', { key, cancelable: true });
  tabs[from].dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(tabs[to]);
  expect(tabs[to].getAttribute('aria-selected')).toBe('true');
  expect(worldCupTab.hidden).toBe(true);
});

it.each([
  ['ArrowUp', 0, 2],
  ['ArrowDown', 1, 2],
  ['ArrowDown', 2, 0],
  ['Home', 2, 0],
  ['End', 0, 2],
])('moves focus and selection with %s', (key, from, to) => {
  unlockWorldCup();
  const tabs = [phase1, phase2, worldCupTab];
  tabs[from].click();
  tabs[from].focus();
  const event = new KeyboardEvent('keydown', { key, cancelable: true });
  tabs[from].dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(tabs[to]);
  expect(tabs[to].getAttribute('aria-selected')).toBe('true');
});
