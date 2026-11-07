import {
  createElement as h,
  FunctionComponent,
  mountComponent,
  useState,
  useEffect,
  useMemo,
  vnodeToHTML,
} from '../../src/index.js';
import { describePatch } from '../shared/describe.js';
import { flash } from '../shared/flash.js';
import { ConceptCard, reorderInfo } from './concepts.js';

/*
 * 종합 데모: Phase 1(Virtual DOM·Diff·Patch)과 Phase 2(Component·Hooks)가 하나로 이어진 모습을 보여 준다.
 *
 *   ① setState        → 상태(hooks 배열)가 바뀐다
 *   ② 컴포넌트 다시 실행 → 새 가상 트리
 *   ③ diff(이전, 새)    → 패치 목록
 *   ④ patch            → 바뀐 실제 DOM만 고친다 (MutationObserver로 세고 강조)
 *
 * 왼쪽 앱과 오른쪽 파이프라인 패널 모두 이 프로젝트의 FunctionComponent와 훅으로 그린다.
 */

const INITIAL_ITEMS = [
  { id: 1, title: 'Virtual DOM 구조 설계', points: 3, priority: false },
  { id: 2, title: 'Diff 5가지 경우', points: 5, priority: true },
  { id: 3, title: 'key + LIS 재정렬', points: 8, priority: false },
  { id: 4, title: 'useState 배칭', points: 3, priority: false },
  { id: 5, title: 'useEffect 정리 함수', points: 2, priority: false },
];

const MAX_COMMITS = 60;

/* ───────────── 왼쪽: 스프린트 백로그 앱 (상태는 루트에만) ───────────── */

/**
 * @param {(label: string, concept: string) => void} track 다음 렌더가 "무엇 때문에" 일어났고 어떤 개념(설명 카드)에 해당하는지 패널에 알리는 함수
 * @param {() => Element} getRoot 편집 칸에 포커스를 줄 때 쓰는 앱 루트
 */
