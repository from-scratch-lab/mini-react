import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { flushUpdates } from '../../src/index.js';
import { startIntegrated } from '../../demo/integrated/app.js';

// 종합 데모: 훅으로 만든 앱을 조작하면 상태 → 새 가상 트리 → diff 패치 → 실제 DOM 변경이 차례로 보이는지 확인한다.
let root;
let inspector;
let app;

const $ = (selector, scope = root) => scope.querySelector(selector);
const $$ = (selector, scope = root) => [...scope.querySelectorAll(selector)];
const rows = () => $$('[data-role="backlog"] > li');
const titles = () => rows().map((li) => $('.title, .title-input', li).textContent || $('.title-input', li)?.value);
const commitTitle = () => $('[data-role="commit-title"]', inspector).textContent;
const patchTypes = () => $$('[data-role="patch-list"] li', inspector).map((li) => $('.op', li).textContent);
// 뒤로가기·앞으로가기 버튼의 활성 상태(disabled) 변경을 뺀 패치. 앱 목록이 어떻게 바뀌었는지만 본다.
const listPatchTypes = () =>
  $$('[data-role="patch-list"] li', inspector)
    .filter((li) => !li.textContent.includes('disabled'))
    .map((li) => $('.op', li).textContent);

async function click(element) {
  element.click();
  await flushUpdates();
}

const action = (name, scope = root) => $(`[data-action="${name}"]`, scope);
const rowAction = (index, name) => action(name, rows()[index]);

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div><div id="inspector"></div>';
  root = document.getElementById('app');
  inspector = document.getElementById('inspector');
  app = startIntegrated({ root, inspector });
});

afterEach(() => app.unmount());

