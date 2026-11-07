import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { bindPhaseTabs } from '../src/phase-tabs';

let phase1: HTMLButtonElement;
let phase2: HTMLButtonElement;
let dom: HTMLElement;
let hooks: HTMLElement;

function renderTabs(): void {
  document.body.innerHTML = `
    <div role="tablist">
      <button role="tab" aria-controls="dom" aria-selected="true">Phase 1</button>
      <button role="tab" aria-controls="hooks" aria-selected="false" tabindex="-1">Phase 2</button>
    </div>
    <section id="dom" role="tabpanel"></section>
    <section id="hooks" role="tabpanel" hidden></section>
  `;
  [phase1, phase2] = document.querySelectorAll('button');
  dom = document.querySelector('#dom')!;
  hooks = document.querySelector('#hooks')!;
  bindPhaseTabs(document.querySelector('[role="tablist"]')!);
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
  expect([dom.hidden, hooks.hidden]).toEqual([true, false]);
  expect([phase1.tabIndex, phase2.tabIndex]).toEqual([-1, 0]);
  expect(phase2.getAttribute('aria-selected')).toBe('true');
  phase1.click();
  expect([dom.hidden, hooks.hidden]).toEqual([false, true]);
  expect([phase1.tabIndex, phase2.tabIndex]).toEqual([0, -1]);
  expect(phase2.getAttribute('aria-selected')).toBe('false');
});

it('restores the selected panel and its keyboard tab stop when the page is rebuilt', () => {
  phase2.click();
  renderTabs();

  expect([dom.hidden, hooks.hidden]).toEqual([true, false]);
  expect([phase1.tabIndex, phase2.tabIndex]).toEqual([-1, 0]);
  expect(phase2.getAttribute('aria-selected')).toBe('true');
});

it('keeps the default panel when the stored panel no longer exists', () => {
  sessionStorage.setItem('mini-react:active-panel', 'removed-panel');
  renderTabs();
  expect([dom.hidden, hooks.hidden]).toEqual([false, true]);
});

it('still switches panels when session storage is blocked', () => {
  vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
    throw new DOMException('Storage is blocked', 'SecurityError');
  });
  renderTabs();
  expect([dom.hidden, hooks.hidden]).toEqual([false, true]);
  phase2.click();
  expect([dom.hidden, hooks.hidden]).toEqual([true, false]);
});

it.each([
  ['ArrowUp', 0, 1],
  ['ArrowDown', 1, 0],
  ['Home', 1, 0],
  ['End', 0, 1],
])('moves focus and selection with %s', (key, from, to) => {
  const tabs = [phase1, phase2];
  tabs[from].click();
  tabs[from].focus();
  const event = new KeyboardEvent('keydown', { key, cancelable: true });
  tabs[from].dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(tabs[to]);
  expect(tabs[to].getAttribute('aria-selected')).toBe('true');
});
