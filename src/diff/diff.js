import { TEXT_NODE, cloneVNode } from '../vdom/vnode.js';
import { longestIncreasingSubsequence } from './lis.js';

/**
 * 패치 종류. diff가 만든 패치 목록을 patch가 순서대로 실제 DOM에 반영한다.
 *
 *   CREATE  { parent, vnode, before }    새 노드를 만들어 parent.dom 안, before.dom 앞에 넣는다 (before가 null이면 맨 뒤)
 *   REMOVE  { vnode }                    vnode.dom을 떼어 낸다
 *   REPLACE { oldVNode, vnode }          태그·key가 다르면 하위 트리째 새로 만들어 바꾼다
 *   PROPS   { vnode, set, remove, prev } 바뀐 속성만 고친다. type·multiple이 바뀌면 한 노드에 둘 나온다(자식 패치 앞·뒤)
 *   TEXT    { vnode, value, oldValue }   텍스트 노드의 내용만 바꾼다
 *   MOVE    { parent, vnode, before }    key로 찾은 기존 노드를 before 앞으로 옮긴다
 */
export const PatchType = Object.freeze({
  CREATE: 'CREATE',
  REMOVE: 'REMOVE',
  REPLACE: 'REPLACE',
  PROPS: 'PROPS',
  TEXT: 'TEXT',
  MOVE: 'MOVE',
});

/**
 * 이전·다음 가상 트리를 비교해 최소 패치 목록을 만든다. 실제 DOM API는 쓰지 않는다.
 *
 * 재사용하는 노드는 이전 가상 노드의 dom 참조를 다음 가상 노드로 옮긴다(next.dom = prev.dom).
 * 그래서 다음 번 비교에서는 이번 "다음 트리"를 그대로 "이전 트리"로 쓸 수 있다.
 *
 * vnode 객체 재사용: dom 참조가 vnode 객체에 붙어 있어서, 한 객체가 두 자리를 차지하면 참조가 덮인다.
 *   - 짝이 된 이전 노드와 같은 객체면(old === new) 하위 트리를 비교하지 않고 건너뛴다. (상수로 빼 둔 하위 트리)
 *   - 이전 트리의 객체가 다른 자리에 오거나, 다음 트리에 같은 객체가 두 번 나오면 복제본으로 바꿔 끼운다.
 *     이때 다음 트리의 children 배열이 바뀐다.
 *
 * 핸들러 교체: on* 속성이 함수에서 다른 함수로만 바뀌면 PROPS 패치를 만들지 않는다.
 *   렌더마다 새로 만든 화살표 함수 때문에 생기는 변경이라 실제 DOM은 바뀌지 않기 때문이다(리스너는 요소마다 한 번만 달려 있다).
 *   대신 { vnode, name, value } 를 결과 배열의 handlers(열거되지 않는 속성)에 담는다.
 *   patch가 모든 DOM 패치를 마친 뒤 이 목록대로 요소의 핸들러 표만 갈아 끼운다.
 *   (Vue 3의 invoker, React의 "이벤트 때 props에서 핸들러를 읽기"와 같은 생각. 패치 수 = DOM을 바꾸는 일의 수로 맞춘다)
 *
 * options (실험용, 생략하면 지금 동작 그대로)
 *   reconcileMode: 'lis'(기본) | 'lastPlacedIndex'
 *     key 목록에서 "그대로 둘 노드"를 고르는 방법만 바꾼다. 앞뒤 건너뛰기·key 짝짓기·앵커(before)·patch는 같다.
 *     'lastPlacedIndex'는 React의 접근을 참고한 자체 구현이다: 새 순서대로 훑으며 이전 위치가
 *     지금까지 둔 위치(lastPlacedIndex)보다 앞이면 MOVE, 아니면 lastPlacedIndex를 그 위치로 올린다.
 *   stats: 넘기면 자식 목록마다 어느 경로를 탔는지 센다 (docs/perf/lis-experiment.md)
 *     lists: 비교한 자식 목록 수, fastPathOnly: 앞뒤 건너뛰기만으로 끝난 목록,
 *     keyedMatch: 가운데 구간을 key로 짝지은 목록, placementSkipped: 가운데가 순서 그대로라 이동 판단을 건너뛴 목록,
 *     placementRuns: 이동 판단(LIS 또는 lastPlacedIndex)을 실제로 돌린 목록
 */
