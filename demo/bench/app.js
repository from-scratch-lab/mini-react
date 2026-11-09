import { createElement as h, render } from '../../src/index.js';
import { SCENARIOS, measureScenario } from '../../scripts/bench/scenarios.js';

/**
 * 브라우저 벤치마크 페이지. `npm run bench`(Node + jsdom)와 같은 시나리오를 이 브라우저에서 돌린다.
 *
 * - 결정적 지표(패치·DOM 변경 기록·붙임+뗌·새 노드·이동 수)는 jsdom과 같아야 한다. 다르면 측정이 틀린 것이다.
 * - 시간은 이 브라우저의 값이다. patch 뒤 레이아웃을 강제로 계산한 시간(layout)까지 재므로 Reflow 비용이 들어간다.
 *   시나리오마다 runs번 돌려 중앙값을 쓴다. 측정용 표는 시나리오가 body 끝에 잠깐 붙였다 떼며(scripts/bench/scenarios.js),
 *   이 페이지 화면은 render(가상 DOM)로만 그린다.
 *
 * @returns {{ run(): Promise<void>, destroy(): void }}
 */
export function startBench({ root, rows = 1000, runs = 11 }) {
  const state = { rows, runs, running: false, current: null, results: [], env: null };

  const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[sorted.length >> 1];
  };
  const ms = (value) => (value === undefined ? '–' : value.toFixed(2));
  const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 0)); // 화면이 멈추지 않게 시나리오 사이에 양보

  async function run() {
    if (state.running) return;
    state.running = true;
    state.results = [];
    draw();
    for (const scenario of SCENARIOS) {
      state.current = scenario.id;
      draw();
      await nextFrame();
      const samples = [];
      for (let i = 0; i < state.runs; i += 1) {
        samples.push(measureScenario(scenario, state.rows, root.ownerDocument, { layout: true }));
        await nextFrame();
      }
      const first = samples[0];
      state.results.push({
        ...first,
        diffMs: median(samples.map((r) => r.diffMs)),
        patchMs: median(samples.map((r) => r.patchMs)),
        layoutMs: median(samples.map((r) => r.layoutMs)),
      });
    }
    const nav = root.ownerDocument.defaultView.navigator;
    state.env = `${state.rows}행 · ${state.runs}회 중앙값 · ${nav.userAgent}`;
    state.current = null;
    state.running = false;
    draw();
  }

  const onRows = (event) => {
    state.rows = Number(event.target.value);
    draw();
  };
  const onRuns = (event) => {
    state.runs = Math.max(1, Number(event.target.value) || 1);
    draw();
  };

  function resultRow(r) {
    const cell = (col, text) => h('td', { 'data-col': col }, text);
    return h(
      'tr',
      { key: r.id, 'data-scenario': r.id },
      h('th', { scope: 'row' }, r.name),
      cell('diff', ms(r.diffMs)),
      cell('patch', ms(r.patchMs)),
      cell('layout', ms(r.layoutMs)),
      cell('patches', String(r.patches)),
      cell('records', String(r.records)),
      cell('added-removed', String(r.addedRemoved)),
      cell('created', String(r.created)),
      cell('moves', `${r.moves.engine} / ${r.moves.lisMin} / ${r.moves.react}`),
    );
  }

  function view() {
    return h(
      'div',
      { class: 'bench' },
      h(
        'div',
        { class: 'toolbar' },
        h(
          'label',
          null,
          '행 수 ',
          h(
            'select',
            { value: String(state.rows), disabled: state.running, onChange: onRows },
            [10, 1000, 10000].map((n) => h('option', { key: String(n), value: String(n) }, n.toLocaleString('en-US'))),
          ),
        ),
        h('label', null, '반복 ', h('input', { type: 'number', min: '1', max: '51', value: String(state.runs), disabled: state.running, onChange: onRuns })),
        h(
          'button',
          { type: 'button', class: 'primary', 'data-action': 'run', disabled: state.running, onClick: run },
          state.running ? `실행 중… (${state.current ?? ''})` : '실행',
        ),
      ),
      h('p', { class: 'hint', 'data-role': 'env' }, state.env ?? '실행을 누르면 시나리오마다 반복해 중앙값을 냅니다. 10,000행은 오래 걸립니다.'),
      h(
        'div',
        { class: 'table-scroll' },
        h(
          'table',
          { class: 'bench-table' },
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              ['시나리오', 'diff ms', 'patch ms', 'layout ms', '패치', 'DOM 변경 기록', '붙임+뗌', '새 노드', '이동 (엔진 / LIS 최소 / React식)'].map((t) =>
                h('th', { key: t, scope: 'col' }, t),
              ),
            ),
          ),
          h('tbody', null, state.results.map(resultRow)),
        ),
      ),
    );
  }

  function draw() {
    render(view(), root);
  }

  draw();

  return {
    run,
    destroy() {
      render(null, root);
    },
  };
}
