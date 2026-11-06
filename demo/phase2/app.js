import { createElement as h, mountComponent, render, useState, useEffect, useMemo } from '../../src/index.js';
import { describePatch } from '../phase1/describe.js';

export const STORAGE_KEY = 'mini-react:study-tracker';

const FILTERS = [
  ['all', '전체'],
  ['active', '진행 중'],
  ['done', '완료'],
];

/* ───────────── 루트 컴포넌트: 상태와 훅은 여기에만 ───────────── */

/**
 * 상태는 모두 루트(App)가 가지고, 자식에게는 값과 "상태를 바꾸는 함수"를 props로 내려준다(Lifting State Up).
 * 자식 컴포넌트는 props만 보고 가상 트리를 돌려주는 순수 함수다.
 */
export function App({ storage, initialTodos }) {
  const [todos, setTodos] = useState(() => loadTodos(storage) ?? initialTodos);
  const [draft, setDraft] = useState('');
  const [filter, setFilter] = useState('all');
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);

  // todos가 바뀔 때만 다시 계산한다. 입력칸에 글자를 칠 때(draft만 바뀔 때)는 이전 결과를 그대로 쓴다.
  const stats = useMemo(() => {
    const done = todos.filter((t) => t.done).length;
    return { total: todos.length, done, percent: todos.length ? Math.round((done / todos.length) * 100) : 0 };
  }, [todos]);
  const visible = useMemo(
    () => todos.filter((t) => (filter === 'all' ? true : filter === 'done' ? t.done : !t.done)),
    [todos, filter],
  );

  // 부수 효과 1: 저장. 렌더 중이 아니라 화면 반영 뒤에, todos가 바뀌었을 때만.
  useEffect(() => {
    saveTodos(storage, todos);
  }, [todos]);

  // 부수 효과 2: 타이머. running이 바뀔 때마다 이전 interval을 정리하고 새로 건다.
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  const addTodo = () => {
    const text = draft.trim();
    if (!text) return;
    // 같은 이벤트 안의 setState 두 번 → 렌더는 한 번(배칭)
    setTodos((list) => [...list, { id: nextId(list), text, done: false }]);
    setDraft('');
  };
  const toggleTodo = (id) => setTodos((list) => list.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  const removeTodo = (id) => setTodos((list) => list.filter((t) => t.id !== id));
  const clearDone = () => setTodos((list) => list.filter((t) => !t.done));

  return h(
    'div',
    { class: 'tracker' },
    h(Header, { stats }),
    h(TodoForm, { draft, onDraft: setDraft, onSubmit: addTodo }),
    h(FilterBar, { filter, onChange: setFilter, onClearDone: clearDone, canClear: stats.done > 0 }),
    h(TodoList, { todos: visible, onToggle: toggleTodo, onRemove: removeTodo, filter }),
    h(FocusTimer, {
      seconds,
      running,
      onToggle: () => setRunning((r) => !r),
      onReset: () => {
        setRunning(false);
        setSeconds(0);
      },
    }),
  );
}

/* ───────────── 자식 컴포넌트: 상태 없는 순수 함수 ───────────── */

function Header({ stats }) {
  return h(
    'header',
    { class: 'tracker-head' },
    h('h2', null, '정글 학습 트래커'),
    h(
      'div',
      { class: 'stats', 'data-role': 'stats' },
      h('span', null, `완료 ${stats.done} / ${stats.total}`),
      h('strong', null, `${stats.percent}%`),
    ),
    h(ProgressBar, { percent: stats.percent }),
  );
}

function ProgressBar({ percent }) {
  return h(
    'div',
    { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(percent) },
    h('div', { class: 'progress-fill', style: { width: `${percent}%` } }),
  );
}

function TodoForm({ draft, onDraft, onSubmit }) {
  return h(
    'form',
    {
      class: 'todo-form',
      onSubmit: (event) => {
        event.preventDefault();
        onSubmit();
      },
    },
    h('input', {
      name: 'todo',
      value: draft,
      placeholder: '오늘 공부할 것',
      autocomplete: 'off',
      'aria-label': '새 할 일',
      onInput: (event) => onDraft(event.target.value),
    }),
    h('button', { type: 'submit', class: 'primary', disabled: draft.trim() === '' }, '추가'),
  );
}

function FilterBar({ filter, onChange, onClearDone, canClear }) {
  return h(
    'div',
    { class: 'filters' },
    FILTERS.map(([value, label]) =>
      h(
        'button',
        {
          key: value,
          type: 'button',
          'data-filter': value,
          class: value === filter ? 'current' : null,
          'aria-pressed': value === filter ? 'true' : 'false',
          onClick: () => onChange(value),
        },
        label,
      ),
    ),
    h(
      'button',
      { type: 'button', class: 'ghost', 'data-action': 'clear-done', disabled: !canClear, onClick: onClearDone },
      '완료 항목 지우기',
    ),
  );
}

function TodoList({ todos, onToggle, onRemove, filter }) {
  if (todos.length === 0) {
    const message = filter === 'done' ? '완료한 항목이 없습니다.' : '할 일이 없습니다. 위에서 추가해 보세요.';
    return h('p', { class: 'empty', 'data-role': 'todo-list' }, message);
  }
  return h(
    'ul',
    { class: 'todo-list', 'data-role': 'todo-list' },
    todos.map((todo) => h(TodoItem, { key: todo.id, todo, onToggle, onRemove })),
  );
}

