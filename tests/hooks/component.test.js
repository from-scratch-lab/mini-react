import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createElement as h,
  FunctionComponent,
  mountComponent,
  useState,
  useMemo,
  flushUpdates,
} from '../../src/index.js';

afterEach(() => vi.restoreAllMocks());

const container = () => document.createElement('div');

describe('FunctionComponent', () => {
  it('hooks 배열을 가지고, mount()하면 처음 렌더링한다', () => {
    const App = () => h('p', { class: 'a' }, '안녕');
    const c = container();
    const component = new FunctionComponent(App, {}, c);
    expect(component.hooks).toEqual([]);
    component.mount();
    expect(c.innerHTML).toBe('<p class="a">안녕</p>');
  });

  it('update()는 다시 렌더링하고 바뀐 부분만 patch한다', () => {
    let label = 'a';
    const App = () => h('div', null, h('span', null, '고정'), h('b', null, label));
    const c = container();
    const component = new FunctionComponent(App, {}, c).mount();
    const fixed = c.querySelector('span');
    label = 'b';
    const patches = component.update();
    expect(c.innerHTML).toBe('<div><span>고정</span><b>b</b></div>');
    expect(c.querySelector('span')).toBe(fixed);
    expect(patches.map((p) => p.type)).toEqual(['TEXT']);
  });

  it('렌더할 때마다 함수가 새로 실행되지만 hooks 배열에 상태가 남는다', () => {
    let setCount;
    const App = () => {
      const [count, set] = useState(0);
      setCount = set;
      return h('p', null, String(count));
    };
    const c = container();
    const component = mountComponent(App, c);
    setCount(5);
    component.update();
    expect(c.textContent).toBe('5');
    expect(component.hooks).toHaveLength(1);
  });

  it('unmount()하면 화면에서 지운다', () => {
    const c = container();
    const component = mountComponent(() => h('p', null, 'x'), c);
    component.unmount();
    expect(c.innerHTML).toBe('');
  });

  it('mount 전에 update()하거나 두 번 mount()하면 오류', () => {
    const component = new FunctionComponent(() => h('p'), {}, container());
    expect(() => component.update()).toThrow();
    component.mount();
    expect(() => component.mount()).toThrow();
  });
});

describe('자식 컴포넌트 (상태 없는 순수 함수)', () => {
  it('props와 children을 받아 가상 트리를 돌려주고, 렌더할 때 펼쳐진다', () => {
    const Badge = ({ tone, children }) => h('span', { class: `badge ${tone}` }, children);
    const App = () => h('div', null, h(Badge, { tone: 'ok' }, '완료'));
    const c = container();
    mountComponent(App, c);
    expect(c.innerHTML).toBe('<div><span class="badge ok">완료</span></div>');
  });

  it('children을 props로 넘겨도 자식 컴포넌트가 받는다', () => {
    const Box = ({ children }) => h('section', null, children);
    const c = container();
    mountComponent(() => h(Box, { children: 'hello' }), c);
    expect(c.innerHTML).toBe('<section>hello</section>');
  });

  it('자식 컴포넌트 안의 자식 컴포넌트도 펼친다', () => {
    const Inner = ({ n }) => h('i', null, String(n));
    const Outer = ({ n }) => h('b', null, h(Inner, { n: n + 1 }));
    const c = container();
    mountComponent(() => h(Outer, { n: 1 }), c);
    expect(c.innerHTML).toBe('<b><i>2</i></b>');
  });

  it('null·false를 돌려주면 아무것도 그리지 않고, 문자열은 텍스트가 된다', () => {
    const Maybe = ({ show }) => (show ? '보임' : null);
    const c = container();
    mountComponent(() => h('p', null, h(Maybe, { show: false }), h(Maybe, { show: true })), c);
    expect(c.innerHTML).toBe('<p>보임</p>');
  });

  it('컴포넌트에 준 key가 결과 노드의 key가 되어 목록 재정렬 때 DOM을 재사용한다', () => {
    const Item = ({ label }) => h('li', null, label);
    let order = ['a', 'b', 'c'];
    const App = () => h('ul', null, order.map((k) => h(Item, { key: k, label: k })));
    const c = container();
    const component = mountComponent(App, c);
    const before = [...c.querySelectorAll('li')];
    order = ['c', 'a', 'b'];
    const patches = component.update();
    expect([...c.querySelectorAll('li')]).toEqual([before[2], before[0], before[1]]);
    expect(patches.map((p) => p.type)).toEqual(['MOVE']);
  });

  it('자식 컴포넌트에서 훅을 부르면 오류 (상태는 루트 컴포넌트만 가진다)', () => {
    const Child = () => {
      useState(0);
      return h('p');
    };
    expect(() => mountComponent(() => h('div', null, h(Child)), container())).toThrow(/루트 컴포넌트/);
  });

  it('렌더 밖에서 훅을 부르면 오류', () => {
    expect(() => useMemo(() => 1, [])).toThrow(/렌더 중/);
  });
});

describe('훅 호출 순서 검사', () => {
  it('렌더마다 훅의 종류·순서가 바뀌면 오류로 알리고, 화면과 상태는 이전 그대로 둔다', () => {
    let flag = true;
    const App = () => {
      const [n] = useState(0);
      if (flag) useState('조건부');
      else useMemo(() => 1, []);
      return h('p', null, String(n));
    };
    const c = container();
    const component = mountComponent(App, c);
    const before = component.vnode;
    flag = false;
    expect(() => component.update()).toThrow(/순서/);
    expect(c.innerHTML).toBe('<p>0</p>');
    expect(component.vnode).toBe(before);
    // 조건을 되돌리면 다시 정상 동작한다.
    flag = true;
    expect(component.update()).toEqual([]);
  });

  it('렌더마다 훅 개수가 바뀌면 오류로 알린다', () => {
    let extra = false;
    const App = () => {
      useState(0);
      if (extra) useState(1);
      return h('p');
    };
    const component = mountComponent(App, container());
    extra = true;
    expect(() => component.update()).toThrow(/개수/);
  });
});

describe('onCommit', () => {
  it('patch할 때마다 적용한 패치 목록을 알려 준다', async () => {
    const commits = [];
    let setText;
    const App = () => {
      const [text, set] = useState('a');
      setText = set;
      return h('p', null, text);
    };
    mountComponent(App, container(), {}, { onCommit: (patches) => commits.push(patches.map((p) => p.type)) });
    setText('b');
    await flushUpdates();
    expect(commits).toEqual([['CREATE'], ['TEXT']]);
  });
});