export function diff(oldVNode, newVNode, options = {}) {
  const reconcileMode = options.reconcileMode ?? 'lis';
  if (reconcileMode !== 'lis' && reconcileMode !== 'lastPlacedIndex') {
    throw new Error(`알 수 없는 reconcileMode: ${reconcileMode}`);
  }
  const ctx = {
    patches: [],
    handlers: [],
    oldNodes: collectNodes(oldVNode),
    seen: new Set(),
    reconcileMode,
    stats: options.stats ?? null,
  };
  Object.defineProperty(ctx.patches, 'handlers', { value: ctx.handlers, enumerable: false });
  if (oldVNode === newVNode) return ctx.patches;

  if (oldVNode == null) {
    ctx.patches.push({ type: PatchType.CREATE, parent: null, vnode: own(newVNode, ctx, true), before: null });
  } else if (newVNode == null) {
    ctx.patches.push({ type: PatchType.REMOVE, vnode: oldVNode });
  } else {
    diffNode(oldVNode, own(newVNode, ctx, false), ctx);
  }
  return ctx.patches;
}

function collectNodes(root, out = new Set()) {
  if (root == null) return out;
  out.add(root);
  for (const child of root.children) collectNodes(child, out);
  return out;
}

/**
 * 다음 트리의 이 자리에 쓸 vnode를 정한다. 이전 트리의 객체이거나 이번 트리에서 이미 쓴 객체면 복제한다.
 * deep이 true면(새로 만들 하위 트리) 자손까지 같은 검사를 한다. 비교할 하위 트리는 diffNode가 내려가며 검사한다.
 */
function own(vnode, ctx, deep) {
  const result = ctx.oldNodes.has(vnode) || ctx.seen.has(vnode) ? cloneVNode(vnode) : vnode;
  ctx.seen.add(result);
  if (deep) {
    result.children.forEach((child, i) => {
      result.children[i] = own(child, ctx, true);
    });
  }
  return result;
}

function diffNode(oldVNode, newVNode, ctx) {
  const { patches } = ctx;
  // 경우 3: 태그나 key가 다르면 같은 노드로 보지 않는다. 하위 트리를 비교하지 않고 통째로 새로 만든다.
  if (oldVNode.type !== newVNode.type || oldVNode.key !== newVNode.key) {
    newVNode.children.forEach((child, i) => {
      newVNode.children[i] = own(child, ctx, true);
    });
    patches.push({ type: PatchType.REPLACE, oldVNode, vnode: newVNode });
    return;
  }

  newVNode.dom = oldVNode.dom;

  // 경우 5: 텍스트 내용 변경
  if (newVNode.type === TEXT_NODE) {
    if (oldVNode.props.nodeValue !== newVNode.props.nodeValue) {
      patches.push({
        type: PatchType.TEXT,
        vnode: newVNode,
        value: newVNode.props.nodeValue,
        oldValue: oldVNode.props.nodeValue,
      });
    }
    return;
  }

  // 경우 4: 속성 변경. 보통은 자식 패치 뒤에 둔다. <select value>는 새 option이 생긴 뒤에 넣어야 선택된다.
  // 단 type·multiple은 자식과 다른 속성의 뜻을 바꾸므로 따로 떼어 자식 패치 앞에 둔다(EARLY_PROPS).
  const propsPatch = diffProps(oldVNode.props, newVNode.props, newVNode, ctx.handlers);
  // multiple이 바뀐 뒤 option 선택을 맞추는 일은 patch가 모든 패치 뒤에 한다(선택 그룹 다시 맞추기).
  const [early, late] = propsPatch ? splitEarlyProps(propsPatch) : [null, null];
  if (early) patches.push({ type: PatchType.PROPS, vnode: newVNode, ...early });
  diffChildren(oldVNode, newVNode, ctx);
  if (late) patches.push({ type: PatchType.PROPS, vnode: newVNode, ...late });
}

