import { FunctionComponent, useEffect, useMemo, useState } from './core/component';
import { h } from './core/element';

// Children are pure functions: all values and actions arrive through props.
function Counter({ count, increase, decrease, reset }: {
  count: number; increase: () => void; decrease: () => void; reset: () => void;
}) {
  return h('section', { className: 'hook-card' },
    h('p', { className: 'overline' }, '01 / useState'), h('h3', null, '상태가 바뀌면 화면도 함께'),
    h('output', { id: 'counter-value', 'aria-live': 'polite', 'aria-label': '카운터 값' }, count),
    h('div', { className: 'hook-actions' },
      h('button', { onClick: decrease, disabled: count === 0, 'aria-label': '카운터 감소' }, '−'),
      h('button', { onClick: increase, 'aria-label': '카운터 증가' }, '+'),
      h('button', { onClick: reset }, '초기화')),
    h('p', null, 'Counter는 props만 받습니다. 상태는 App에 저장됩니다.'));
}

function Summary({ name, total }: { name: string; total: number }) {
  return h('section', { className: 'hook-card' },
    h('p', { className: 'overline' }, '03 / useMemo'), h('h3', null, `${name || '방문자'}님의 누적 합`),
    h('output', { id: 'memo-value', 'aria-label': '누적 합' }, total),
    h('p', null, '1부터 카운터 값까지의 합입니다. 이름만 바꾸면 계산 결과를 재사용합니다.'));
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
    h('div', { className: 'hook-intro' },
      h('div', null, h('p', { className: 'overline' }, 'PHASE 02 / COMPONENT · STATE · HOOKS'),
        h('h2', null, '함수는 다시 실행돼도, 상태는 그대로.'),
        h('p', null, '루트의 상태 변경 → Virtual DOM → Diff → 필요한 DOM만 Patch')),
      h('label', null, '이름', h('input', { 'aria-label': '데모 이름', value: name,
        onInput: (event: Event) => setName((event.currentTarget as HTMLInputElement).value) }))),
    h('div', { className: 'hook-grid' },
      h(Counter, { count, increase: () => setCount(value => value + 1),
        decrease: () => setCount(value => Math.max(0, value - 1)), reset: () => setCount(0) }),
      h('section', { className: 'hook-card' },
        h('p', { className: 'overline' }, '02 / useEffect'), h('h3', null, '시작과 정리도 한 쌍으로'),
        h('p', { id: 'timer-status', role: 'status' }, running ? '1초마다 자동 증가 중' : '자동 증가가 멈춰 있습니다'),
        h('button', { onClick: () => setRunning(value => !value), 'aria-pressed': running }, running ? '자동 증가 중지' : '자동 증가 시작'),
        h('p', null, '시작하면 타이머를 등록하고, 중지하면 cleanup으로 해제합니다.')),
      h(Summary, { name, total })));
}

export function mountComponentsDemo(container: Element): FunctionComponent<Record<string, never>> {
  const root = new FunctionComponent(App, container, {});
  root.mount();
  return root;
}
