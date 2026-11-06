import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createElement as h,
  FunctionComponent,
  mountComponent,
  useState,
  useEffect,
  flushUpdates,
} from '../../src/index.js';

// 실패 경로: 렌더·patch·effect·정리 함수가 예외를 던져도 컴포넌트 상태가 어긋나지 않아야 한다.

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const container = () => document.createElement('div');

describe('patch가 실패할 때', () => {
  it('실제 DOM을 직전 트리로 되돌리고, 다음 렌더의 effect는 한 번씩만 실행한다', async () => {
    const errors = [];
    const runs = [];
    let setN;
    const App = () => {
      const [n, set] = useState(0);
      setN = set;
      useEffect(() => {
        runs.push(n);
      }, [n]);
      // n이 1일 때만 DOM API가 받지 않는 속성 이름을 내보내 patch를 실패시킨다.
      return h('div', null, h('p', null, String(n)), n === 1 ? h('span', { 'bad name': '1' }) : null);
    };
    const c = container();
    mountComponent(App, c, {}, { onError: (e) => errors.push(e.message) });

    setN(1);
    await flushUpdates();
    expect(c.innerHTML).toBe('<div><p>0</p></div>');

    setN(2);
    await flushUpdates();
    expect(c.innerHTML).toBe('<div><p>2</p></div>');
    expect(runs).toEqual([0, 2]);
    expect(errors).toHaveLength(1);
  });
});

describe('effect·정리 함수가 실패할 때', () => {
  it('하나가 던져도 나머지 effect는 실행하고, 오류는 onError로 알린다', async () => {
    const errors = [];
    const log = [];
    let setN;
    const App = () => {
      const [n, set] = useState(0);
      setN = set;
      useEffect(() => {
        if (n === 1) throw new Error('effect boom');
      }, [n]);
      useEffect(() => {
        log.push(`save ${n}`);
      }, [n]);
      return h('p', null, String(n));
    };
    mountComponent(App, container(), {}, { onError: (e) => errors.push(e.message) });
    setN(1);
    await flushUpdates();
    expect(log).toEqual(['save 0', 'save 1']);
    expect(errors).toEqual(['effect boom']);
  });

  it('정리 함수가 던져도 같은 정리 함수를 두 번 부르지 않는다', async () => {
    const errors = [];
    const log = [];
    let setN;
    const App = () => {
      const [n, set] = useState(0);
      setN = set;
      useEffect(() => {
        log.push(`run ${n}`);
        return () => {
          log.push(`cleanup ${n}`);
          if (n === 0) throw new Error('cleanup boom');
        };
      }, [n]);
      return h('p');
    };
    const component = mountComponent(App, container(), {}, { onError: (e) => errors.push(e.message) });
    setN(1);
    await flushUpdates();
    component.unmount();
    expect(log).toEqual(['run 0', 'cleanup 0', 'run 1', 'cleanup 1']);
    expect(errors).toEqual(['cleanup boom']);
  });

  it('unmount 중 정리 함수 하나가 던져도 나머지 정리와 DOM 제거를 마친 뒤 오류를 던진다', () => {
    const second = vi.fn();
    const c = container();
    const component = mountComponent(() => {
      useEffect(() => () => {
        throw new Error('cleanup boom');
      }, []);
      useEffect(() => second, []);
      return h('p', null, 'x');
    }, c);
    expect(() => component.unmount()).toThrow('cleanup boom');
    expect(second).toHaveBeenCalledTimes(1);
    expect(c.innerHTML).toBe('');
  });

  it('mount 중 effect가 던지면(onError 없음) 스스로 정리하고 오류를 던진다', () => {
    vi.useFakeTimers();
    const tick = vi.fn();
    const c = container();
    expect(() =>
      mountComponent(() => {
        useEffect(() => {
          const id = setInterval(tick, 10);
          return () => clearInterval(id);
        }, []);
        useEffect(() => {
          throw new Error('mount effect boom');
        }, []);
        return h('p', null, 'x');
      }, c),
    ).toThrow('mount effect boom');
    vi.advanceTimersByTime(100);
    expect(tick).not.toHaveBeenCalled();
    expect(c.innerHTML).toBe('');
  });

  it('mount 중 effect가 던져도 onError가 있으면 인스턴스를 돌려준다', () => {
    const errors = [];
    const c = container();
    const component = mountComponent(
      () => {
        useEffect(() => {
          throw new Error('boom');
        }, []);
        return h('p', null, 'x');
      },
      c,
      {},
      { onError: (e) => errors.push(e.message) },
    );
    expect(errors).toEqual(['boom']);
    expect(c.innerHTML).toBe('<p>x</p>');
    component.unmount();
    expect(c.innerHTML).toBe('');
  });

  it('effect 실행 도중 unmount되면 뒤의 effect는 실행하지 않는다', () => {
    const later = vi.fn();
    let component;
    component = new FunctionComponent(() => {
      useEffect(() => component.unmount(), []);
      useEffect(later, []);
      return h('p');
    }, {}, container());
    component.mount();
    expect(later).not.toHaveBeenCalled();
  });
});