/**
 * 다른 속성·자식보다 먼저 넣어야 하는 속성.
 * - multiple: 없는 동안 select는 "하나만 선택" 규칙을 쓴다. option의 selected를 먼저 넣으면 마지막 하나만 남는다.
 * - type: input의 value 처리 방식이 type마다 다르다. range의 value를 지운 뒤 radio로 바꾸면
 *   HTML 표준대로 그때의 value("50")가 속성으로 복사된다. React도 type을 가장 먼저 넣는다.
 */
export const EARLY_PROPS = ['type', 'multiple'];

/** PROPS 변경을 [먼저 넣을 것, 나중에 넣을 것]으로 나눈다. 빈 쪽은 null. */
function splitEarlyProps({ set, remove, prev }) {
  const early = { set: {}, remove: [], prev: {} };
  const late = { set: {}, remove: [], prev: {} };
  const part = (name) => (EARLY_PROPS.includes(name) ? early : late);
  for (const [name, value] of Object.entries(set)) part(name).set[name] = value;
  for (const name of remove) part(name).remove.push(name);
  for (const [name, value] of Object.entries(prev)) part(name).prev[name] = value;
  const isEmpty = (p) => p.remove.length === 0 && Object.keys(p.set).length === 0;
  return [isEmpty(early) ? null : early, isEmpty(late) ? null : late];
}

function diffProps(oldProps, newProps, vnode, handlers) {
  const set = {};
  const prev = {};
  const remove = [];
  let changed = false;

  for (const [name, value] of Object.entries(newProps)) {
    if (value == null) continue; // null·undefined는 "없음"과 같다. 아래에서 remove로 처리된다.
    if (isHandlerSwap(name, oldProps[name], value)) {
      if (oldProps[name] !== value) handlers.push({ vnode, name, value });
      continue;
    }
    if (!samePropValue(oldProps[name], value)) {
      set[name] = value;
      prev[name] = oldProps[name];
      changed = true;
    }
  }
  for (const name of Object.keys(oldProps)) {
    if (oldProps[name] != null && newProps[name] == null) {
      remove.push(name);
      prev[name] = oldProps[name];
      changed = true;
    }
  }
  return changed ? { set, remove, prev } : null;
}

/** 함수 → 함수인 이벤트 핸들러. 이 변경은 DOM을 바꾸지 않으므로 PROPS가 아니라 교체 목록으로 보낸다. */
function isHandlerSwap(name, oldValue, newValue) {
  return name.startsWith('on') && typeof oldValue === 'function' && typeof newValue === 'function';
}

function samePropValue(a, b) {
  if (Object.is(a, b)) return true;
  // style 객체는 매 렌더마다 새로 만들어지므로 내용으로 비교한다.
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    return keysA.length === keysB.length && keysA.every((k) => Object.is(a[k], b[k]));
  }
  return false;
}

/**
 * 자식 목록 비교. key가 있으면 key로, 없으면 위치로 짝을 짓는다.
 *
 * 0) 빠른 경로: 앞에서부터 같은 key(둘 다 없음 포함)인 자리, 뒤에서부터 같은 key인 자리는 짝과 위치가 정해져 있어
 *    바로 재귀 비교하고, 아래 1)~3)은 그 사이 가운데 구간에만 쓴다. 가운데가 모두 짝이 있고 순서도 같으면 LIS를 건너뛴다.
 *    결과 패치 목록은 1)~3)을 목록 전체에 쓸 때와 같다(같은 순서). 같은 key가 중복되면 목록 전체를 위치로 비교한다.
 * 1) 짝 찾기: 자식마다 비교용 이름을 붙인다. key가 있으면 "k:key", 없으면 key 없는 형제 중 몇 번째인지 "u:n".
 *    그래서 key 없는 목록은 위치끼리, key 있는 목록은 key끼리 비교된다.
 *    같은 key가 중복되면 짝을 확정할 수 없으므로 경고하고 전체를 위치로 비교한다.
 * 2) 짝이 있는 자식은 재귀 비교, 짝이 없는 이전 자식은 REMOVE (경우 2).
 * 3) 자리 맞추기: 짝이 있는 자식의 "이전 위치"를 새 순서대로 늘어놓고 LIS를 구한다.
 *    LIS에 든 노드는 상대 순서가 이미 맞으니 그대로 두고, 나머지는 MOVE, 짝이 없는 새 자식은 CREATE (경우 1).
 *    뒤에서부터 처리하므로 "바로 뒤 형제(before)"는 항상 이미 제자리에 있다.
 */