function createBacklogApp(track, getRoot) {
  return function BacklogApp() {
    // 목록은 기록(past·present·future)째 상태로 둔다. 상태를 바꾸지 않고 새 배열을 만들어 왔기 때문에(불변),
    // 이전 배열을 그대로 쌓아 두기만 하면 뒤로가기·앞으로가기가 된다.
    const [history, setHistory] = useState(() => ({ past: [], present: INITIAL_ITEMS, future: [] }));
    const items = history.present;
    // 목록을 바꾸는 setState. 실제로 바뀌면 이전 목록을 past에 쌓고, 새 갈래가 생겼으니 future는 비운다.
    const setItems = (updater) =>
      setHistory((hist) => {
        const next = updater(hist.present);
        return next === hist.present ? hist : { past: [...hist.past, hist.present], present: next, future: [] };
      });
    const [draft, setDraft] = useState('');
    const [editing, setEditing] = useState(null); // { id, text } | null
    const [useKeys, setUseKeys] = useState(true);
    // 지운 항목의 id를 다시 쓰지 않도록 따로 늘린다. (다시 쓰면 key·편집 상태가 엉뚱한 새 항목에 붙는다)
    const [nextId, setNextId] = useState(() => INITIAL_ITEMS.reduce((m, i) => Math.max(m, i.id), 0) + 1);

    const total = useMemo(() => items.reduce((sum, item) => sum + item.points, 0), [items]);
    const priorityCount = useMemo(() => items.filter((item) => item.priority).length, [items]);

    // 편집을 시작하면(span → input으로 REPLACE된 뒤) 입력칸에 포커스를 준다. 포커스는 DOM 변경이 아니라 부수 효과라 effect에서.
    const editingId = editing?.id ?? null;
    useEffect(() => {
      if (editingId != null) getRoot().querySelector('.title-input')?.focus();
    }, [editingId]);

    const undo = () => {
      setHistory((hist) =>
        hist.past.length === 0
          ? hist
          : { past: hist.past.slice(0, -1), present: hist.past[hist.past.length - 1], future: [hist.present, ...hist.future] },
      );
      setEditing(null);
    };
    const redo = () => {
      setHistory((hist) =>
        hist.future.length === 0
          ? hist
          : { past: [...hist.past, hist.present], present: hist.future[0], future: hist.future.slice(1) },
      );
      setEditing(null);
    };

    // 단축키 Ctrl+Z / Ctrl+Shift+Z. 문서에 리스너를 다는 것은 부수 효과라 effect에서 하고, 정리 함수에서 뗀다.
    // 처음 한 번만 달면 되므로 deps는 []. 핸들러가 함수형 업데이트만 써서 낡은 상태를 붙잡지 않는다.
    useEffect(() => {
      const doc = getRoot().ownerDocument;
      const onKeyDown = (event) => {
        if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z' || event.isComposing) return;
        const target = event.target;
        if (target && (target.localName === 'input' || target.localName === 'textarea' || target.isContentEditable)) return;
        event.preventDefault();
        if (event.shiftKey) {
          track('앞으로가기 (Ctrl+Shift+Z)', 'undo');
          redo();
        } else {
          track('뒤로가기 (Ctrl+Z)', 'undo');
          undo();
        }
      };
      doc.addEventListener('keydown', onKeyDown);
      return () => doc.removeEventListener('keydown', onKeyDown);
    }, []);

    const update = (id, change) => setItems((list) => list.map((item) => (item.id === id ? { ...item, ...change(item) } : item)));
    const move = (id, delta) =>
      setItems((list) => {
        const from = list.findIndex((item) => item.id === id);
        const to = from + delta;
        if (from < 0 || to < 0 || to >= list.length) return list; // 같은 배열 → 렌더 없음
        const next = [...list];
        [next[from], next[to]] = [next[to], next[from]];
        return next;
      });

    const handlers = {
      add() {
        const title = draft.trim();
        if (!title) return;
        track(`"${title}" 추가`, 'create');
        setItems((list) => [...list, { id: nextId, title, points: 1, priority: false }]);
        setNextId((n) => n + 1);
        setDraft('');
      },
      remove(item) {
        track(`"${item.title}" 삭제`, 'remove');
        setItems((list) => list.filter((i) => i.id !== item.id));
        setEditing((e) => (e?.id === item.id ? null : e)); // 지운 항목을 편집 중이었다면 편집도 끝낸다
      },
      up(item) {
        track(`"${item.title}" 위로`, useKeys ? 'reorder' : 'reorderNoKey');
        move(item.id, -1);
      },
      down(item) {
        track(`"${item.title}" 아래로`, useKeys ? 'reorder' : 'reorderNoKey');
        move(item.id, 1);
      },
      points(item) {
        track(`"${item.title}" 점수 +1`, 'text');
        update(item.id, (i) => ({ points: i.points + 1 }));
      },
      priority(item) {
        track(`"${item.title}" 우선순위 ${item.priority ? '해제' : '표시'}`, 'props');
        update(item.id, (i) => ({ priority: !i.priority }));
      },
      startEdit(item) {
        track(`"${item.title}" 편집 시작`, 'replace');
        setEditing({ id: item.id, text: item.title });
      },
      editText(text) {
        track('편집 중 입력', 'input');
        setEditing((e) => (e ? { ...e, text } : e));
      },
      saveEdit() {
        if (!editing) return;
        const title = editing.text.trim();
        track('편집 저장', 'replace');
        if (title) update(editing.id, () => ({ title }));
        setEditing(null);
      },
      cancelEdit() {
        track('편집 취소', 'replace');
        setEditing(null);
      },
      rotate() {
        track('맨 아래 → 맨 위', useKeys ? 'reorder' : 'reorderNoKey');
        setItems((list) => (list.length < 2 ? list : [list[list.length - 1], ...list.slice(0, -1)]));
      },
      reverse() {
        track('순서 뒤집기', useKeys ? 'reorder' : 'reorderNoKey');
        setItems((list) => keepIfSameOrder(list, [...list].reverse()));
      },
      sort() {
        track('점수순 정렬', useKeys ? 'reorder' : 'reorderNoKey');
        setItems((list) => keepIfSameOrder(list, [...list].sort((a, b) => b.points - a.points)));
      },
      batch() {
        // 한 이벤트 안에서 setState 3번 → 렌더는 한 번(배칭)
        track('setState 3번 (배칭 → 렌더 1번)', 'batch');
        for (let i = 0; i < 3; i += 1) {
          setItems((list) => (list.length ? [{ ...list[0], points: list[0].points + 1 }, ...list.slice(1)] : list));
        }
      },
      undo() {
        track('뒤로가기', 'undo');
        undo();
      },
      redo() {
        track('앞으로가기', 'undo');
        redo();
      },
      reset() {
        track('초기화', 'reset');
        // 처음 목록으로 돌아가는 것도 하나의 변경으로 기록해, 초기화도 뒤로가기로 되돌릴 수 있게 한다.
        setHistory((hist) =>
          hist.present === INITIAL_ITEMS ? hist : { past: [...hist.past, hist.present], present: INITIAL_ITEMS, future: [] },
        );
        setEditing(null);
        setDraft('');
        setUseKeys(true);
      },
      toggleKeys() {
        track(useKeys ? 'key 끄기 (위치로 비교)' : 'key 켜기', 'keyToggle');
        setUseKeys((v) => !v);
      },
      draft(text) {
        track('새 항목 입력', 'input');
        setDraft(text);
      },
    };

    return h(
      'div',
      { class: 'backlog-app' },
      h(Toolbar, { useKeys, handlers, canUndo: history.past.length > 0, canRedo: history.future.length > 0 }),
      h(AddForm, { draft, handlers }),
      h(BacklogList, { items, useKeys, editing, handlers }),
      h(Summary, { count: items.length, total, priorityCount }),
    );
  };
}

