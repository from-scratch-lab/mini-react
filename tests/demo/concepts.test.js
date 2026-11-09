import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONCEPTS, reactMoves, reorderInfo } from '../../demo/integrated/concepts.js';

// jsdom 환경의 전역 URL은 Node의 fs가 받지 않으므로 경로 문자열로 읽는다.
const here = dirname(fileURLToPath(import.meta.url));
const page = new DOMParser().parseFromString(
  readFileSync(resolve(here, '../../demo/integrated/index.html'), 'utf8'),
  'text/html',
);

describe('종합 페이지 설명 카드와 기본 개념', () => {
  it('모든 설명 카드의 "기본 개념 더 보기" 링크가 페이지의 실제 항목을 가리킨다', () => {
    for (const [key, concept] of Object.entries(CONCEPTS)) {
      expect(page.getElementById(`basics-${concept.basics}`), key).not.toBeNull();
    }
  });

  it('"이렇게 해 보세요" 안내는 펼쳐진 채 제목과 목록을 보여 준다 (마크업 짝이 맞다)', () => {
    const tips = page.querySelector('header .tips');
    expect(tips.localName).toBe('details');
    expect(tips.hasAttribute('open')).toBe(true);
    expect(tips.querySelector(':scope > summary').textContent).toBe('이렇게 해 보세요');
    expect(tips.querySelectorAll('li').length).toBeGreaterThanOrEqual(4);
    // 기본 개념 절은 header 밖의 독립 섹션이다
    expect(page.querySelector('header #basics-lis')).toBeNull();
  });
});

describe('과제 중점 포인트 설명 (기본 개념 8~11절)', () => {
  const section = (id) => page.getElementById(`basics-${id}`);

  it.each([
    ['dom-api', 'Document와 Window', ['queueMicrotask', 'createElementNS', 'defaultValue', 'offsetHeight', 'src/diff/patch.js']],
    ['change-detection', 'DOM 변화 감지', ['takeRecords', 'characterData', 'ResizeObserver', 'DOMNodeInserted', '제어 컴포넌트']],
    ['components', '컴포넌트', ['BacklogItem', '순수 함수', 'Fiber']],
    ['state-location', 'State', ['Lifting State Up', 'useMemo', '공통 조상', 'past, present, future']],
  ])('%s 절이 있고 제목과 핵심 용어를 설명한다', (id, title, terms) => {
    const el = section(id);
    expect(el, id).not.toBeNull();
    expect(el.querySelector('h3').textContent).toContain(title);
    for (const term of terms) expect(el.textContent, `${id}: ${term}`).toContain(term);
  });

  it('변화 감지 비교표는 다섯 가지 방법을 한 줄씩, 방법·알려 주는 것·한계 세 칸으로 비교한다', () => {
    const rows = [...section('change-detection').querySelectorAll('table.compare tbody tr')];
    expect(rows.map((tr) => tr.cells.length)).toEqual([3, 3, 3, 3, 3]);
    expect(rows[0].cells[0].textContent).toBe('MutationObserver');
  });

  it('2절(Reflow·가상 DOM)은 벤치마크 문서의 측정 수치로 근거를 든다', () => {
    const text = section('virtual-dom').textContent;
    expect(text).toContain('docs/benchmarks.md');
    expect(text).toContain('MutationObserver');
  });

  it('새 절은 기본 개념 안에 번호 순서대로 이어 붙는다', () => {
    const numbers = [...page.querySelectorAll('.basics > section > h3')].map((h) => parseInt(h.textContent, 10));
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
    expect(numbers.length).toBeGreaterThanOrEqual(11);
  });
});

describe('reactMoves: 실제 React(lastPlacedIndex) 방식의 이동 횟수', () => {
  it('맨 뒤를 맨 앞으로 올리면 나머지를 모두 옮긴다', () => {
    expect(reactMoves([4, 0, 1, 2, 3])).toBe(4);
  });

  it('맨 앞을 맨 뒤로 보내면 하나만 옮긴다', () => {
    expect(reactMoves([1, 2, 3, 4, 0])).toBe(1);
  });

  it('뒤집으면 첫 항목을 뺀 나머지를 옮긴다', () => {
    expect(reactMoves([4, 3, 2, 1, 0])).toBe(4);
  });

  it('순서가 그대로면 옮기지 않는다', () => {
    expect(reactMoves([0, 1, 2])).toBe(0);
  });
});

describe('reorderInfo: 새 순서대로 늘어놓은 이전 위치', () => {
  const items = (...ids) => ids.map((id) => ({ id, title: `t${id}` }));

  it('순서만 바뀐 경우 이전 위치 수열과 제목을 돌려준다', () => {
    expect(reorderInfo(items(1, 2, 3), items(3, 1, 2))).toEqual({ sequence: [2, 0, 1], titles: ['t3', 't1', 't2'] });
  });

  it('길이가 다르거나 새 항목이 있으면 재정렬이 아니므로 null', () => {
    expect(reorderInfo(items(1, 2), items(1, 2, 3))).toBeNull();
    expect(reorderInfo(items(1, 2), items(1, 9))).toBeNull();
    expect(reorderInfo(undefined, items(1))).toBeNull();
  });
});
