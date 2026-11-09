import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement as h, diff, patch, PatchType, childrenToHTML } from '../../src/index.js';
import { measureMutations } from '../../scripts/lib/mutations.js';
import { runDifferential } from '../support/differential.js';

afterEach(() => vi.restoreAllMocks());

/**
 * 차등 테스트: 같은 HTML을 브라우저 자신의 파서(innerHTML)로 그린 결과를 정답지로 삼아,
 * Phase 1 경로(htmlToVNodes → diff → patch, 이전 상태에서 이어서)로 그린 결과와 비교한다.
 * 실패하면 시드·라운드·단계·HTML이 메시지에 나오므로 `npm run fuzz -- --seed <시드>`로 그대로 재현할 수 있다.
 */
describe('차등 fuzz: 브라우저 파서가 정답지', () => {
  // CI에는 지금 통과하는 시드만 둔다. 긴 실행(`npm run fuzz`)에서 아직 잡히는 것:
  // - B6: 빈 select에 option을 뒤에서부터 넣어 마지막 option이 선택됨 (시드 99·2026) → perf 연속 CREATE 묶기에서 고침
  // - B7: 하나만 고르는 select의 option끼리, 같은 name의 radio끼리 서로의 선택을 바꾸는데 diff는 바뀐 속성만 다시 넣음
  //   (시드 1·3) → fix/dx-form-groups에서 고침
  // 고쳐지면 그 시드를 여기에 더한다. (docs/decisions/0001-plan.md)
  it.each([7, 20261109])('시드 %i: DOM 구조·폼 상태·직렬화 왕복·DOM 참조가 모두 맞다', (seed) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {}); // 중복 key 경고
    const report = runDifferential({ seed, rounds: 120, steps: 4 });
    expect(report.mismatches, report.mismatches.map(String).join('\n\n')).toEqual([]);
    // 항상 통과하는 테스트가 되지 않도록: 무작위 입력이 패치 종류를 실제로 고루 거쳤는지 본다.
    expect(Object.keys(report.patchesByType).sort()).toEqual(Object.values(PatchType).sort());
    expect(report.steps).toBe(480);
  });

  it('이전 트리의 하위 트리 객체를 다른 자리·두 자리에 다시 써도 맞다 (vnode 재사용 시드)', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const report = runDifferential({ seed: 31, rounds: 100, steps: 4, reuse: 0.6 });
    expect(report.mismatches, report.mismatches.map(String).join('\n\n')).toEqual([]);
    expect(report.reused).toBeGreaterThan(100); // 재사용이 실제로 일어났는지
  });

});

// 항상 통과하는 검사가 아닌지: 검사 종류마다 버그를 일부러 넣고 그 종류로 보고하는지 본다.
describe('차등 fuzz 하네스 자체 검사', () => {
  const firstKind = (options) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const report = runDifferential({ seed: 7, rounds: 40, steps: 4, maxMismatches: 1, ...options });
    expect(report.mismatches, '버그를 넣었는데 불일치가 없다').toHaveLength(1);
    return report.mismatches[0];
  };

  it('dom: TEXT 패치를 빠뜨리면 잡고, 최소 재현을 함께 보고한다', () => {
    const m = firstKind({ patchImpl: (c, ps) => patch(c, ps.filter((p) => p.type !== PatchType.TEXT)) });
    expect(m.kind).toBe('dom');
    expect(String(m)).toMatch(/seed 7 · round \d+ · step \d+ · dom/);
    expect(m.minimal, '두 단계로 다시 만들 수 있는 실패다').not.toBeNull();
    expect(m.minimal.previous.length + m.minimal.html.length).toBeLessThanOrEqual(m.previous.length + m.html.length);
    expect(String(m)).toContain('최소 재현');
  });

  it('dom: patch 결과에 남은 줄바꿈 공백 텍스트도 잡는다 (patch 쪽은 걷어 내지 않고 비교)', () => {
    const m = firstKind({
      patchImpl: (c, ps) => {
        const result = patch(c, ps);
        c.appendChild(c.ownerDocument.createTextNode('\n  '));
        return result;
      },
    });
    expect(m.kind).toBe('dom');
  });

  it('live: 속성은 그대로 두고 체크 상태(프로퍼티)만 틀리면 잡는다', () => {
    const m = firstKind({
      patchImpl: (c, ps) => {
        const result = patch(c, ps);
        const box = c.querySelector('input[type="checkbox"]');
        if (box) box.checked = !box.checked;
        return result;
      },
    });
    expect(m.kind).toBe('live');
  });

  it('refs: 가상 노드의 dom 참조가 끊기면 잡는다', () => {
    const m = firstKind({
      patchImpl: (c, ps) => {
        const result = patch(c, ps);
        const text = ps.find((p) => p.type === PatchType.TEXT);
        if (text) text.vnode.dom = null;
        return result;
      },
    });
    expect(m.kind).toBe('refs');
    expect(m.got).toContain('dom이 없음');
  });

  it('idempotent: 테스트 영역에 보여 줄 코드가 그린 트리와 다르면 잡는다', () => {
    const m = firstKind({ serialize: (children) => childrenToHTML(children.slice(0, -1)) });
    expect(m.kind).toBe('idempotent');
  });
});

