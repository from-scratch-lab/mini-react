import { createElement as h } from '../../src/index.js';
import { longestIncreasingSubsequence } from '../../src/diff/lis.js';

/*
 * "방금 일어난 일" 설명 카드.
 * 사용자가 한 동작마다 그 뒤에 있는 React의 개념을, 이번 렌더의 실제 숫자와 함께 설명한다.
 * 각 설명은 basics(페이지의 "React의 본질" 절) 중 관련 항목으로 링크한다.
 */

export const CONCEPTS = {
  mount: {
    title: '첫 렌더 (mount): 가상 트리 전체를 처음 그린다',
    basics: 'ui-function',
    body: (c) => [
      `컴포넌트 함수를 처음 실행해 가상 노드 ${c.nodeCount}개짜리 트리를 만들었습니다.`,
      '비교할 이전 트리가 없으므로 diff는 "루트를 통째로 만들어라"는 CREATE 하나만 내놓고, patch가 실제 DOM을 한 번에 만듭니다.',
      '이때 hooks 배열에 상태 칸이 호출 순서대로 생깁니다. 다음 렌더부터 useState는 이 칸에서 값을 꺼냅니다.',
    ],
    react: 'React도 첫 렌더는 전체를 만들지만, 서버에서 그린 HTML이 있으면 새로 만들지 않고 이어받습니다(hydration). 이 프로젝트의 Phase 1 페이지가 비슷한 일을 합니다.',
  },
  reorder: {
    title: 'key로 재정렬: LIS로 이동을 최소화한다',
    basics: 'lis',
    body: () => [
      'key가 있으면 diff는 위치가 아니라 key로 이전·새 항목의 짝을 찾습니다. 그래서 내용은 그대로이고 "순서만" 바뀐 것을 알아챕니다.',
      '새 순서대로 각 항목의 "이전 위치"를 늘어놓고, 그중 가장 긴 증가 부분 수열(LIS)을 구합니다. LIS에 든 항목끼리는 상대 순서가 이미 맞으므로 그대로 두고, 나머지만 옮깁니다(MOVE).',
    ],
    react:
      '실제 React는 LIS를 쓰지 않습니다. 앞에서부터 훑으며 "지금까지 둔 이전 위치 중 최댓값(lastPlacedIndex)"보다 앞에 있던 항목을 옮깁니다. 그래서 맨 뒤 항목을 맨 앞으로 올리면 나머지를 전부 옮깁니다. LIS 방식은 Vue 3·Inferno가 씁니다.',
  },
  reorderNoKey: {
    title: 'key 없이 재정렬: 위치로 비교하면 내용이 줄줄이 바뀐다',
    basics: 'reconcile',
    body: (c) => [
      'key가 없으면 diff는 "같은 자리의 노드끼리" 비교합니다. 순서만 바뀌었어도 각 자리의 글자가 달라졌으니 노드를 옮기지 않고 내용을 고칩니다.',
      `그래서 이번 렌더는 MOVE 없이 텍스트·속성 등의 패치 ${c.patches.length}개가 나왔습니다. key를 켜고 같은 동작을 하면 MOVE 몇 개로 끝납니다.`,
      '위치 비교는 입력칸에 쓰던 글자나 체크 상태 같은 "DOM이 들고 있는 상태"가 엉뚱한 항목으로 넘어가는 버그도 만듭니다.',
    ],
    react: 'React도 key가 없으면 위치(인덱스)로 비교하고, 개발 모드에서 "key가 필요하다"는 경고를 띄웁니다. 배열 인덱스를 key로 쓰는 것도 같은 문제를 낳습니다.',
  },
  keyToggle: {
    title: 'key가 바뀌면 다른 노드다',
    basics: 'reconcile',
    body: (c) => [
      'key를 켜거나 끄면 각 항목의 key가 달라집니다. diff는 key가 다른 노드를 "다른 노드"로 보므로, 내용이 같아도 기존 노드를 버리고 새로 만듭니다.',
      `이번 렌더의 패치는 ${c.patches.length}개입니다. key는 성능 힌트가 아니라 "같은 항목인가"를 알려 주는 정체성입니다.`,
    ],
    react: 'React에서도 key를 바꾸면 컴포넌트가 새로 마운트되어 상태가 초기화됩니다. 일부러 key를 바꿔 폼을 초기화하는 기법도 이 성질을 씁니다.',
  },
  replace: {
    title: '태그가 바뀌면 교체 (REPLACE)',
    basics: 'reconcile',
    body: () => [
      '편집을 시작하거나 끝내면 제목 자리의 <span>이 <input>으로(또는 반대로) 바뀝니다.',
      'diff는 "타입(태그)이 다르면 하위 트리 전체가 다르다"고 가정하고, 안쪽을 비교하지 않고 통째로 새로 만들어 바꿉니다. 두 트리를 완전히 비교하면 O(n³)이 걸리기 때문에 이 가정으로 O(n)에 끝냅니다.',
    ],
    react: 'React의 재조정도 같은 가정을 씁니다. 컴포넌트 타입이 바뀌면 그 아래 상태는 모두 사라집니다.',
  },
  props: {
    title: '속성 변경 (PROPS) + 글자 변경 (TEXT)',
    basics: 'reconcile',
    body: () => [
      '같은 태그·같은 key라 노드는 그대로 두고, 바뀐 것만 고쳤습니다. 행의 class는 속성이라 PROPS로, ★/☆ 글자와 아래 "우선 N개"는 텍스트 노드라 TEXT로 바뀌었습니다.',
      '패널의 "이벤트 핸들러 교체"는 렌더마다 새로 만들어지는 인라인 함수 때문에 생깁니다. 요소마다 리스너는 한 번만 달고 호출할 함수만 바꾸므로 실제 DOM은 바뀌지 않습니다.',
    ],
    react: 'React는 루트 하나에서 이벤트를 받아 나눠 주는 이벤트 위임(합성 이벤트)을 써서, 핸들러가 바뀌어도 DOM 리스너를 건드리지 않습니다.',
  },
  text: {
    title: '텍스트만 바뀜 (TEXT) + useMemo 재계산',
    basics: 'hooks',
    body: () => [
      '항목 점수와 합계 글자만 바뀌어 텍스트 노드의 내용만 고쳤습니다. 나머지 노드는 한 번도 건드리지 않았습니다.',
      '합계·우선 개수는 useMemo로 계산합니다. deps인 items가 바뀌었으므로 다시 계산했고, 결과가 같으면 패널에 "값은 같음"으로 표시됩니다.',
    ],
    react:
      'React의 useMemo도 deps를 Object.is로 비교합니다. 다만 캐시를 반드시 지킨다고 약속하지 않습니다. 개발 중 파일을 고칠 때나 첫 마운트 중 suspend될 때 버리고, 앞으로 버리는 경우가 늘 수 있다고 문서에 적혀 있습니다. 그래서 성능 최적화로만 써야 합니다.',
  },
  create: {
    title: '새 노드 추가 (CREATE)',
    basics: 'reconcile',
    body: () => [
      '이전 트리에 짝이 없는 새 항목이 생겨, 그 하위 트리를 만들어 바로 뒤 형제 앞(목록 끝이면 맨 뒤)에 넣었습니다.',
      '같은 이벤트에서 목록 추가와 입력칸 비우기, 다음 id 늘리기를 함께 했지만 렌더는 한 번입니다(배칭).',
    ],
    react: 'React는 렌더 단계에서 새 Fiber에 "배치(Placement)" 표시를 붙여 두고, 커밋 단계에서 한 번에 DOM에 넣습니다.',
  },
  remove: {
    title: '노드 삭제 (REMOVE)',
    basics: 'reconcile',
    body: () => [
      '새 트리에 짝이 없는 이전 항목이라 실제 DOM에서 떼어 냈습니다.',
      '이 데모의 항목 행은 effect가 없는 순수 함수라 이번에 불린 정리 함수는 없습니다. 일반적으로는 effect가 있는 컴포넌트가 사라질 때(unmount) 그 정리 함수가 불려 타이머·리스너를 정리합니다.',
    ],
    react: 'React도 삭제할 Fiber를 모아 두었다가 커밋 단계에서 지우고, 그 안의 effect 정리 함수를 부릅니다.',
  },
  batch: {
    title: '배칭: setState 3번 → 렌더 1번',
    basics: 'batching',
    body: () => [
      '버튼 하나에서 setState를 3번 불렀습니다. setState는 값을 바로 바꾸지만, 다시 그리는 일은 "예약"만 하고 마이크로태스크에서 한 번에 처리합니다.',
      '그래서 타임라인 번호가 하나만 늘었고, 함수형 업데이트(prev => prev + 1)라 세 번의 +1이 모두 반영됐습니다.',
    ],
    react:
      'React 18부터는 createRoot로 띄운 앱이면 이벤트·타이머·Promise 어디서든 자동 배칭합니다. 바로 그려야 하면 flushSync를 씁니다. 또 React는 setState를 큐에 쌓아 두었다가 렌더 때 차례로 계산하는데, 이 구현은 값을 바로 바꾸고 렌더만 미룹니다.',
  },
  input: {
    title: '제어 컴포넌트: 입력할 때마다 렌더',
    basics: 'hooks',
    body: () => [
      '입력칸의 값은 useState가 들고 있고, 글자를 칠 때마다 setState → 다시 렌더 → value를 다시 넣습니다(제어 컴포넌트).',
      'patch는 DOM의 value가 이미 같으면 덮어쓰지 않습니다. 그래야 입력 중인 커서 위치가 맨 뒤로 튀지 않습니다.',
    ],
    react: 'React의 controlled input도 같은 원리이고, 값이 같으면 DOM value를 다시 쓰지 않습니다.',
  },
  unknown: {
    title: '다시 렌더',
    basics: 'render-commit',
    body: (c) => [`상태가 바뀌어 컴포넌트를 다시 실행했고, 패치 ${c.patches.length}개를 반영했습니다.`],
    react:
      'React는 렌더 단계와 커밋 단계를 나눕니다. startTransition 등으로 표시한 낮은 우선순위 업데이트는 렌더 단계를 중간에 양보하거나, 더 급한 업데이트가 오면 버리고 다시 시작할 수 있습니다(Concurrent).',
  },
};