// 순서가 그대로면 이전 배열을 돌려준다. 새 배열이면 내용이 같아도 useState가 "바뀜"으로 보고 다시 렌더한다.
function keepIfSameOrder(list, next) {
  return next.every((item, i) => item === list[i]) ? list : next;
}

function Toolbar({ useKeys, handlers, canUndo, canRedo }) {
  const button = (action, label, onClick, extra = {}) =>
    h('button', { type: 'button', 'data-action': action, onClick, ...extra }, label);
  return h(
    'div',
    { class: 'toolbar' },
    h(
      'div',
      { class: 'history-keys', role: 'group', 'aria-label': '기록' },
      button('undo', '← 뒤로가기', handlers.undo, { disabled: !canUndo, title: 'Ctrl+Z' }),
      button('redo', '앞으로가기 →', handlers.redo, { disabled: !canRedo, title: 'Ctrl+Shift+Z' }),
      button('reset', '초기화', handlers.reset),
    ),
    button('rotate', '맨 아래 → 맨 위', handlers.rotate),
    button('reverse', '순서 뒤집기', handlers.reverse),
    button('sort', '점수순 정렬', handlers.sort),
    button('batch', '첫 항목 +1 ×3 (배칭)', handlers.batch),
    h(
      'label',
      { class: 'key-toggle' },
      h('input', { type: 'checkbox', 'data-action': 'toggle-keys', checked: useKeys, onChange: handlers.toggleKeys }),
      ' key로 비교',
    ),
  );
}

function AddForm({ draft, handlers }) {
  return h(
    'form',
    {
      class: 'add-form',
      onSubmit: (event) => {
        event.preventDefault();
        handlers.add();
      },
    },
    h('input', {
      name: 'title',
      value: draft,
      placeholder: '새 백로그 항목',
      autocomplete: 'off',
      'aria-label': '새 백로그 항목',
      onInput: (event) => handlers.draft(event.target.value),
    }),
    h('button', { type: 'submit', class: 'primary', disabled: draft.trim() === '' }, '추가'),
  );
}

function BacklogList({ items, useKeys, editing, handlers }) {
  if (items.length === 0) return h('p', { class: 'empty', 'data-role': 'backlog' }, '항목이 없습니다.');
  return h(
    'ol',
    { class: 'backlog', 'data-role': 'backlog' },
    items.map((item) =>
      h(BacklogItem, {
        key: useKeys ? item.id : undefined,
        item,
        editing: editing && editing.id === item.id ? editing : null,
        handlers,
      }),
    ),
  );
}

function BacklogItem({ item, editing, handlers }) {
  const act = (action, label, onClick, extra = {}) =>
    h('button', { type: 'button', class: 'ghost', 'data-action': action, onClick, ...extra }, label);
  return h(
    'li',
    { class: item.priority ? 'priority' : null },
    // 편집 중이면 span 자리에 input이 온다 → 태그가 달라 diff가 REPLACE로 처리한다
    editing
      ? h('input', {
          class: 'title-input',
          value: editing.text,
          'aria-label': '제목 편집',
          onInput: (event) => handlers.editText(event.target.value),
          onKeyDown: (event) => {
            if (event.isComposing) return; // 한글 조합을 끝내는 Enter는 저장이 아니다
            if (event.key === 'Enter') handlers.saveEdit();
            else if (event.key === 'Escape') handlers.cancelEdit();
          },
        })
      : h('span', { class: 'title' }, item.title),
    h('span', { class: 'points' }, `${item.points}점`),
    h(
      'div',
      { class: 'row-actions' },
      act('priority', item.priority ? '★' : '☆', () => handlers.priority(item), { 'aria-label': '우선순위' }),
      act('points', '+1', () => handlers.points(item), { 'aria-label': '점수 올리기' }),
      act('up', '↑', () => handlers.up(item), { 'aria-label': '위로' }),
      act('down', '↓', () => handlers.down(item), { 'aria-label': '아래로' }),
      editing ? act('edit', '저장', handlers.saveEdit) : act('edit', '편집', () => handlers.startEdit(item)),
      act('remove', '삭제', () => handlers.remove(item)),
    ),
  );
}

