import { describe, it, expect, vi } from 'vitest';
import { createElement as h, mountComponent, useState, flushUpdates } from '../../src/index.js';

function setup(initial) {
  const api = { renders: 0 };
  const App = () => {
    api.renders += 1;
    const [value, setValue] = useState(initial);
    api.value = value;
    api.setValue = setValue;
    return h('p', null, String(value));
  };
  const c = document.createElement('div');
  api.component = mountComponent(App, c);
  api.container = c;
  return api;
}

describe('useState', () => {
  it('처음 값을 돌려주고, 함수를 주면 처음 한 번만 불러 초기값을 만든다', () => {
    const init = vi.fn(() => 10);
    const api = setup(init);
    expect(api.value).toBe(10);
    api.component.update();
    expect(init).toHaveBeenCalledTimes(1);
  });

  it('setState는 상태를 바꾸고 화면을 자동으로 다시 그린다', async () => {
    const api = setup(0);
    api.setValue(1);
    await flushUpdates();
    expect(api.container.textContent).toBe('1');
  });

  it('함수형 업데이트는 직전 값을 받아 차례로 적용된다', async () => {
    const api = setup(0);
    api.setValue((n) => n + 1);
    api.setValue((n) => n + 1);
    await flushUpdates();
    expect(api.value).toBe(2);
  });

  it('여러 번 setState해도 한 번만 다시 렌더링한다 (배칭)', async () => {
    const api = setup(0);
    const before = api.renders;
    api.setValue(1);
    api.setValue(2);
    api.setValue(3);
    expect(api.renders).toBe(before); // 아직 렌더하지 않았다
    await flushUpdates();
    expect(api.renders).toBe(before + 1);
    expect(api.container.textContent).toBe('3');
  });

  it('같은 값이면 다시 렌더링하지 않는다', async () => {
    const api = setup('a');
    const before = api.renders;
    api.setValue('a');
    await flushUpdates();
    expect(api.renders).toBe(before);
  });

  it('바꿨다가 원래 값으로 돌려놓아도 렌더는 하되 patch는 없다', async () => {
    const commits = [];
    const App = () => {
      const [v, set] = useState(0);
      App.set = set;
      return h('p', null, String(v));
    };
    mountComponent(App, document.createElement('div'), {}, { onCommit: (p) => commits.push(p.length) });
    App.set(1);
    App.set(0);
    await flushUpdates();
    expect(commits).toEqual([1, 0]);
  });

  it('setState 함수는 렌더가 바뀌어도 같은 함수다', async () => {
    const api = setup(0);
    const first = api.setValue;
    api.setValue(1);
    await flushUpdates();
    expect(api.setValue).toBe(first);
  });

  it('여러 상태는 호출 순서로 각자 자기 자리를 찾는다', async () => {
    const seen = {};
    const App = () => {
      const [a, setA] = useState('a');
      const [b, setB] = useState('b');
      Object.assign(seen, { a, b, setA, setB });
      return h('p', null, a + b);
    };
    const c = document.createElement('div');
    mountComponent(App, c);
    seen.setB('B');
    await flushUpdates();
    expect(c.textContent).toBe('aB');
  });

  it('렌더 중에 setState를 부르면 오류 (렌더는 부수 효과가 없어야 한다)', () => {
    const App = () => {
      const [v, set] = useState(0);
      set(v + 1);
      return h('p');
    };
    expect(() => mountComponent(App, document.createElement('div'))).toThrow(/렌더 중/);
  });

  it('unmount 뒤의 setState는 무시한다', async () => {
    const api = setup(0);
    api.component.unmount();
    const before = api.renders;
    api.setValue(1);
    await flushUpdates();
    expect(api.renders).toBe(before);
    expect(api.container.innerHTML).toBe('');
  });
});
