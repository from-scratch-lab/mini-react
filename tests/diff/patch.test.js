import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement as h, diff, patch } from '../../src/index.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function mount(vnode) {
  const container = document.createElement('div');
  patch(container, diff(null, vnode));
  return container;
}

function update(container, prev, next) {
  return patch(container, diff(prev, next));
}

afterEach(() => vi.restoreAllMocks());

const keyedList = (keys) => h('ul', null, ...keys.map((k) => h('li', { key: k }, k)));

describe('patch', () => {
  it('처음 렌더하면 가상 트리 전체를 만든다', () => {
    const c = mount(h('ul', { id: 'l' }, h('li', null, 'a')));
    expect(c.innerHTML).toBe('<ul id="l"><li>a</li></ul>');
  });

  it('추가·삭제·교체·속성·텍스트를 반영하고, 바뀌지 않은 노드는 그대로 둔다', () => {
    const prev = h('div', { class: 'a' }, h('p', null, 'keep'), h('span', null, 'old'), h('b', null, 'x'));
    const next = h(
      'div',
      { class: 'b' },
      h('p', null, 'keep'),
      h('em', null, 'new'),
      h('b', null, 'y'),
      h('i', null, 'added'),
    );
    const c = mount(prev);
    const keptP = c.querySelector('p');
    update(c, prev, next);
    expect(c.innerHTML).toBe('<div class="b"><p>keep</p><em>new</em><b>y</b><i>added</i></div>');
    expect(c.querySelector('p')).toBe(keptP);
  });

  it('key 재정렬은 기존 DOM 노드를 옮길 뿐 다시 만들지 않는다', () => {
    const prev = keyedList(['a', 'b', 'c', 'd']);
    const c = mount(prev);
    const before = Object.fromEntries([...c.querySelectorAll('li')].map((n) => [n.textContent, n]));
    update(c, prev, keyedList(['d', 'b', 'a', 'c']));
    const after = [...c.querySelectorAll('li')];
    expect(after.map((n) => n.textContent)).toEqual(['d', 'b', 'a', 'c']);
    after.forEach((n) => expect(n).toBe(before[n.textContent]));
  });

  it('MutationObserver로 세어도 실제 DOM 변경이 최소다', () => {
    const prev = keyedList(['a', 'b', 'c', 'd', 'e']);
    const c = mount(prev);
    const observer = new MutationObserver(() => {});
    observer.observe(c, { childList: true, subtree: true, characterData: true, attributes: true });
    update(c, prev, keyedList(['e', 'a', 'b', 'c', 'd']));
    const records = observer.takeRecords();
    observer.disconnect();
    // 노드 하나를 옮기면 '빼기 + 넣기' 기록 2개. 텍스트·속성 변경은 없어야 한다.
    expect(records).toHaveLength(2);
    expect(records.every((r) => r.type === 'childList')).toBe(true);
  });

  it('on* 함수 props는 이벤트 핸들러로 연결·교체·제거한다', () => {
    const first = vi.fn();
    const second = vi.fn();
    const v1 = h('button', { onClick: first }, 'go');
    const c = mount(v1);
    const button = c.querySelector('button');

    button.click();
    const v2 = h('button', { onClick: second }, 'go');
    update(c, v1, v2);
    button.click();
    update(c, v2, h('button', null, 'go'));
    button.click();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(button.getAttribute('onclick')).toBeNull();
  });

  it('style 객체를 반영하고 사라진 스타일 속성은 지운다', () => {
    const v1 = h('div', { style: { color: 'red', fontSize: '12px' } });
    const c = mount(v1);
    const div = c.firstChild;
    expect(div.style.color).toBe('red');
    update(c, v1, h('div', { style: { color: 'blue' } }));
    expect(div.style.color).toBe('blue');
    expect(div.style.fontSize).toBe('');
  });

  it('input의 value·checked는 사용자가 바꾼 값이 있어도 프로퍼티로 맞춘다', () => {
    const v1 = h('input', { value: 'a', checked: true, type: 'checkbox' });
    const c = mount(v1);
    const input = c.firstChild;
    expect(input.checked).toBe(true);
    input.value = 'typed';
    update(c, v1, h('input', { value: 'b', checked: false, type: 'checkbox' }));
    expect(input.value).toBe('b');
    expect(input.checked).toBe(false);
  });

  it('boolean 속성은 true면 붙이고 false면 뗀다', () => {
    const v1 = h('button', { disabled: true });
    const c = mount(v1);
    expect(c.firstChild.hasAttribute('disabled')).toBe(true);
    update(c, v1, h('button', { disabled: false }));
    expect(c.firstChild.hasAttribute('disabled')).toBe(false);
  });

  it('HTML에서 읽은 문자열 속성(checked="")은 그대로 속성으로 둔다', () => {
    const c = mount(h('input', { type: 'checkbox', checked: '' }));
    expect(c.firstChild.checked).toBe(true);
  });

  it('className은 class 속성으로 쓴다', () => {
    const c = mount(h('p', { className: 'lead' }));
    expect(c.innerHTML).toBe('<p class="lead"></p>');
  });

  it('SVG 요소는 SVG 네임스페이스로 만든다', () => {
    const c = mount(h('svg', { viewBox: '0 0 10 10' }, h('circle', { r: '5' })));
    expect(c.firstChild.namespaceURI).toBe(SVG_NS);
    expect(c.querySelector('circle').namespaceURI).toBe(SVG_NS);
    expect(c.firstChild.getAttribute('viewBox')).toBe('0 0 10 10');
  });

  it('select의 value는 option을 만든 뒤에 반영한다', () => {
    const c = mount(h('select', { value: 'b' }, h('option', { value: 'a' }, 'A'), h('option', { value: 'b' }, 'B')));
    expect(c.firstChild.value).toBe('b');
  });

  it('루트를 교체하고 지울 수 있다', () => {
    const v1 = h('p', null, 'a');
    const c = mount(v1);
    const v2 = h('section', null, 'b');
    update(c, v1, v2);
    expect(c.innerHTML).toBe('<section>b</section>');
    update(c, v2, null);
    expect(c.innerHTML).toBe('');
  });

  it('중복 key가 있어도 결과 DOM은 다음 트리와 같다', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const prev = keyedList(['a', 'a', 'b']);
    const c = mount(prev);
    update(c, prev, keyedList(['b', 'a', 'a', 'c']));
    expect([...c.querySelectorAll('li')].map((n) => n.textContent)).toEqual(['b', 'a', 'a', 'c']);
  });

  it('이전 트리의 vnode 객체를 다른 자리에 다시 써도 엉뚱한 DOM을 지우지 않는다', () => {
    const a = h('li', null, 'A');
    const b = h('li', null, 'B');
    const prev = h('ul', null, a, b);
    const c = mount(prev);
    const next = h('ul', null, b); // 위치로 비교하면 b가 a 자리와 짝이 된다
    update(c, prev, next);
    expect(c.innerHTML).toBe('<ul><li>B</li></ul>');
    expect(next.children[0].dom).toBe(c.querySelector('li'));
    update(c, next, h('ul', null, h('li', null, 'C')));
    expect(c.innerHTML).toBe('<ul><li>C</li></ul>');
  });

  it('한 트리에 같은 vnode 객체를 두 번 넣어도 각각 그리고 따로 갱신한다', () => {
    const item = h('li', null, 'x');
    const prev = h('ul', null, item, item);
    const c = mount(prev);
    expect(c.innerHTML).toBe('<ul><li>x</li><li>x</li></ul>');
    const next = h('ul', null, h('li', null, 'x'), h('li', null, 'y'));
    update(c, prev, next);
    expect(c.innerHTML).toBe('<ul><li>x</li><li>y</li></ul>');
    // 두 li가 서로 다른 DOM을 가리키고 있어야 첫 번째만 바꿀 수 있다.
    update(c, next, h('ul', null, h('li', null, 'z'), h('li', null, 'y')));
    expect(c.innerHTML).toBe('<ul><li>z</li><li>y</li></ul>');
  });

  it('적용한 패치 목록을 돌려준다', () => {
    const v1 = h('p', null, 'a');
    const c = mount(v1);
    const patches = update(c, v1, h('p', null, 'b'));
    expect(patches).toHaveLength(1);
  });
});