function Summary({ count, total, priorityCount }) {
  return h('p', { class: 'summary', 'data-role': 'summary' }, `총 ${count}개 · ${total}점 · 우선 ${priorityCount}개`);
}

/* ───────────── 오른쪽: 렌더 파이프라인 패널 ───────────── */

function PipelineInspector({ commits }) {
  const [selected, setSelected] = useState(null); // null이면 항상 최신 렌더를 보여 준다
  const commit = (selected != null && commits.find((c) => c.n === selected)) || commits.at(-1);
  if (!commit) return h('p', { class: 'empty' }, '아직 렌더가 없습니다.');

  return h(
    'div',
    { class: 'pipeline' },
    h(
      'div',
      { class: 'pipeline-head' },
      h('h2', null, '렌더 파이프라인'),
      h('span', { class: 'commit-title', 'data-role': 'commit-title' }, `렌더 #${commit.n} · ${commit.label}`),
      selected != null
        ? h('button', { type: 'button', 'data-action': 'follow-latest', onClick: () => setSelected(null) }, '최신 따라가기')
        : null,
    ),
    h(ConceptCard, { commit }),
    h(Stage, { area: 'hooks', step: '①', title: 'setState → 상태 (hooks 배열)' }, h(HookList, { hooks: commit.hooks })),
    h(
      Stage,
      { area: 'vdom', step: '②', title: '컴포넌트 다시 실행 → 새 가상 트리', note: `가상 노드 ${commit.nodeCount}개` },
      h('pre', { class: 'vdom', 'data-role': 'vdom' }, commit.vdom),
    ),
    h(Stage, { area: 'patches', step: '③', title: 'diff(이전 트리, 새 트리) → 패치 목록' }, h(PatchSummary, { commit })),
    h(
      Stage,
      { area: 'dom', step: '④', title: 'patch → 실제 DOM' },
      h(
        'p',
        { 'data-role': 'mutations' },
        `실제 DOM 변경 기록 ${commit.mutations}건 (MutationObserver · 노드 이동은 빼기+넣기 2건) · 가상 노드 ${commit.nodeCount}개 중 바뀐 곳만 고쳤습니다.`,
      ),
    ),
    h(
      'div',
      { class: 'timeline-wrap' },
      h('h3', null, '렌더 타임라인'),
      h(
        'ol',
        { class: 'timeline', 'data-role': 'timeline' },
        commits.map((c) =>
          h(
            'li',
            { key: c.n },
            h(
              'button',
              {
                type: 'button',
                'data-commit': String(c.n),
                class: c.n === commit.n ? 'current' : null,
                title: c.label,
                onClick: () => setSelected(c.n),
              },
              `#${c.n}`,
              h('small', null, ` ${c.patches.length}`),
            ),
          ),
        ),
      ),
    ),
  );
}

function Stage({ area, step, title, note, children }) {
  return h(
    'section',
    { class: `stage stage-${area}` },
    h('h3', null, h('span', { class: 'step' }, step), ` ${title}`, note ? h('small', null, ` · ${note}`) : null),
    children,
  );
}

function HookList({ hooks }) {
  return h(
    'ol',
    { class: 'hook-list', 'data-role': 'hooks', start: '0' },
    hooks.map((hook) =>
      h(
        'li',
        { class: hook.changed ? 'changed' : hook.recomputed ? 'recomputed' : null },
        h('code', null, hook.kind),
        ' ',
        hook.text,
        hook.changed ? h('small', { class: 'hook-tag' }, ' 값 바뀜') : null,
        hook.recomputed && !hook.changed
          ? h('small', { class: 'hook-tag' }, hook.kind === 'useEffect' ? ' deps 바뀜 → 다시 실행' : ' deps 바뀜 → 다시 계산, 값은 같음')
          : null,
      ),
    ),
  );
}