export function ConceptCard({ commit }) {
  const concept = CONCEPTS[commit.concept?.key] ?? CONCEPTS.unknown;
  return h(
    'section',
    { class: 'concept', 'data-role': 'concept', 'aria-live': 'polite' },
    h('p', { class: 'concept-kicker' }, '방금 일어난 일'),
    h('h3', null, concept.title),
    h(
      'ul',
      { class: 'concept-body' },
      concept.body(commit).map((line) => h('li', null, line)),
    ),
    commit.concept?.reorder ? h(LisView, { reorder: commit.concept.reorder }) : null,
    h('p', { class: 'react-note', 'data-role': 'react-note' }, h('b', null, '실제 React에서는 '), concept.react),
    h('a', { class: 'concept-link', href: `#basics-${concept.basics}` }, '기본 개념 더 보기 ↓'),
  );
}

/**
 * 이번 재정렬의 LIS를 그대로 보여 준다.
 * sequence: 새 순서대로 늘어놓은 각 항목의 "이전 위치"
 */
function LisView({ reorder }) {
  const { titles, sequence } = reorder;
  const lis = longestIncreasingSubsequence(sequence);
  const keep = new Set(lis);
  const ours = sequence.length - lis.length;
  const react = reactMoves(sequence);
  return h(
    'div',
    { class: 'lis' },
    h(
      'p',
      null,
      '새 순서의 이전 위치 ',
      h('code', { 'data-role': 'lis-sequence' }, `[${sequence.join(', ')}]`),
      ' → LIS ',
      h('code', { 'data-role': 'lis-result' }, `[${lis.map((i) => sequence[i]).join(', ')}]`),
    ),
    h(
      'ol',
      { class: 'lis-chips', 'data-role': 'lis-chips' },
      sequence.map((oldIndex, i) =>
        h(
          'li',
          { class: keep.has(i) ? 'keep' : 'move', title: keep.has(i) ? 'LIS에 들어 고정' : '옮김' },
          h('span', { class: 'lis-old' }, `이전 ${oldIndex}`),
          h('span', { class: 'lis-title' }, titles[i]),
          h('span', { class: 'lis-tag' }, keep.has(i) ? '고정' : '이동'),
        ),
      ),
    ),
    h(
      'p',
      { class: 'lis-compare' },
      h('span', { 'data-role': 'lis-ours' }, `이 구현(LIS): ${ours}번 이동`),
      ' · ',
      h('span', { 'data-role': 'lis-react' }, `실제 React(lastPlacedIndex): ${react}번 이동`),
    ),
  );
}

/** React의 자식 재조정에서 옮기는 횟수: 지금까지 둔 이전 위치 최댓값보다 앞에 있던 항목은 옮긴다. */
export function reactMoves(sequence) {
  let lastPlaced = -1;
  let moves = 0;
  for (const oldIndex of sequence) {
    if (oldIndex < lastPlaced) moves += 1;
    else lastPlaced = oldIndex;
  }
  return moves;
}

/** 이전·새 항목 목록에서 "새 순서대로 늘어놓은 이전 위치"를 만든다. 순서만 바뀐 경우에만 돌려준다. */
export function reorderInfo(prevItems, nextItems) {
  if (!Array.isArray(prevItems) || !Array.isArray(nextItems) || prevItems.length !== nextItems.length) return null;
  const oldIndex = new Map(prevItems.map((item, i) => [item.id, i]));
  const sequence = nextItems.map((item) => oldIndex.get(item.id));
  if (sequence.some((i) => i === undefined)) return null;
  return { sequence, titles: nextItems.map((item) => item.title) };
}
