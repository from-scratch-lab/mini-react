import { describe, it, expect, vi } from 'vitest';
import { createElement as h, mountComponent, useState, useMemo, flushUpdates } from '../../src/index.js';

function setup(getDeps) {
  const api = { compute: vi.fn((n) => n * 10) };
  const App = () => {
    const [n, setN] = useState(0);
    const [other, setOther] = useState(0);
    Object.assign(api, { setN, setOther });
    api.value = useMemo(() => api.compute(n), getDeps(n, other));
    return h('p', null, String(api.value));
  };
  api.component = mountComponent(App, document.createElement('div'));
  return api;
}

describe('useMemo', () => {
  it('deps가 그대로면 이전 계산 결과를 그대로 돌려준다', async () => {
    const api = setup((n) => [n]);
    api.setOther(1);
    await flushUpdates();
    expect(api.compute).toHaveBeenCalledTimes(1);
    expect(api.value).toBe(0);
  });

  it('deps가 바뀌면 다시 계산한다', async () => {
    const api = setup((n) => [n]);
    api.setN(3);
    await flushUpdates();
    expect(api.compute).toHaveBeenCalledTimes(2);
    expect(api.value).toBe(30);
  });

  it('deps가 없으면 매번 계산한다', async () => {
    const api = setup(() => undefined);
    api.setOther(1);
    await flushUpdates();
    expect(api.compute).toHaveBeenCalledTimes(2);
  });

  it('객체 결과도 deps가 같으면 같은 참조를 돌려준다', async () => {
    const results = [];
    const App = () => {
      const [, set] = useState(0);
      App.set = set;
      results.push(useMemo(() => ({ list: [1, 2] }), []));
      return h('p');
    };
    mountComponent(App, document.createElement('div'));
    App.set(1);
    await flushUpdates();
    expect(results[1]).toBe(results[0]);
  });
});