function PatchSummary({ commit }) {
  const counts = {};
  for (const p of commit.patches) counts[p.type] = (counts[p.type] ?? 0) + 1;
  return h(
    'div',
    null,
    h(
      'p',
      { class: 'patch-counts', 'data-role': 'patch-counts' },
      commit.patches.length === 0
        ? '변경 없음'
        : Object.entries(counts).map(([type, n]) => h('span', { class: `op op-${type.toLowerCase()}` }, `${type} ${n}`)),
    ),
    h(
      'ol',
      { class: 'patch-list', 'data-role': 'patch-list' },
      commit.patches.map((p) => h('li', null, h('span', { class: `op op-${p.type.toLowerCase()}` }, p.type), ' ', p.text)),
    ),
    commit.handlerCount > 0
      ? h('p', { class: 'note' }, `+ 이벤트 핸들러 교체 ${commit.handlerCount}건 (DOM 변경 없음)`)
      : null,
  );
}

/* ───────────── 렌더 기록 만들기 ───────────── */

const isHandlerProp = (p, name) =>
  name.startsWith('on') && (typeof p.set[name] === 'function' || typeof p.prev[name] === 'function');

// 이 PROPS 패치에서 바뀐 이벤트 핸들러 수. 인라인 함수가 렌더마다 새로 만들어져 생기며, 실제 DOM은 바뀌지 않는다.
function handlerChanges(p) {
  if (p.type !== 'PROPS') return 0;
  return [...Object.keys(p.set), ...p.remove].filter((name) => isHandlerProp(p, name)).length;
}

// 핸들러를 빼고 나면 바뀐 것이 없는(실제 DOM을 바꾸지 않는) 패치인가
function isHandlerOnly(p) {
  if (p.type !== 'PROPS') return false;
  const names = [...Object.keys(p.set), ...p.remove];
  return names.length > 0 && names.every((name) => isHandlerProp(p, name));
}

// PROPS 패치에서 핸들러 변경만 빼고 설명한다 (예: checked와 onChange가 함께 바뀐 경우)
function withoutHandlers(p) {
  if (p.type !== 'PROPS') return p;
  return {
    ...p,
    set: Object.fromEntries(Object.entries(p.set).filter(([name]) => !isHandlerProp(p, name))),
    remove: p.remove.filter((name) => !isHandlerProp(p, name)),
  };
}

function isHistory(value) {
  return value !== null && typeof value === 'object' && Array.isArray(value.past) && 'present' in value && Array.isArray(value.future);
}

// 훅 값에서 목록을 꺼낸다 (기록 상태면 present)
function itemsOf(value) {
  return isHistory(value) ? value.present : value;
}

function describeHook(hook) {
  const short = (value, max = 70) => {
    const text = JSON.stringify(value) ?? String(value);
    return text.length > max ? `${text.slice(0, max)}…` : text;
  };
  const value = hook.value;
  // 기록 상태({ past, present, future })는 지금 목록과 쌓인 개수로 보여 준다
  if (hook.kind === 'useState' && isHistory(value)) {
    return `present ${short(value.present, 56)} · past ${value.past.length}개 · future ${value.future.length}개`;
  }
  if (hook.kind === 'useState') return short(value);
  if (hook.kind === 'useMemo') return `${short(hook.value)} · deps ${short(hook.deps, 30)}`;
  return `deps ${short(hook.deps, 40)}`;
}

/**
 * 훅이 이번 렌더에서 어떻게 바뀌었는지 판정한다. 라이브러리와 같은 기준(Object.is, 참조 비교)을 쓴다.
 *   changed    : 값(useState 상태, useMemo 결과)이 바뀜
 *   recomputed : deps가 바뀌어 useMemo를 다시 계산했거나 useEffect를 다시 실행함
 */
function compareHook(hook, previous) {
  if (!previous) return { changed: false, recomputed: false };
  const changed = hook.kind !== 'useEffect' && !Object.is(hook.value, previous.value);
  const depsChanged =
    hook.kind !== 'useState' &&
    (hook.deps === undefined ||
      previous.deps === undefined ||
      hook.deps.length !== previous.deps.length ||
      hook.deps.some((d, i) => !Object.is(d, previous.deps[i])));
  return { changed, recomputed: depsChanged };
}

function countNodes(vnode) {
  return vnode ? 1 + vnode.children.reduce((sum, child) => sum + countNodes(child), 0) : 0;
}

