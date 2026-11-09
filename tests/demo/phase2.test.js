import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushUpdates } from '../../src/index.js';
import { startPhase2, STORAGE_KEY } from '../../demo/phase2/app.js';

// Phase 2 데모(학습 트래커)의 기능 테스트: 입력·클릭으로 화면이 바뀌는지 확인한다.
let root;
let log;
let storage;
let app;

const SEED = [
  { id: 1, text: 'Virtual DOM 복습', done: true },
  { id: 2, text: 'useState 구현', done: false },
];

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: vi.fn((k) => (k in data ? data[k] : null)),
    setItem: vi.fn((k, v) => {
      data[k] = String(v);
    }),
    data,
  };
}

const $ = (selector) => root.querySelector(selector);
const $$ = (selector) => [...root.querySelectorAll(selector)];
const items = () => $$('[data-role="todo-list"] li').map((li) => li.querySelector('.todo-text').textContent);

async function type(value) {
  const input = $('input[name="todo"]');
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await flushUpdates();
}

async function click(element) {
  element.click();
  await flushUpdates();
}

async function submit() {
  $('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await flushUpdates();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  document.body.innerHTML = '<div id="app"></div><div id="log"></div>';
  root = document.getElementById('app');
  log = document.getElementById('log');
  storage = fakeStorage();
  app = startPhase2({ root, log, storage, initialTodos: SEED });
});

afterEach(() => {
  app.unmount();
  vi.useRealTimers();
});

