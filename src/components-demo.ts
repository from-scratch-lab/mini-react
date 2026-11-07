import { FunctionComponent, useEffect, useMemo, useState } from './core/component';
import { h } from './core/element';

// Children are pure functions: all values and actions arrive through props.
function Counter({ count, increase, decrease, reset }: {
  count: number; increase: () => void; decrease: () => void; reset: () => void;
}) {
  return h('section', { className: 'hook-card' },
    h('code', null, 'useState'), h('h3', null, '카운터'),
    h('output', { id: 'counter-value', 'aria-live': 'polite', 'aria-label': '카운터 값' }, count),
    h('div', { className: 'hook-actions' },
      h('button', { onClick: decrease, disabled: count === 0, 'aria-label': '카운터 감소' }, '−'),
      h('button', { onClick: increase, 'aria-label': '카운터 증가' }, '+'),
      h('button', { onClick: reset }, '초기화')),
    h('p', null, 'App의 상태를 props로 받습니다.'));
}

function Summary({ name, total }: { name: string; total: number }) {
  return h('section', { className: 'hook-card' },
    h('code', null, 'useMemo'), h('h3', null, `${name || '방문자'}님의 누적 합`),
    h('output', { id: 'memo-value', 'aria-label': '누적 합' }, total),
    h('p', null, '카운터가 바뀔 때만 1부터 카운터 값까지 다시 더합니다.'));
}

function App() {
  const [count, setCount] = useState(0);
  const [name, setName] = useState('방문자');
  const [running, setRunning] = useState(false);
  const total = useMemo(() => count * (count + 1) / 2, [count]);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setCount(value => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  return h('div', null,
    h('div', { className: 'hook-heading' },
      h('h2', { id: 'hooks-title' }, 'Hooks'),
      h('label', null, '이름', h('input', { 'aria-label': '데모 이름', value: name,
        onInput: (event: Event) => setName((event.currentTarget as HTMLInputElement).value) }))),
    h('div', { className: 'hook-grid' },
      h(Counter, { count, increase: () => setCount(value => value + 1),
        decrease: () => setCount(value => Math.max(0, value - 1)), reset: () => setCount(0) }),
      h('section', { className: 'hook-card' },
        h('code', null, 'useEffect'), h('h3', null, '자동 증가'),
        h('p', null, '1초마다 카운터를 1씩 올립니다.'),
        h('button', { onClick: () => setRunning(value => !value), 'aria-pressed': running }, running ? '자동 증가 중지' : '자동 증가 시작')),
      h(Summary, { name, total })));
}

export function mountComponentsDemo(container: Element): FunctionComponent<Record<string, never>> {
  const root = new FunctionComponent(App, container, {});
  root.mount();
  return root;
}
