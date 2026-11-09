import { describe, it, expect } from 'vitest';
import { countDomOps } from '../../scripts/bench/dom-counter.js';

// 데이터를 모으기 전에 계수기 자체를 검증한다: 일곱 가지 경우 + 원래 메서드 복원.

function setup(n = 4) {
  const outside = document.createElement('div');
  const container = document.createElement('div');
  const ul = document.createElement('ul');
  for (let i = 0; i < n; i += 1) {
    const li = document.createElement('li');
    li.textContent = `i${i}`;
    ul.appendChild(li);
  }
  container.appendChild(ul);
  document.body.append(outside, container);
  return { container, ul, outside, items: [...ul.children] };
}

describe('DOM 조작 계수기', () => {
  it('1. 새 노드 삽입은 insertedNewNodes', () => {
    const { container, ul } = setup();
    const { counts } = countDomOps(container, () => ul.insertBefore(document.createElement('li'), ul.firstChild));
    expect(counts).toMatchObject({ insertedNewNodes: 1, movedExistingNodes: 0, apiCalls: 1 });
  });

  it('2. 기존 노드를 다른 자리로 옮기면 movedExistingNodes', () => {
    const { container, ul, items } = setup();
    const { counts } = countDomOps(container, () => ul.insertBefore(items[3], items[0]));
    expect(counts).toMatchObject({ movedExistingNodes: 1, insertedNewNodes: 0 });
    expect(ul.firstChild).toBe(items[3]);
  });

  it('3. 삭제: remove()·removeChild는 1개씩, textContent=""는 지워진 자식 수', () => {
    const { container, ul, items } = setup();
    const { counts } = countDomOps(container, () => {
      items[0].remove();
      ul.removeChild(items[1]);
      ul.textContent = '';
    });
    expect(counts).toMatchObject({ removedNodes: 4, apiCalls: 3 });
  });

  it('4. 기존 노드가 fragment를 거쳐 들어가도 이동으로 센다 (출처 추적)', () => {
    const { container, ul, items } = setup();
    const { counts } = countDomOps(container, () => {
      const frag = document.createDocumentFragment();
      frag.appendChild(items[2]);
      frag.appendChild(items[3]);
      ul.insertBefore(frag, items[0]);
    });
    expect(counts).toMatchObject({ movedExistingNodes: 2, insertedNewNodes: 0, fragmentAppends: 2, fragmentInsertions: 1 });
  });

  it('5. 새 노드를 fragment로 한 번에 넣으면 insertedNewNodes', () => {
    const { container, ul } = setup();
    const { counts } = countDomOps(container, () => {
      const frag = document.createDocumentFragment();
      for (let i = 0; i < 3; i += 1) frag.appendChild(document.createElement('li'));
      ul.appendChild(frag);
    });
    expect(counts).toMatchObject({ insertedNewNodes: 3, movedExistingNodes: 0, fragmentAppends: 3, fragmentInsertions: 1 });
  });

  it('6. 이미 그 자리에 있는 노드를 같은 자리에 다시 넣는 것은 이동이 아니다', () => {
    const { container, ul, items } = setup();
    const { counts } = countDomOps(container, () => {
      ul.insertBefore(items[1], items[2]); // 바로 뒤 형제 앞 = 같은 자리
      ul.insertBefore(items[1], items[1]); // 자기 자신 앞
      ul.appendChild(items[3]); // 이미 맨 뒤
    });
    expect(counts).toMatchObject({ movedExistingNodes: 0, sameSpotInserts: 3 });
  });

  it('7. container 밖의 변경은 세지 않는다', () => {
    const { container, outside } = setup();
    const { counts } = countDomOps(container, () => {
      outside.appendChild(document.createElement('p'));
      outside.textContent = '';
    });
    expect(counts.apiCalls).toBe(0);
  });

  it('fn이 던져도 원래 메서드를 되돌린다', () => {
    const { container } = setup();
    const before = [Node.prototype.insertBefore, Node.prototype.appendChild, Element.prototype.remove];
    const textSetter = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent').set;
    expect(() => countDomOps(container, () => {
      throw new Error('boom');
    })).toThrow('boom');
    expect([Node.prototype.insertBefore, Node.prototype.appendChild, Element.prototype.remove]).toEqual(before);
    expect(Object.getOwnPropertyDescriptor(Node.prototype, 'textContent').set).toBe(textSetter);
  });
});

describe('엔진에 붙인 계수기', () => {
  it('10개 목록 swap: lis는 기존 노드 2개를, lastPlacedIndex는 7개를 옮긴다', async () => {
    const { diff, patch } = await import('../../src/index.js');
    const { listView, PATTERNS, range } = await import('../../scripts/bench/keyed-workloads.js');
    const keys = range(10);
    const moved = (mode) => {
      const container = document.createElement('div');
      const prev = listView(keys);
      patch(container, diff(null, prev));
      const next = listView(PATTERNS.swap(keys));
      const patches = diff(prev, next, { reconcileMode: mode });
      return countDomOps(container, () => patch(container, patches)).counts;
    };
    expect(moved('lis')).toMatchObject({ movedExistingNodes: 2, insertedNewNodes: 0, removedNodes: 0 });
    expect(moved('lastPlacedIndex')).toMatchObject({ movedExistingNodes: 7, insertedNewNodes: 0, removedNodes: 0 });
  });
});
