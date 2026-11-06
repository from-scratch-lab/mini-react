import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement as h, mountComponent, useState, useEffect, flushUpdates } from '../../src/index.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function setup(makeEffect, getDeps) {
  const api = { log: [] };
  const App = () => {
    const [n, setN] = useState(0);
    api.setN = setN;
    useEffect(makeEffect(api, n), getDeps ? getDeps(n) : undefined);
    return h('p', { id: 'p' }, String(n));
  };
  api.container = document.createElement('div');
  api.component = mountComponent(App, api.container);
  return api;
}

describe('useEffect', () => {
  it('patch가 끝난 뒤에 실행되어 바뀐 DOM을 볼 수 있다', () => {
    let seen;
    const c = document.createElement('div');
    mountComponent(() => {
      useEffect(() => {
        seen = c.textContent;
      }, []);
      return h('p', null, '그려짐');
    }, c);
    expect(seen).toBe('그려짐');
  });

  it('deps가 []이면 처음 한 번만 실행한다', async () => {
    const api = setup((a) => () => a.log.push('run'), () => []);
    api.setN(1);
    await flushUpdates();
    api.setN(2);
    await flushUpdates();
    expect(api.log).toEqual(['run']);
  });

  it('deps 값이 바뀔 때만 다시 실행하고, 그 전에 이전 정리 함수를 부른다', async () => {
    const api = setup(
      (a, n) => () => {
        a.log.push(`run ${Math.floor(n / 2)}`);
        return () => a.log.push(`cleanup ${Math.floor(n / 2)}`);
      },
      (n) => [Math.floor(n / 2)],
    );
    api.setN(1); // deps 0 → 0 : 실행 안 함
    await flushUpdates();
    api.setN(2); // deps 0 → 1 : 정리 후 실행
    await flushUpdates();
    expect(api.log).toEqual(['run 0', 'cleanup 0', 'run 1']);
    api.component.unmount(); // 마지막 정리 함수만 정확히 한 번
    expect(api.log).toEqual(['run 0', 'cleanup 0', 'run 1', 'cleanup 1']);
  });

  it('deps가 없으면 렌더할 때마다 실행한다', async () => {
    const api = setup((a, n) => () => a.log.push(n));
    api.setN(1);
    await flushUpdates();
    expect(api.log).toEqual([0, 1]);
  });

  it('unmount하면 정리 함수를 부른다 (타이머·리스너 누수 방지)', () => {
    vi.useFakeTimers();
    const tick = vi.fn();
    const component = mountComponent(() => {
      useEffect(() => {
        const id = setInterval(tick, 100);
        return () => clearInterval(id);
      }, []);
      return h('p');
    }, document.createElement('div'));
    vi.advanceTimersByTime(250);
    component.unmount();
    vi.advanceTimersByTime(1000);
    expect(tick).toHaveBeenCalledTimes(2);
  });

  it('effect 안에서 setState하면 다시 렌더링한다', async () => {
    const c = document.createElement('div');
    mountComponent(() => {
      const [text, setText] = useState('불러오는 중');
      useEffect(() => {
        setText('완료');
      }, []);
      return h('p', null, text);
    }, c);
    await flushUpdates();
    expect(c.textContent).toBe('완료');
  });

  it('effect가 함수가 아닌 값을 돌려주면 경고한다', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mountComponent(() => {
      useEffect(() => 42, []);
      return h('p');
    }, document.createElement('div'));
    expect(warn).toHaveBeenCalled();
  });

  it('deps 배열 길이가 바뀌면 경고하고 다시 실행한다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const api = setup((a) => () => a.log.push('run'), (n) => (n === 0 ? [1] : [1, 2]));
    api.setN(1);
    await flushUpdates();
    expect(warn).toHaveBeenCalled();
    expect(api.log).toEqual(['run', 'run']);
  });

  it(
    '렌더를 무한히 반복하게 만드는 effect는 오류로 멈춘다',
    async () => {
      const errors = [];
      let renders = 0;
      const App = () => {
        renders += 1;
        const [n, setN] = useState(0);
        useEffect(() => setN(n + 1)); // deps 없음 + 매번 다른 값 → 끝없이 렌더
        return h('p', null, String(n));
      };
      mountComponent(App, document.createElement('div'), {}, { onError: (e) => errors.push(e) });
      await flushUpdates();
      expect(errors[0].message).toMatch(/너무 많이/);
      expect(renders).toBeLessThan(60);
    },
    2000,
  );
});
