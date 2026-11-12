import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SCENARIOS, measureScenario } from '../../scripts/bench/scenarios.js';
import { startBench } from '../../demo/bench/app.js';

// 브라우저 벤치마크 페이지: Node 하네스(npm run bench)와 같은 시나리오를 실제 브라우저에서 돌린다.
// 여기(jsdom)에서는 화면이 시나리오를 돌리고, 결정적 지표가 Node 하네스와 같게 나오는지만 본다.

describe('measureScenario의 레이아웃 측정 옵션', () => {
  it('layout을 켜면 patch 뒤 레이아웃을 강제로 계산한 시간(layoutMs)을 더한다', () => {
    const swap = SCENARIOS.find((s) => s.id === 'swap');
    expect(measureScenario(swap, 10, document).layoutMs).toBeUndefined();
    const r = measureScenario(swap, 10, document, { layout: true });
    expect(r.layoutMs).toBeGreaterThanOrEqual(0);
    expect(r.records).toBe(4);
  });
});

describe('브라우저 벤치마크 페이지', () => {
  let root;
  let app;

  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    root = document.getElementById('app');
    app = startBench({ root, rows: 10, runs: 1 });
  });

  afterEach(() => app.destroy());

  it('실행하면 모든 시나리오의 결과 행을 그리고, 결정적 지표는 Node 하네스와 같다', async () => {
    await app.run();
    const rows = [...root.querySelectorAll('tbody tr[data-scenario]')];
    expect(rows.map((tr) => tr.dataset.scenario)).toEqual(SCENARIOS.map((s) => s.id));
    const cell = (id, col) => root.querySelector(`tr[data-scenario="${id}"] [data-col="${col}"]`).textContent;
    const swap = measureScenario(SCENARIOS.find((s) => s.id === 'swap'), 10, document);
    expect(cell('swap', 'records')).toBe(String(swap.records));
    expect(cell('swap', 'patches')).toBe(String(swap.patches));
    expect(cell('swap', 'moves')).toBe('2 / 2 / 7');
  });

  it('실행 중에는 실행 버튼을 막고, 끝나면 환경 정보를 보여 준다', async () => {
    const done = app.run();
    expect(root.querySelector('button[data-action="run"]').disabled).toBe(true);
    await done;
    expect(root.querySelector('button[data-action="run"]').disabled).toBe(false);
    expect(root.querySelector('[data-role="env"]').textContent).toContain('10행');
  });
});