describe('Phase 2 데모: 학습 트래커', () => {
  it('처음 할 일 목록과 통계를 그린다', () => {
    expect(items()).toEqual(['Virtual DOM 복습', 'useState 구현']);
    expect($('[data-role="stats"]').textContent).toContain('1 / 2');
    expect($('[data-role="stats"]').textContent).toContain('50%');
  });

  it('입력하고 제출하면 할 일이 추가되고 입력칸이 비워진다', async () => {
    await type('useEffect 구현');
    await submit();
    expect(items()).toEqual(['Virtual DOM 복습', 'useState 구현', 'useEffect 구현']);
    expect($('input[name="todo"]').value).toBe('');
    expect($('[data-role="stats"]').textContent).toContain('1 / 3');
  });

  it('빈 입력은 추가하지 않고, 추가 버튼도 비활성이다', async () => {
    await type('   ');
    expect($('button[type="submit"]').disabled).toBe(true);
    await submit();
    expect(items()).toHaveLength(2);
  });

  it('체크하면 그 항목만 바뀌고 다른 항목의 DOM은 그대로 재사용한다', async () => {
    const [first, second] = $$('[data-role="todo-list"] li');
    await click(second.querySelector('input[type="checkbox"]'));
    const after = $$('[data-role="todo-list"] li');
    expect(after[0]).toBe(first);
    expect(after[1]).toBe(second);
    expect(second.classList.contains('done')).toBe(true);
    expect($('[data-role="stats"]').textContent).toContain('2 / 2');
    expect(log.textContent).not.toContain('REPLACE');
  });

  it('삭제 버튼으로 할 일을 지운다', async () => {
    await click($$('[data-role="todo-list"] li')[0].querySelector('button[data-action="remove"]'));
    expect(items()).toEqual(['useState 구현']);
  });

  it('필터를 바꾸면 해당 항목만 보인다', async () => {
    await click($('button[data-filter="done"]'));
    expect(items()).toEqual(['Virtual DOM 복습']);
    await click($('button[data-filter="active"]'));
    expect(items()).toEqual(['useState 구현']);
    await click($('button[data-filter="all"]'));
    expect(items()).toHaveLength(2);
  });

  it('완료 항목 지우기', async () => {
    await click($('button[data-action="clear-done"]'));
    expect(items()).toEqual(['useState 구현']);
  });

  it('할 일이 바뀌면 저장소에 저장하고, 다시 열면 불러온다', async () => {
    await type('저장 테스트');
    await submit();
    const saved = JSON.parse(storage.data[STORAGE_KEY]);
    expect(saved.map((t) => t.text)).toContain('저장 테스트');

    app.unmount();
    root.innerHTML = '';
    app = startPhase2({ root, log, storage, initialTodos: [] });
    expect(items()).toContain('저장 테스트');
  });

  it('저장값에 잘못된 항목이나 중복 id가 있으면 걸러 내고 그린다', () => {
    app.unmount();
    root.innerHTML = '';
    const broken = fakeStorage({
      [STORAGE_KEY]: JSON.stringify([
        null,
        { id: 1, text: '정상', done: false },
        { id: 1, text: '중복 id', done: true },
        { id: 'x', text: 'id가 문자열', done: false },
        { id: 2, text: 3, done: false },
        { id: 3, text: '완료 표시가 없음' },
      ]),
    });
    app = startPhase2({ root, log, storage: broken, initialTodos: [] });
    expect(items()).toEqual(['정상']);
  });

  it('저장값이 전부 잘못됐으면 기본 목록으로 시작한다', () => {
    app.unmount();
    root.innerHTML = '';
    app = startPhase2({ root, log, storage: fakeStorage({ [STORAGE_KEY]: '[null, 1]' }), initialTodos: SEED });
    expect(items()).toEqual(['Virtual DOM 복습', 'useState 구현']);
  });

  it('집중 타이머: 시작하면 1초마다 늘고, 멈추면 그대로, 초기화하면 0', async () => {
    const time = () => $('[data-role="timer"]').textContent;
    await click($('button[data-action="timer-toggle"]'));
    vi.advanceTimersByTime(3000);
    await flushUpdates();
    expect(time()).toBe('00:03');
    await click($('button[data-action="timer-toggle"]'));
    vi.advanceTimersByTime(5000);
    await flushUpdates();
    expect(time()).toBe('00:03');
    await click($('button[data-action="timer-reset"]'));
    expect(time()).toBe('00:00');
  });

  it('unmount하면 타이머 정리 함수가 불려 더 이상 돌지 않는다', async () => {
    await click($('button[data-action="timer-toggle"]'));
    app.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('타이머가 한 칸 갈 때 실제 DOM 변경은 시간 텍스트 하나뿐이다', async () => {
    await click($('button[data-action="timer-toggle"]'));
    vi.advanceTimersByTime(1000);
    await flushUpdates();
    const domPatches = [...log.querySelectorAll('[data-role="dom-patches"] li')].map((li) => li.textContent);
    expect(domPatches).toEqual(['TEXT "00:00" → "00:01"']);
  });

  it('옆 패널의 hooks 배열은 effect까지 실행된 뒤의 상태다', async () => {
    const lastHook = () => [...log.querySelectorAll('[data-role="hooks"] li')].at(-1).textContent;
    await click($('button[data-action="timer-toggle"]'));
    expect(lastHook()).toContain('[true]');
    expect(lastHook()).toContain('정리 함수 있음');
    await click($('button[data-action="timer-toggle"]'));
    expect(lastHook()).toContain('[false]');
    expect(lastHook()).not.toContain('정리 함수 있음');
  });

  it('렌더마다 패치 목록과 hooks 배열 상태를 옆 패널에 보여 준다', async () => {
    await type('a');
    expect(log.querySelector('[data-role="commit-count"]').textContent).toContain('2');
    expect(log.querySelector('[data-role="hooks"]').textContent).toContain('useState');
    expect(log.querySelector('[data-role="hooks"]').textContent).toContain('"a"');
  });

  it('렌더마다 새로 만든 인라인 핸들러의 교체 수를 "DOM 변경 없음"으로 따로 알려 준다', async () => {
    await type('a');
    const note = log.querySelector('.note');
    expect(note).not.toBeNull();
    expect(Number(note.textContent.match(/(\d+)건/)[1])).toBeGreaterThan(0);
  });
});