function diffChildren(oldParent, newParent, ctx) {
  const oldChildren = oldParent.children;
  const newChildren = newParent.children;

  if (hasDuplicateKey(oldChildren) || hasDuplicateKey(newChildren)) {
    console.warn(
      `[mini-react] <${newParent.type}>의 자식에 같은 key가 있습니다. 이 목록은 key 대신 위치로 비교합니다.`,
    );
    // 통계: 중복 key 목록은 key가 아니라 위치로 짝짓지만, "앞뒤 건너뛰기로 끝나지 않고 짝짓기까지 간 목록"이라 keyedMatch로 센다.
    // 이동 판단(placementRuns·placementSkipped)은 아래 placeMiddle이 다른 목록과 똑같이 센다.
    if (ctx.stats) {
      ctx.stats.lists += 1;
      ctx.stats.keyedMatch += 1;
    }
    const middle = matchMiddle(oldChildren, newChildren, 0, oldChildren.length, newChildren.length, ctx, true);
    placeMiddle(newParent, middle, ctx);
    return;
  }

  // 빠른 경로: 대부분의 다시 렌더는 목록의 앞뒤가 그대로다(같은 데이터, 몇 행 갱신, 한 행 선택).
  // 앞에서부터 같은 key(또는 둘 다 key 없음)인 자리와, 뒤에서부터 같은 key인 자리는 짝이 정해져 있고
  // 옮길 일도 없으므로 이름표·Map·LIS 없이 바로 비교한다. 나머지 가운데만 일반 알고리즘으로 짝짓는다.
  // 결과 패치 목록은 일반 알고리즘만 쓸 때와 같다(같은 순서: 새 순서대로 자식 비교 → REMOVE → 뒤에서부터 CREATE·MOVE).
  let head = 0;
  const minLength = Math.min(oldChildren.length, newChildren.length);
  while (head < minLength && oldChildren[head].key === newChildren[head].key) head += 1;
  // 뒤쪽은 key가 있을 때만 맞춘다. key 없는 자식은 앞에서부터 센 순번으로 짝지으므로 뒤에서 맞추면 짝이 달라진다.
  let oldEnd = oldChildren.length;
  let newEnd = newChildren.length;
  while (oldEnd > head && newEnd > head && oldChildren[oldEnd - 1].key != null && oldChildren[oldEnd - 1].key === newChildren[newEnd - 1].key) {
    oldEnd -= 1;
    newEnd -= 1;
  }

  if (ctx.stats) {
    ctx.stats.lists += 1;
    if (oldEnd === head && newEnd === head) ctx.stats.fastPathOnly += 1;
    else ctx.stats.keyedMatch += 1;
  }
  for (let i = 0; i < head; i += 1) diffPair(oldChildren[i], newChildren, i, ctx);
  const middle = matchMiddle(oldChildren, newChildren, head, oldEnd, newEnd, ctx, false);
  for (let k = 0; k < newChildren.length - newEnd; k += 1) diffPair(oldChildren[oldEnd + k], newChildren, newEnd + k, ctx);
  placeMiddle(newParent, middle, ctx);
}

/** 짝이 정해진 두 자식을 비교한다. 같은 객체를 같은 자리에 다시 썼으면 하위 트리 전체가 그대로다. */
function diffPair(oldChild, newChildren, i, ctx) {
  const child = newChildren[i];
  if (oldChild === child && !ctx.seen.has(child)) {
    ctx.seen.add(child);
    return;
  }
  const owned = own(child, ctx, false);
  newChildren[i] = owned;
  diffNode(oldChild, owned, ctx);
}

/**
 * 가운데 구간(이전 [from, oldEnd), 다음 [from, newEnd))을 key(없으면 순번, byPosition이면 위치)로 짝짓고
 * 짝이 있는 자식을 비교한다. 지울 것·만들 것·옮길 것은 placeMiddle이 앞뒤 구간의 자식 비교가 끝난 뒤에 낸다.
 */