describe('measureMutations: 실제 DOM 변경을 세는 공용 측정', () => {
  it('기록 수, 붙이고 뗀 노드 수, 새로 생긴 노드 수를 따로 센다', () => {
    const container = document.createElement('div');
    const v1 = h('ul', null, h('li', { key: 'a' }, 'A'), h('li', { key: 'b' }, 'B'));
    patch(container, diff(null, v1));

    const v2 = h('ul', null, h('li', { key: 'b' }, 'B'), h('li', { key: 'c' }, 'C'));
    const m = measureMutations(container, () => patch(container, diff(v1, v2)));
    // a 삭제(기록 1, 뗌 1), c 생성(기록 1, 붙임 1, 새 노드 li+텍스트 2). b는 LIS로 제자리.
    expect(m).toMatchObject({ records: 2, nodesAdded: 1, nodesRemoved: 1, created: 2 });
    expect(m.result).toHaveLength(2);
  });

  it('fragment로 한 번에 붙이면 기록은 1이어도 붙인 노드 수와 새 노드 수는 그대로다', () => {
    const container = document.createElement('div');
    const m = measureMutations(container, () => {
      const fragment = document.createDocumentFragment();
      for (let i = 0; i < 3; i += 1) fragment.appendChild(document.createElement('p'));
      container.appendChild(fragment);
    });
    expect(m).toMatchObject({ records: 1, nodesAdded: 3, nodesRemoved: 0, created: 3 });
  });

  it('바뀐 것이 없으면 모두 0이다', () => {
    const container = document.createElement('div');
    const v = h('p', null, 'x');
    patch(container, diff(null, v));
    expect(measureMutations(container, () => patch(container, diff(v, h('p', null, 'x'))))).toMatchObject({
      records: 0,
      nodesAdded: 0,
      nodesRemoved: 0,
      created: 0,
    });
  });
});

describe('fuzz가 찾았던 정확성 버그 (회귀 방지)', () => {
  // B6: diffChildren은 CREATE를 뒤에서부터 낸다. 빈 select에 option을 마지막 것부터 넣으면 하나만 고르는 select가
  // 처음 들어온(마지막) option을 골랐다. 연속 CREATE를 fragment로 앞에서부터 넣어(feat/batch-insert) 고쳤다.
  // 빈 select에 option을 한 번에 넣는 경우만이다. 기존 option 앞에 새 option을 넣을 때의 선택은 선택 그룹(B7) 쪽에서 다룬다.
  it('B6: 빈 select에 option을 여러 개 만들면 첫 option이 선택된다', () => {
    const container = document.createElement('div');
    const v1 = h('select', null);
    patch(container, diff(null, v1));
    patch(container, diff(v1, h('select', null, h('option', null, 'a'), h('option', null, 'b'))));
    expect(container.firstChild.selectedIndex).toBe(0);
  });
});