function TodoItem({ todo, onToggle, onRemove }) {
  return h(
    'li',
    { class: todo.done ? 'done' : null },
    h(
      'label',
      null,
      h('input', { type: 'checkbox', checked: todo.done, onChange: () => onToggle(todo.id) }),
      h('span', { class: 'todo-text' }, todo.text),
    ),
    h(
      'button',
      { type: 'button', class: 'ghost', 'data-action': 'remove', 'aria-label': `${todo.text} 삭제`, onClick: () => onRemove(todo.id) },
      '삭제',
    ),
  );
}

function FocusTimer({ seconds, running, onToggle, onReset }) {
  return h(
    'section',
    { class: 'timer' },
    h('h3', null, '집중 타이머'),
    h('output', { class: 'timer-value', 'data-role': 'timer' }, formatTime(seconds)),
    h(
      'div',
      { class: 'timer-buttons' },
      h('button', { type: 'button', class: 'primary', 'data-action': 'timer-toggle', onClick: onToggle }, running ? '멈춤' : '시작'),
      h('button', { type: 'button', 'data-action': 'timer-reset', onClick: onReset }, '초기화'),
    ),
  );
}

/* ───────────── 옆 패널: 렌더마다 패치 목록과 hooks 배열 ───────────── */

// 이벤트 핸들러(함수)만 바뀐 PROPS 패치. 인라인 함수는 렌더마다 새로 만들어지므로 매번 생기지만,
// patch는 요소에 달린 핸들러 표만 바꿀 뿐 실제 DOM(속성·트리)은 건드리지 않는다.
function isHandlerOnly(p) {
  if (p.type !== 'PROPS') return false;
  const names = [...Object.keys(p.set), ...p.remove];
  return names.every((name) => name.startsWith('on') && (typeof p.set[name] === 'function' || typeof p.prev[name] === 'function'));
}

function InspectorView({ commit, patches, hooks }) {
  const domPatches = patches.filter((p) => !isHandlerOnly(p));
  const handlerCount = patches.length - domPatches.length;
  return h(
    'div',
    { class: 'inspector' },
    h(
      'h3',
      null,
      '렌더 ',
      h('span', { 'data-role': 'commit-count' }, `#${commit}`),
      ` · DOM 변경 패치 ${domPatches.length}개`,
    ),
    h(
      'ol',
      { class: 'patch-list', 'data-role': 'dom-patches' },
      domPatches.length === 0
        ? h('li', { class: 'empty' }, '변경 없음 (다시 렌더했지만 바뀐 DOM이 없음)')
        : domPatches.map((p) => h('li', null, h('span', { class: `op op-${p.type.toLowerCase()}` }, p.type), ' ', describePatch(p))),
    ),
    handlerCount > 0
      ? h('p', { class: 'note' }, `+ 이벤트 핸들러 교체 ${handlerCount}건 (인라인 함수가 렌더마다 새로 만들어짐 · DOM 변경 없음)`)
      : null,
    h('h3', null, 'hooks 배열'),
    h(
      'ol',
      { class: 'hook-list', 'data-role': 'hooks', start: '0' },
      hooks.map((hook) => h('li', null, h('code', null, hook.kind), ' ', describeHook(hook))),
    ),
  );
}

function describeHook(hook) {
  if (hook.kind === 'useState') return short(hook.value);
  if (hook.kind === 'useMemo') return `${short(hook.value)} · deps ${short(hook.deps)}`;
  return `deps ${short(hook.deps)}${hook.cleanup ? ' · 정리 함수 있음' : ''}`;
}

function short(value, max = 60) {
  const text = JSON.stringify(value) ?? String(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/* ───────────── 시작 ───────────── */

/**
 * @param {{ root: Element, log?: Element, storage?: Storage, initialTodos?: Array }} options
 * @returns {import('../../src/hooks/component.js').FunctionComponent}
 */
export function startPhase2({ root, log, storage, initialTodos = DEFAULT_TODOS }) {
  let commit = 0;
  const component = mountComponent(App, root, { storage, initialTodos }, {
    onCommit(patches, c) {
      commit += 1;
      // 옆 패널은 별도의 루트로 그린다. 앱 트리에 넣으면 패널이 바뀔 때마다 또 렌더가 일어나 끝없이 이어진다.
      // Phase 1의 render는 태그·텍스트 트리만 그리므로 순수 함수인 InspectorView를 직접 불러 넘긴다.
      if (log) render(InspectorView({ commit, patches, hooks: c.hooks }), log);
    },
    onError(error) {
      console.error(error);
    },
  });
  const unmount = component.unmount.bind(component);
  component.unmount = () => {
    try {
      unmount();
    } finally {
      if (log) render(null, log);
    }
  };
  return component;
}

const DEFAULT_TODOS = [
  { id: 1, text: 'Virtual DOM 구조 복습', done: true },
  { id: 2, text: 'Diff 다섯 가지 경우 설명하기', done: true },
  { id: 3, text: 'useState가 상태를 유지하는 원리', done: false },
  { id: 4, text: 'useEffect 정리 함수 실험', done: false },
];

function nextId(list) {
  return list.reduce((max, t) => Math.max(max, t.id), 0) + 1;
}

function formatTime(total) {
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function loadTodos(storage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function saveTodos(storage, todos) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(todos));
  } catch {
    // 저장소를 쓸 수 없는 환경(사생활 보호 모드 등)에서는 저장만 건너뛴다.
  }
}