describe('렌더가 실패할 때', () => {
  it('첫 mount가 실패하면 hooks를 비워, 고친 뒤 다시 mount할 수 있다', () => {
    let broken = true;
    const App = () => {
      useState(0);
      if (broken) throw new Error('render boom');
      useState(1);
      return h('p', null, 'ok');
    };
    const c = container();
    const component = new FunctionComponent(App, {}, c);
    expect(() => component.mount()).toThrow('render boom');
    expect(component.hooks).toEqual([]);
    broken = false;
    component.mount();
    expect(c.innerHTML).toBe('<p>ok</p>');
  });
});

describe('업데이트 예약', () => {
  it('update()를 직접 부르면 이미 예약된 렌더는 취소한다 (불필요한 렌더 없음)', async () => {
    let renders = 0;
    let setN;
    const App = () => {
      renders += 1;
      const [n, set] = useState(0);
      setN = set;
      return h('p', null, String(n));
    };
    const component = mountComponent(App, container());
    setN(1);
    component.update();
    await flushUpdates();
    expect(renders).toBe(2);
  });

  it('effect 안에서 update()를 직접 부르면 스택 넘침 대신 알기 쉬운 오류', () => {
    let component;
    component = new FunctionComponent(() => {
      useEffect(() => component.update());
      return h('p');
    }, {}, container());
    expect(() => component.mount()).toThrow(/update/);
  });

  it(
    'Promise로 이어지는 무한 렌더도 감지해 멈춘다',
    async () => {
      const errors = [];
      let renders = 0;
      const App = () => {
        renders += 1;
        const [n, setN] = useState(0);
        useEffect(() => {
          Promise.resolve().then(() => setN(n + 1));
        });
        return h('p', null, String(n));
      };
      mountComponent(App, container(), {}, { onError: (e) => errors.push(e.message) });
      await flushUpdates();
      expect(errors[0]).toMatch(/너무 많이/);
      expect(renders).toBeLessThan(60);
    },
    2000,
  );

  it('반복 한도에 걸린 뒤에도, 다음 setState는 화면을 상태에 맞춘다', async () => {
    const errors = [];
    let loop = true;
    let setN;
    const App = () => {
      const [n, set] = useState(0);
      setN = set;
      useEffect(() => {
        if (loop) set((v) => v + 1);
      });
      return h('p', null, String(n));
    };
    const c = container();
    const component = mountComponent(App, c, {}, { onError: (e) => errors.push(e.message) });
    await flushUpdates();
    expect(errors[0]).toMatch(/너무 많이/);
    loop = false;
    const value = component.hooks[0].value;
    setN(value); // 상태와 같은 값이지만 화면은 아직 옛 값이다
    await flushUpdates();
    expect(c.textContent).toBe(String(value));
  });
});
