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
 * @param {(label: string) => void} track 다음 렌더가 "무엇 때문에" 일어났는지 파이프라인 패널에 알리는 함수
 * @param {() => Element} getRoot 편집 칸에 포커스를 줄 때 쓰는 앱 루트
 */
function createBacklogApp(track, getRoot) {
  return function BacklogApp() {
    const [items, setItems] = useState(INITIAL_ITEMS);
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
        track(`"${title}" 추가`);
        setItems((list) => [...list, { id: nextId, title, points: 1, priority: false }]);
        setNextId((n) => n + 1);
        setDraft('');
      },
      remove(item) {
        track(`"${item.title}" 삭제`);
        setItems((list) => list.filter((i) => i.id !== item.id));
        setEditing((e) => (e?.id === item.id ? null : e)); // 지운 항목을 편집 중이었다면 편집도 끝낸다
      },
      up(item) {
        track(`"${item.title}" 위로`);
        move(item.id, -1);
      },
      down(item) {
        track(`"${item.title}" 아래로`);
        move(item.id, 1);
      },
      points(item) {
        track(`"${item.title}" 점수 +1`);
        update(item.id, (i) => ({ points: i.points + 1 }));
      },
      priority(item) {
        track(`"${item.title}" 우선순위 ${item.priority ? '해제' : '표시'}`);
        update(item.id, (i) => ({ priority: !i.priority }));
      },
      startEdit(item) {
        track(`"${item.title}" 편집 시작`);
        setEditing({ id: item.id, text: item.title });
      },
      editText(text) {
        track('편집 중 입력');
        setEditing((e) => (e ? { ...e, text } : e));
      },
      saveEdit() {
        if (!editing) return;
        const title = editing.text.trim();
        track('편집 저장');
        if (title) update(editing.id, () => ({ title }));
        setEditing(null);
      },
      cancelEdit() {
        track('편집 취소');
        setEditing(null);
      },
      rotate() {
        track('맨 아래 → 맨 위');
        setItems((list) => (list.length < 2 ? list : [list[list.length - 1], ...list.slice(0, -1)]));
      },
      reverse() {
        track('순서 뒤집기');
        setItems((list) => keepIfSameOrder(list, [...list].reverse()));
      },
      sort() {
        track('점수순 정렬');
        setItems((list) => keepIfSameOrder(list, [...list].sort((a, b) => b.points - a.points)));
      },
      batch() {
        // 한 이벤트 안에서 setState 3번 → 렌더는 한 번(배칭)
        track('setState 3번 (배칭 → 렌더 1번)');
        for (let i = 0; i < 3; i += 1) {
          setItems((list) => (list.length ? [{ ...list[0], points: list[0].points + 1 }, ...list.slice(1)] : list));
        }
      },
      toggleKeys() {
        track(useKeys ? 'key 끄기 (위치로 비교)' : 'key 켜기');
        setUseKeys((v) => !v);
      },
      draft(text) {
        track('새 항목 입력');
        setDraft(text);
      },
    };

    return h(
      'div',
      { class: 'backlog-app' },
      h(Toolbar, { useKeys, handlers }),
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

function Toolbar({ useKeys, handlers }) {
  const button = (action, label, onClick) => h('button', { type: 'button', 'data-action': action, onClick }, label);
  return h(
    'div',
    { class: 'toolbar' },
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
    h(Stage, { step: '①', title: 'setState → 상태 (hooks 배열)' }, h(HookList, { hooks: commit.hooks })),
    h(
      Stage,
      { step: '②', title: '컴포넌트 다시 실행 → 새 가상 트리', note: `가상 노드 ${commit.nodeCount}개` },
      h('pre', { class: 'vdom', 'data-role': 'vdom' }, commit.vdom),
    ),
    h(Stage, { step: '③', title: 'diff(이전 트리, 새 트리) → 패치 목록' }, h(PatchSummary, { commit })),
    h(
      Stage,
      { step: '④', title: 'patch → 실제 DOM' },
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

function Stage({ step, title, note, children }) {
  return h(
    'section',
    { class: 'stage' },
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

function describeHook(hook) {
  const short = (value, max = 70) => {
    const text = JSON.stringify(value) ?? String(value);
    return text.length > max ? `${text.slice(0, max)}…` : text;
  };
  if (hook.kind === 'useState') return short(hook.value);
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
  let labelResetScheduled = false;
  let previousHooks = [];

  // 렌더는 마이크로태스크에서 일어나므로, 이 매크로태스크가 끝날 때까지 커밋이 없으면 그 라벨은 렌더를 만들지 못한 것이다
  // (맨 위 항목을 위로 올리기처럼 상태가 그대로인 동작). 다음 렌더에 붙지 않도록 버린다.
  const track = (label) => {
    labels.push(label);
    if (!labelResetScheduled) {
      labelResetScheduled = true;
      setTimeout(() => {
        labels = [];
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
    const label = labels.length > 0 ? [...new Set(labels)].join(' + ') : '(알 수 없음)';
    labels = [];
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
