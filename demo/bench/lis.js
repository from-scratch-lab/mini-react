import { createElement as h, render } from '../../src/index.js';

import { conditions, runCondition, timerInfo, environment, PROTOCOL } from '../../scripts/bench/lis-harness.js';

/**
 * LIS 실험 페이지 화면. 측정은 scripts/bench/lis-harness.js가 하고, 여기서는 실행 버튼·결과 표·JSON 내보내기만 한다.
 * 화면은 render(가상 DOM)로 그린다.
 */

const pause = () => new Promise((resolve) => setTimeout(resolve, 0));

// ---------- 화면 ----------
export function startLisExperiment({ root }) {
  const state = { running: false, log: [], results: null, current: '' };
  window.__lis = { conditions, runCondition, runAll, timerInfo, environment, state };

  /** 전체 실행. 조건마다 A·B, size·pattern 축은 C도. 크기 100·500은 단일 측정을 하나 더 해서 배치와 비교 */
  async function runAll({ only = null } = {}) {
    if (state.running) return state.results;
    state.running = true;
    const results = { env: await environment(), timer: timerInfo(), protocol: PROTOCOL, conditions: [] };
    draw();
    for (const c of conditions()) {
      if (only && !only.includes(c.axis)) continue;
      const engines = c.axis === 'size' || c.axis === 'pattern' ? ['A', 'B', 'C'] : ['A', 'B'];
      state.current = `${c.id} (N=${c.N}${c.k != null ? ` k=${c.k}%` : ''}${c.pattern ? ` ${c.pattern}` : ''}${c.aux ? ` ${c.aux}` : ''}, L${c.level})`;
      draw();
      await pause();
      results.conditions.push(await runCondition(c, engines));
      if (c.batchCheck) results.conditions.push({ ...(await runCondition(c, ['A', 'B'], { batch: true })), id: `${c.id}-batch` });
    }
    state.results = results;
    state.running = false;
    state.current = '';
    draw();
    return results;
  }

  function download() {
    const blob = new Blob([JSON.stringify(state.results, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); // 문서에 붙이지 않는 내려받기 링크
    a.href = URL.createObjectURL(blob);
    a.download = `lis-experiment-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function row(r) {
    const cell = (e, key) => r.engines[e]?.[key]?.median?.toFixed(3) ?? '–';
    return h(
      'tr',
      { key: r.id },
      h('th', { scope: 'row' }, r.id),
      h('td', null, `${r.N}`),
      h('td', null, r.pattern ?? (r.k != null ? `k=${r.k}%` : r.aux)),
      h('td', null, `L${r.level}`),
      h('td', null, r.order.pNonLIS.toFixed(1)),
      h('td', null, cell('A', 'tDiff')),
      h('td', null, cell('A', 'tCommit')),
      h('td', null, cell('B', 'tDiff')),
      h('td', null, cell('B', 'tCommit')),
      h('td', null, cell('C', 'tJS')),
      h('td', null, `${r.engines.A.counts.movedExistingNodes} / ${r.engines.B.counts.movedExistingNodes} / ${r.engines.C?.counts.movedExistingNodes ?? '–'}`),
    );
  }

  function view() {
    const results = state.results;
    return h(
      'div',
      { class: 'bench' },
      h(
        'div',
        { class: 'toolbar' },
        h('button', { type: 'button', class: 'primary', 'data-action': 'run', disabled: state.running, onClick: () => runAll() }, state.running ? `실행 중… ${state.current}` : '전체 실행'),
        h('button', { type: 'button', 'data-action': 'download', disabled: !results, onClick: download }, '결과 JSON 내보내기'),
      ),
      results
        ? h(
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
                  ['조건', 'N', '변화', '복잡도', 'P_nonLIS %', 'A diff', 'A commit', 'B diff', 'B commit', 'C (React) JS', '이동 A / B / C'].map((t) =>
                    h('th', { key: t, scope: 'col' }, t),
                  ),
                ),
              ),
              h('tbody', null, results.conditions.map(row)),
            ),
          )
        : h('p', { class: 'hint' }, '전체 실행은 몇 분 걸립니다. 시간은 ms 중앙값, 이동은 기존 노드를 옮긴 수(계수기).'),
    );
  }

  function draw() {
    render(view(), root);
  }
  draw();
  return { runAll };
}
