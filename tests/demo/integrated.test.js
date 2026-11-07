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
    expect(patchTypes()).toEqual(['MOVE']);
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
    expect(patchTypes()).toEqual(['TEXT', 'TEXT']);
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

  it('핸들러 교체 수는 핸들러만 바뀐 패치뿐 아니라 다른 속성과 함께 바뀐 핸들러도 센다', async () => {
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