/* ───────────── 시작 ───────────── */

/**
 * @param {{ root: Element, inspector: Element }} options
 * @returns {{ unmount(): void }}
 */
export function startIntegrated({ root, inspector }) {
  const commits = [];
  let labels = [];
  let concepts = [];
  let labelResetScheduled = false;
  let previousHooks = [];

  // 렌더는 마이크로태스크에서 일어나므로, 이 매크로태스크가 끝날 때까지 커밋이 없으면 그 라벨은 렌더를 만들지 못한 것이다
  // (맨 위 항목을 위로 올리기처럼 상태가 그대로인 동작). 다음 렌더에 붙지 않도록 버린다.
  const track = (label, concept) => {
    labels.push(label);
    if (concept) concepts.push(concept);
    if (!labelResetScheduled) {
      labelResetScheduled = true;
      setTimeout(() => {
        labels = [];
        concepts = [];
        labelResetScheduled = false;
      }, 0);
    }
  };

  const panel = new FunctionComponent(PipelineInspector, { commits: [] }, inspector, {
    onError: (error) => console.error('[파이프라인 패널]', error),
  }).mount();

  const observer = typeof MutationObserver === 'function' ? new MutationObserver(() => {}) : null;
  observer?.observe(root, { childList: true, subtree: true, attributes: true, characterData: true });

  const cleanupPanel = () => {
    observer?.disconnect();
    panel.unmount();
  };

  function record(patches, component) {
    const records = observer ? observer.takeRecords() : [];
    const label = labels.length > 0 ? [...new Set(labels)].join(' + ') : commits.length === 0 ? '첫 렌더' : '(알 수 없음)';
    // 설명할 개념: 첫 렌더면 mount, 아니면 마지막으로 한 동작의 개념. 재정렬이면 이번 LIS 계산에 쓸 위치 정보도 남긴다.
    const conceptKey = commits.length === 0 ? 'mount' : concepts.at(-1) ?? null;
    const concept = { key: conceptKey };
    if (conceptKey === 'reorder') concept.reorder = reorderInfo(itemsOf(previousHooks[0]?.value), itemsOf(component.hooks[0]?.value));
    labels = [];
    concepts = [];
    flash(records);
    const hooks = component.hooks.map((hook, i) => ({
      kind: hook.kind,
      text: describeHook(hook),
      ...compareHook(hook, previousHooks[i]),
    }));
    previousHooks = component.hooks.map((hook) => ({ value: hook.value, deps: hook.deps }));
    const domPatches = patches.filter((p) => !isHandlerOnly(p));
    commits.push({
      n: (commits.at(-1)?.n ?? 0) + 1,
      label,
      concept,
      hooks,
      vdom: vnodeToHTML(component.vnode),
      nodeCount: countNodes(component.vnode),
      patches: domPatches.map((p) => ({ type: p.type, text: describePatch(withoutHandlers(p)) })),
      handlerCount: patches.reduce((sum, p) => sum + handlerChanges(p), 0),
      mutations: records.length,
    });
    if (commits.length > MAX_COMMITS) commits.shift();
  }

  const App = createBacklogApp(track, () => root);

  let app;
  try {
    app = mountComponent(App, root, {}, {
      onCommit(patches, component) {
        try {
          record(patches, component);
        } catch (error) {
          labels = [];
          concepts = [];
          console.error('[파이프라인 기록]', error);
          return;
        }
        // 패널은 별도의 루트 컴포넌트다. 새 기록을 props로 넘기고 다시 그린다(패널도 diff로 바뀐 부분만 patch).
        // 패널 오류가 앱의 오류로 섞이지 않게 여기서 따로 처리한다.
        try {
          panel.props = { commits: [...commits] };
          panel.update();
        } catch (error) {
          console.error('[파이프라인 패널]', error);
        }
      },
      onError(error) {
        // 렌더·patch가 실패하면 onCommit이 불리지 않는다. 그 동작의 라벨과 (되돌리기를 포함한) DOM 기록은 버린다.
        labels = [];
        concepts = [];
        observer?.takeRecords();
        console.error(error);
      },
    });
  } catch (error) {
    // 첫 렌더가 실패하면 앱 인스턴스가 없으므로 여기서 패널과 observer를 정리한다.
    cleanupPanel();
    throw error;
  }

  return {
    unmount() {
      try {
        app.unmount();
      } finally {
        cleanupPanel();
      }
    },
  };
}