describe('patch: 폼 상태와 특수 속성', () => {
  it('HTML에서 읽은 checked=""를 지웠다가 되돌리면 체크 상태도 돌아온다', () => {
    const v1 = h('input', { type: 'checkbox', checked: '' });
    const c = mount(v1);
    const v2 = h('input', { type: 'checkbox' });
    update(c, v1, v2);
    expect(c.firstChild.checked).toBe(false);
    update(c, v2, h('input', { type: 'checkbox', checked: '' }));
    expect(c.firstChild.checked).toBe(true);
  });

  it('option의 selected=""도 지웠다가 되돌리면 선택이 돌아온다', () => {
    const select = (selected) =>
      h('select', null, h('option', { value: 'a' }, 'A'), h('option', selected ? { value: 'b', selected: '' } : { value: 'b' }, 'B'));
    const v1 = select(true);
    const c = mount(v1);
    const v2 = select(false);
    update(c, v1, v2);
    update(c, v2, select(true));
    expect(c.firstChild.value).toBe('b');
  });

  it('사용자가 입력한 텍스트 input도 value prop이 바뀌면 그 값으로 맞춘다', () => {
    const v1 = h('input', { type: 'text', value: 'a' });
    const c = mount(v1);
    const input = c.firstChild;
    input.value = '사용자 입력';
    update(c, v1, h('input', { type: 'text', value: 'b' }));
    expect(input.value).toBe('b');
  });

  it('li·progress의 value는 속성으로만 다룬다 (지우면 속성이 사라진다)', () => {
    const v1 = h('div', null, h('ol', null, h('li', { value: '3' }, 'x')), h('progress', { value: '0.5' }));
    const c = mount(v1);
    update(c, v1, h('div', null, h('ol', null, h('li', null, 'x')), h('progress')));
    expect(c.innerHTML).toBe('<div><ol><li>x</li></ol><progress></progress></div>');
  });

  it('option 추가와 select value 변경이 한 번에 와도 새 option이 선택된다', () => {
    const v1 = h('select', { value: 'a' }, h('option', { value: 'a' }, 'A'));
    const c = mount(v1);
    update(c, v1, h('select', { value: 'b' }, h('option', { value: 'a' }, 'A'), h('option', { value: 'b' }, 'B')));
    expect(c.firstChild.value).toBe('b');
  });

  it('value는 type·max 같은 다른 속성을 넣은 뒤에 넣는다 (range가 잘리지 않게)', () => {
    const c = mount(h('input', { value: '150', type: 'range', max: '200' }));
    expect(c.firstChild.value).toBe('150');
  });

  it('속성을 갱신할 때도 value는 max 같은 다른 속성 뒤에 넣는다', () => {
    const v1 = h('input', { type: 'range', value: '5', max: '10' });
    const c = mount(v1);
    update(c, v1, h('input', { type: 'range', value: '50', max: '100' }));
    expect(c.firstChild.value).toBe('50');
  });

  it('on* 값이 문자열에서 함수로 바뀌면 문자열 속성을 지운다 (둘 다 실행되지 않게)', () => {
    window.__inline = vi.fn();
    const handler = vi.fn();
    const v1 = h('button', { onclick: 'window.__inline()' });
    const c = mount(v1);
    update(c, v1, h('button', { onclick: handler }));
    c.firstChild.click();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(window.__inline).not.toHaveBeenCalled();
    expect(c.firstChild.hasAttribute('onclick')).toBe(false);
    delete window.__inline;
  });

  it('xlink:href 같은 접두어 속성은 네임스페이스와 함께 쓴다', () => {
    const XLINK = 'http://www.w3.org/1999/xlink';
    const v1 = h('svg', null, h('use', { 'xlink:href': '#a' }));
    const c = mount(v1);
    const use = c.querySelector('use');
    expect(use.getAttributeNS(XLINK, 'href')).toBe('#a');
    update(c, v1, h('svg', null, h('use', null)));
    expect(use.hasAttributeNS(XLINK, 'href')).toBe(false);
  });

  it('textarea 안의 텍스트가 바뀌면 사용자가 입력한 뒤라도 화면 값도 바꾼다', () => {
    const v1 = h('textarea', null, 'abc');
    const c = mount(v1);
    const textarea = c.firstChild;
    textarea.value = '사용자 입력';
    update(c, v1, h('textarea', null, 'xyz'));
    expect(textarea.value).toBe('xyz');
  });

  it('style이 문자열에서 객체로 바뀌면 이전 선언을 지운다', () => {
    const v1 = h('div', { style: 'color: red; margin: 4px' });
    const c = mount(v1);
    update(c, v1, h('div', { style: { color: 'blue' } }));
    expect(c.firstChild.style.color).toBe('blue');
    expect(c.firstChild.style.margin).toBe('');
  });

  it('onDoubleClick은 dblclick 이벤트로 연결한다', () => {
    const handler = vi.fn();
    const c = mount(h('div', { onDoubleClick: handler }));
    c.firstChild.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('on* 값이 함수에서 문자열로 바뀌면 핸들러를 떼고 속성으로 쓴다', () => {
    const handler = vi.fn();
    const v1 = h('div', { onFoo: handler });
    const c = mount(v1);
    update(c, v1, h('div', { onFoo: 'bar' }));
    c.firstChild.dispatchEvent(new Event('foo'));
    expect(handler).not.toHaveBeenCalled();
    expect(c.firstChild.getAttribute('onfoo')).toBe('bar');
  });

  it('template의 자식은 template.content 안에 만든다', () => {
    const v1 = h('template', null, h('p', null, 'x'));
    const c = mount(v1);
    const template = c.firstChild;
    expect(template.childNodes).toHaveLength(0);
    expect(template.content.firstChild.localName).toBe('p');
    update(c, v1, h('template', null, h('p', null, 'x'), h('b', null, 'y')));
    expect(template.content.childNodes).toHaveLength(2);
  });
});