describe('종합 데모: 렌더 파이프라인', () => {
  it('첫 렌더는 #1이고 앱 전체를 CREATE 하나로 그린다', () => {
    expect(rows()).toHaveLength(5);
    expect(commitTitle()).toContain('렌더 #1');
    expect(patchTypes()).toEqual(['CREATE']);
  });

  it('key를 쓰면 맨 아래 항목을 맨 위로 올릴 때 MOVE 하나로 끝나고, 기존 li를 재사용한다', async () => {
    const before = rows();
    await click(action('rotate'));
    expect(rows()[0]).toBe(before[4]);
    expect(rows()[1]).toBe(before[0]);
    expect(listPatchTypes()).toEqual(['MOVE']);
    expect(commitTitle()).toContain('맨 아래 → 맨 위');
  });

  it('key를 끄면 같은 동작이 위치 비교가 되어 MOVE 없이 TEXT가 여러 개 생긴다', async () => {
    await click(action('toggle-keys'));
    await click(action('rotate'));
    const types = patchTypes();
    expect(types).not.toContain('MOVE');
    expect(types.filter((t) => t === 'TEXT').length).toBeGreaterThanOrEqual(5);
  });

  it('제목 편집을 시작하면 span이 input으로 바뀌어 REPLACE, Enter로 저장하면 다시 span', async () => {
    await click(rowAction(1, 'edit'));
    expect(patchTypes()).toContain('REPLACE');
    const input = $('.title-input', rows()[1]);
    expect(input.value).toBe('Diff 5가지 경우');

    input.value = 'Diff 다섯 가지';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flushUpdates();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flushUpdates();
    expect($('.title', rows()[1]).textContent).toBe('Diff 다섯 가지');
    expect(patchTypes()).toContain('REPLACE');
  });

  it('우선순위 표시는 class만 바뀌어 PROPS', async () => {
    await click(rowAction(2, 'priority'));
    expect(rows()[2].classList.contains('priority')).toBe(true);
    expect(patchTypes()).toContain('PROPS');
    expect(patchTypes()).not.toContain('REPLACE');
  });

  it('점수 +1은 항목 점수와 합계(useMemo) 텍스트만 바꾼다', async () => {
    await click(rowAction(0, 'points'));
    expect(listPatchTypes()).toEqual(['TEXT', 'TEXT']);
    expect($('[data-role="summary"]').textContent).toContain('22점');
  });

  it('추가하면 CREATE, 삭제하면 REMOVE', async () => {
    const input = $('input[name="title"]');
    input.value = 'useMemo 실험';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flushUpdates();
    $('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushUpdates();
    expect(titles().at(-1)).toBe('useMemo 실험');
    expect(patchTypes()).toContain('CREATE');

    await click(rowAction(0, 'remove'));
    expect(rows()).toHaveLength(5);
    expect(patchTypes()).toContain('REMOVE');
  });

  it('setState를 3번 불러도 렌더는 한 번 (배칭)', async () => {
    const before = Number(commitTitle().match(/#(\d+)/)[1]);
    await click(action('batch'));
    const after = Number(commitTitle().match(/#(\d+)/)[1]);
    expect(after).toBe(before + 1);
    expect($('.points', rows()[0]).textContent).toBe('6점');
  });

  it('값이 바뀐 훅만 강조하고, deps가 바뀌어 다시 계산했지만 값이 같은 메모는 따로 표시한다', async () => {
    const hookIndexes = (cls) =>
      $$('[data-role="hooks"] li', inspector)
        .map((li, i) => (li.classList.contains(cls) ? i : -1))
        .filter((i) => i >= 0);
    // 훅 순서: 0 items, 1 draft, 2 editing, 3 useKeys, 4 nextId, 5 total(memo), 6 priorityCount(memo), 7 focus(effect)
    await click(rowAction(2, 'priority'));
    expect(hookIndexes('changed')).toEqual([0, 6]); // 목록과 우선순위 개수만 값이 바뀜
    expect(hookIndexes('recomputed')).toEqual([5]); // 합계는 다시 계산했지만 22점 그대로
  });

  it('새 가상 트리와 실제 DOM 변경 기록 수(MutationObserver)를 보여 준다', async () => {
    await click(action('rotate'));
    await click(action('rotate')); // 첫 변경 때는 뒤로가기 버튼이 활성화되며 disabled 기록이 더해지므로 두 번째를 센다
    expect($('[data-role="vdom"]', inspector).textContent).toContain('<ol');
    // MOVE 하나 = 빼기 + 넣기 기록 2건
    expect($('[data-role="mutations"]', inspector).textContent).toMatch(/변경 기록 2건/);
  });

  it('편집 중인 항목을 지운 뒤 새 항목을 추가해도 새 항목은 편집 모드가 아니다 (id를 다시 쓰지 않는다)', async () => {
    await click(rowAction(4, 'edit'));
    await click(rowAction(4, 'remove'));
    const input = $('input[name="title"]');
    input.value = '새 항목';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flushUpdates();
    $('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushUpdates();
    expect($('.title-input', root)).toBeNull();
    expect($('.title', rows()[4]).textContent).toBe('새 항목');
    const editingHook = $$('[data-role="hooks"] li', inspector)[2].textContent;
    expect(editingHook).toContain('null');
  });

  it('이미 점수순이면 정렬을 다시 눌러도 렌더하지 않는다', async () => {
    await click(action('sort'));
    const after = commitTitle();
    await click(action('sort'));
    expect(commitTitle()).toBe(after);
  });

  it('렌더가 일어나지 않은 동작의 라벨은 다음 렌더에 붙지 않는다', async () => {
    await click(rowAction(0, 'up')); // 맨 위 항목을 위로 → 변화 없음
    await click(rowAction(0, 'points'));
    expect(commitTitle()).toContain('점수 +1');
    expect(commitTitle()).not.toContain('위로');
  });

  it('한글 조합 중의 Enter로는 저장하지 않는다', async () => {
    await click(rowAction(0, 'edit'));
    const input = $('.title-input', rows()[0]);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }));
    await flushUpdates();
    expect($('.title-input', rows()[0])).not.toBeNull();
  });

  it('편집을 시작하면 입력칸에 포커스가 간다', async () => {
    document.body.appendChild(root); // 포커스는 문서에 붙은 요소에만 간다
    await click(rowAction(1, 'edit'));
    expect(document.activeElement).toBe($('.title-input', rows()[1]));
  });

  it('핸들러 교체 수는 패치 밖 교체 목록(patches.handlers)과 PROPS에서 달거나 뗀 핸들러를 모두 센다', async () => {
    await click(rowAction(0, 'priority'));
    const note = $('.stage .note', inspector).textContent;
    const count = Number(note.match(/(\d+)건/)[1]);
    // 행마다 버튼 6개 핸들러 + 툴바·폼 핸들러가 렌더마다 새로 만들어진다
    expect(count).toBeGreaterThanOrEqual(30);
  });

  it('unmount하면 앱과 패널을 모두 비운다', () => {
    app.unmount();
    expect(root.innerHTML).toBe('');
    expect(inspector.innerHTML).toBe('');
    app = { unmount() {} };
  });
});

describe('종합 데모: 방금 일어난 일 설명 카드', () => {
  const concept = () => $('[data-role="concept"]', inspector);
  const conceptTitle = () => $('h3', concept()).textContent;

  it('첫 렌더는 mount를 설명한다', () => {
    expect(conceptTitle()).toContain('첫 렌더');
  });

  it('key로 재정렬하면 LIS를 이번 숫자로 보여 주고, 실제 React 방식의 이동 횟수와 비교한다', async () => {
    await click(action('rotate'));
    expect(conceptTitle()).toContain('LIS');
    expect($('[data-role="lis-sequence"]', inspector).textContent).toBe('[4, 0, 1, 2, 3]');
    expect($('[data-role="lis-result"]', inspector).textContent).toBe('[0, 1, 2, 3]');
    expect($$('[data-role="lis-chips"] li.move', inspector)).toHaveLength(1);
    expect($('[data-role="lis-ours"]', inspector).textContent).toContain('1번');
    expect($('[data-role="lis-react"]', inspector).textContent).toContain('4번');
  });

  it('위·아래 이동도 같은 LIS 설명을 쓴다', async () => {
    await click(rowAction(1, 'up'));
    expect($('[data-role="lis-sequence"]', inspector).textContent).toBe('[1, 0, 2, 3, 4]');
  });

  it('key를 끄고 재정렬하면 위치 비교를 설명한다', async () => {
    await click(action('toggle-keys'));
    expect(conceptTitle()).toContain('key');
    await click(action('rotate'));
    expect(conceptTitle()).toContain('위치');
    expect($('[data-role="lis-sequence"]', inspector)).toBeNull();
  });

  it('편집은 타입이 바뀌면 교체한다는 가정(REPLACE)을, 우선순위는 PROPS를, 점수는 TEXT와 useMemo를 설명한다', async () => {
    await click(rowAction(0, 'edit'));
    expect(conceptTitle()).toContain('REPLACE');
    await click(rowAction(1, 'priority'));
    expect(conceptTitle()).toContain('PROPS');
    // 설명대로 class는 PROPS, ★ 글자와 "우선 N개"는 TEXT로 나온다
    expect(patchTypes()).toEqual(expect.arrayContaining(['PROPS', 'TEXT']));
    await click(rowAction(1, 'points'));
    expect(conceptTitle()).toContain('TEXT');
    expect(concept().textContent).toContain('useMemo');
  });

  it('추가는 CREATE, 삭제는 REMOVE, ×3은 배칭, 입력은 제어 컴포넌트를 설명한다', async () => {
    const input = $('input[name="title"]');
    input.value = '새 항목';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flushUpdates();
    expect(conceptTitle()).toContain('제어');
    $('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushUpdates();
    expect(conceptTitle()).toContain('CREATE');
    await click(rowAction(0, 'remove'));
    expect(conceptTitle()).toContain('REMOVE');
    await click(action('batch'));
    expect(conceptTitle()).toContain('배칭');
    expect(concept().textContent).toContain('setState 3번');
  });

  it('설명 카드마다 실제 React와의 차이와 기본 개념 링크가 있다', async () => {
    await click(action('rotate'));
    expect($('[data-role="react-note"]', concept()).textContent.length).toBeGreaterThan(10);
    expect($('a[href^="#basics-"]', concept())).not.toBeNull();
  });

  it('타임라인에서 지난 렌더를 고르면 그 렌더의 설명을 보여 준다', async () => {
    await click(action('rotate'));
    await click($('[data-commit="1"]', inspector));
    expect(conceptTitle()).toContain('첫 렌더');
  });
});

describe('종합 데모: 뒤로가기·앞으로가기·초기화', () => {
  const points = (i) => $('.points', rows()[i]).textContent;
  const pressKey = (init, target = document.body) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));

  it('처음에는 뒤로가기·앞으로가기가 비활성이다', () => {
    expect(action('undo').disabled).toBe(true);
    expect(action('redo').disabled).toBe(true);
  });

  it('뒤로가기는 직전 목록으로 돌아가며, diff는 역방향 MOVE 하나만 만든다 (li 재사용)', async () => {
    const before = rows();
    await click(action('rotate'));
    await click(action('undo'));
    expect(rows()).toEqual(before);
    expect(listPatchTypes()).toEqual(['MOVE']);
    expect(commitTitle()).toContain('뒤로가기');
    expect($('[data-role="concept"] h3', inspector).textContent).toContain('시간 여행');
  });

  it('앞으로가기는 되돌린 변경을 다시 적용한다', async () => {
    await click(rowAction(0, 'points'));
    await click(action('undo'));
    expect(points(0)).toBe('3점');
    expect(action('redo').disabled).toBe(false);
    await click(action('redo'));
    expect(points(0)).toBe('4점');
    expect(action('redo').disabled).toBe(true);
  });

  it('되돌린 뒤 새 동작을 하면 앞으로가기 기록은 사라진다', async () => {
    await click(rowAction(0, 'points'));
    await click(action('undo'));
    await click(rowAction(1, 'points'));
    expect(action('redo').disabled).toBe(true);
  });

  it('배칭은 렌더만 묶는다: ×3 뒤에는 상태 변경 3번이 기록되어 뒤로가기 3번으로 원래대로', async () => {
    await click(action('batch'));
    expect(points(0)).toBe('6점');
    await click(action('undo'));
    expect(points(0)).toBe('5점');
    await click(action('undo'));
    await click(action('undo'));
    expect(points(0)).toBe('3점');
    expect(action('undo').disabled).toBe(true);
  });

  it('초기화는 처음 목록으로 돌아가고, 초기화도 뒤로가기로 되돌릴 수 있다', async () => {
    await click(action('rotate'));
    await click(rowAction(0, 'remove'));
    await click(action('reset'));
    expect(titles()).toEqual(['Virtual DOM 구조 설계', 'Diff 5가지 경우', 'key + LIS 재정렬', 'useState 배칭', 'useEffect 정리 함수']);
    expect($('[data-role="concept"] h3', inspector).textContent).toContain('초기화');
    await click(action('undo'));
    expect(rows()).toHaveLength(4);
  });

  it('이미 처음 상태면 초기화해도 렌더하지 않는다', async () => {
    const before = commitTitle();
    await click(action('reset'));
    expect(commitTitle()).toBe(before);
  });

  it('Ctrl+Z / Ctrl+Shift+Z로도 뒤로·앞으로 간다 (입력칸에서는 글자 되돌리기를 방해하지 않는다)', async () => {
    document.body.appendChild(root);
    await click(rowAction(0, 'points'));
    pressKey({ key: 'z', ctrlKey: true });
    await flushUpdates();
    expect(points(0)).toBe('3점');
    pressKey({ key: 'Z', ctrlKey: true, shiftKey: true });
    await flushUpdates();
    expect(points(0)).toBe('4점');

    const input = $('input[name="title"]');
    pressKey({ key: 'z', ctrlKey: true }, input);
    await flushUpdates();
    expect(points(0)).toBe('4점');
  });

  it('unmount하면 단축키 리스너도 떼어 낸다 (useEffect 정리 함수)', async () => {
    await click(rowAction(0, 'points'));
    app.unmount();
    expect(() => pressKey({ key: 'z', ctrlKey: true })).not.toThrow();
    app = { unmount() {} };
  });
});

describe('종합 데모: 정리', () => {
  it('unmount를 두 번 불러도 안전하다', () => {
    app.unmount();
    expect(() => app.unmount()).not.toThrow();
    expect(root.innerHTML).toBe('');
    app = { unmount() {} };
  });

  it('타임라인에서 지난 렌더를 고르면 그 렌더의 패치를 보여 주고, 최신 따라가기로 돌아온다', async () => {
    await click(action('rotate'));
    await click($('[data-commit="1"]', inspector));
    expect(commitTitle()).toContain('렌더 #1');
    expect(patchTypes()).toEqual(['CREATE']);

    await click(rowAction(0, 'points'));
    expect(commitTitle()).toContain('렌더 #1'); // 고른 렌더를 유지

    await click(action('follow-latest', inspector));
    expect(commitTitle()).toContain('렌더 #3');
  });
});