function matchMiddle(oldChildren, newChildren, from, oldEnd, newEnd, ctx, byPosition) {
  const oldSlice = oldChildren.slice(from, oldEnd);
  const newSlice = newChildren.slice(from, newEnd);
  const oldNames = byPosition ? oldSlice.map((_, i) => `p:${i}`) : matchNames(oldSlice);
  const newNames = byPosition ? newSlice.map((_, i) => `p:${i}`) : matchNames(newSlice);
  const oldIndexByName = new Map(oldNames.map((name, j) => [name, j]));
  const matchedOldIndex = new Array(newSlice.length).fill(-1);
  const used = new Set();

  newSlice.forEach((child, i) => {
    const j = oldIndexByName.get(newNames[i]);
    if (j !== undefined && oldSlice[j] === child && !ctx.seen.has(child)) {
      ctx.seen.add(child);
      matchedOldIndex[i] = j;
      used.add(j);
      return;
    }
    const owned = own(child, ctx, j === undefined);
    newChildren[from + i] = owned;
    if (j === undefined) return;
    matchedOldIndex[i] = j;
    used.add(j);
    diffNode(oldSlice[j], owned, ctx);
  });
  return { oldSlice, newChildren, from, newEnd, matchedOldIndex, used };
}

/** 가운데 구간의 REMOVE, 그리고 뒤에서부터 CREATE·MOVE. 앞뒤 구간은 제자리라 낼 것이 없다. */
function placeMiddle(newParent, { oldSlice, newChildren, from, newEnd, matchedOldIndex, used }, ctx) {
  const { patches } = ctx;
  oldSlice.forEach((child, j) => {
    if (!used.has(j)) patches.push({ type: PatchType.REMOVE, vnode: child });
  });

  const matchedNewIndexes = [];
  const sequence = [];
  matchedOldIndex.forEach((j, i) => {
    if (j !== -1) {
      matchedNewIndexes.push(i);
      sequence.push(j);
    }
  });
  // 바뀐 것이 없으면(모두 짝이 있고 순서 그대로) LIS를 돌릴 필요가 없다
  if (sequence.length === matchedOldIndex.length && sequence.every((j, k) => j === k)) {
    if (ctx.stats && matchedOldIndex.length > 0) ctx.stats.placementSkipped += 1;
    return;
  }
  if (ctx.stats) ctx.stats.placementRuns += 1;
  const stays = new Set(
    (ctx.reconcileMode === 'lis' ? longestIncreasingSubsequence(sequence) : lastPlacedStays(sequence)).map(
      (k) => matchedNewIndexes[k],
    ),
  );

  for (let i = newEnd - from - 1; i >= 0; i -= 1) {
    const before = newChildren[from + i + 1] ?? null;
    if (matchedOldIndex[i] === -1) {
      patches.push({ type: PatchType.CREATE, parent: newParent, vnode: newChildren[from + i], before });
    } else if (!stays.has(i)) {
      patches.push({ type: PatchType.MOVE, parent: newParent, vnode: newChildren[from + i], before });
    }
  }
}

/**
 * 'lastPlacedIndex' 모드의 "그대로 둘 노드" (React의 접근을 참고한 자체 구현).
 * sequence = 새 순서로 늘어놓은 이전 위치. 돌려주는 것은 그대로 둘 원소의 sequence 인덱스(증가 순).
 * 고른 원소들의 이전 위치는 증가하므로, 뒤에서부터 before 앞에 넣는 placeMiddle이 그대로 맞게 동작한다.
 */
function lastPlacedStays(sequence) {
  const stays = [];
  let lastPlacedIndex = 0;
  sequence.forEach((oldIndex, k) => {
    if (oldIndex < lastPlacedIndex) return; // 옮긴다
    lastPlacedIndex = oldIndex;
    stays.push(k);
  });
  return stays;
}

function matchNames(children) {
  let unkeyed = 0;
  return children.map((child) => (child.key != null ? `k:${child.key}` : `u:${unkeyed++}`));
}

/** key가 있는 자식끼리 같은 key가 있는가 (key 없는 자식은 순번으로 짝지으므로 겹치지 않는다) */
function hasDuplicateKey(children) {
  const seen = new Set();
  for (const child of children) {
    if (child.key == null) continue;
    const key = String(child.key); // 이름표처럼 문자열로 본다: key 1과 '1'은 같은 key다
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}
