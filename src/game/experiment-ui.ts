import './style.css';
import './experiment.css';
import { resultCSV, runBenchmark, type Adapter, type BenchmarkConfig, type BenchmarkResult, type Scenario } from './benchmark';

type Renderer = Adapter | { name: string; load: () => Promise<Adapter> };
const rendererLabels: Record<string, string> = {
  'mini-baseline': 'Mini React 일반', 'mini-scene': 'Mini React 특화',
  'react-baseline': 'React 기본', 'react-memo': 'React memo',
};
const scenarioLabels: Record<Scenario, string> = {
  moving: '전체 이동', churn: '생성 · 사망', static: '정지 장면', battle: '게임 전체',
};
const warmups: Record<number, number> = { 3: 1, 10: 2, 20: 5, 60: 5 };
const rendererLabel = (name: string) => rendererLabels[name] ?? name;
const correct = (result: BenchmarkResult) => result.domCorrect && result.finalChecksum === result.expectedChecksum;
const metrics = [
  { label: '프레임 간격 p95 ↓', value: (r: BenchmarkResult) => r.frameP95Ms, unit: 'ms', digits: 2, higher: false },
  { label: '예산 초과율 ↓', value: (r: BenchmarkResult) => r.overBudgetRatio * 100, unit: '%', digits: 1, higher: false },
  { label: 'DOM 반영 p95 ↓', value: (r: BenchmarkResult) => r.commitP95Ms, unit: 'ms', digits: 2, higher: false },
  { label: '처리 FPS ↑', value: (r: BenchmarkResult) => r.framesPerSecond, unit: ' FPS', digits: 1, higher: true },
];

declare global {
  interface Window { benchmark: { run: (renderer: string, config: BenchmarkConfig) => Promise<BenchmarkResult>; results: BenchmarkResult[] } }
}

function appendRow(section: HTMLTableSectionElement, values: string[]) {
  const row = section.insertRow();
  for (const value of values) row.insertCell().textContent = value;
}

export function mountExperiment(adapters: Renderer[], versions: Record<string, string> = {}): void {
  const host = document.querySelector('#experiment')!;
  host.innerHTML = `<main class="experiment-shell">
    <header class="experiment-header"><a href="./game.html">← NEON SURVIVOR</a><h1>렌더링 실험실</h1><span>DOM / 960 × 540</span></header>
    <form class="experiment-controls">
      <label>렌더러<select name="renderer"></select></label>
      <label>비교 상대<select name="comparison"></select></label>
      <label>몹 수<select name="count"><option>100</option><option selected>300</option><option>1000</option></select></label>
      <label>시나리오<select name="scenario"><option value="moving">전체 이동</option><option value="churn">생성 · 사망</option><option value="static">정지 장면</option><option value="battle">게임 전체</option></select></label>
      <label>측정 시간<select name="duration"><option value="3">3초</option><option value="10" selected>10초</option><option value="20">20초</option><option value="60">60초</option></select></label>
      <div class="experiment-actions"><label class="diagnostic-option" title="Mini React 단일 측정에서 사용 가능"><input type="checkbox" name="diagnostic">별도 진단</label><button class="primary-action" type="submit">비교 시작 ↗</button></div>
    </form>
    <p class="experiment-duration"></p>
    ${versions.mode === 'development' ? '<p class="experiment-mode">개발 모드입니다. 성능 수치를 비교할 때는 <code>npm run build &amp;&amp; npm run preview</code>로 실행한 실험실을 사용하세요.</p>' : ''}
    <p class="experiment-status" role="status">같은 장면을 한 렌더러씩 실행합니다.</p>
    <div class="stage-scroll"><div id="benchmark-stage"></div></div>
    <section class="experiment-report">
      <div class="report-heading"><h2>측정 결과</h2><div><button id="download-json">JSON 저장</button><button id="download-csv">CSV 저장</button></div></div>
      <p>화면의 끊김은 <strong>프레임 간격 p95</strong>와 <strong>예산 초과율</strong>부터 보세요. 렌더러가 변경을 반영하는 속도는 <strong>DOM 반영 p95</strong>로 비교하세요.</p>
      <div class="experiment-summary" hidden>
        <h3>최근 측정</h3><p class="summary-context"></p>
        <div class="table-scroll"><table class="summary-table"><thead><tr></tr></thead><tbody></tbody></table></div>
        <p class="summary-note"></p>
      </div>
      <details class="metric-guide"><summary>숫자는 무엇을 뜻하나요?</summary>
        <dl>
          <dt>프레임 간격 p95 ↓</dt><dd>프레임 사이 간격의 95%가 이 시간 이내예요. 평균 FPS가 비슷해도 이 값이 크면 느린 쪽 프레임의 간격이 더 길다는 뜻이에요.</dd>
          <dt>예산 초과율 ↓</dt><dd>60Hz 기준 한 프레임 예산 16.67ms에 허용 오차 1ms를 더한 값을 넘긴 간격의 비율이에요.</dd>
          <dt>DOM 반영 p95 ↓</dt><dd>업데이트 시작부터 DOM 반영까지 걸린 시간의 95%가 이 값 이내예요. 대기 시간도 포함하며, 브라우저가 화면에 픽셀을 그리는 시간은 따로 측정하지 않아요.</dd>
          <dt>처리 FPS ↑</dt><dd>1초에 DOM 반영을 마친 프레임 수예요. 둘 다 약 60이면 FPS 차이가 작아도 DOM 반영 시간에는 차이가 날 수 있어요.</dd>
        </dl>
      </details>
      <details class="result-history"><summary>전체 측정 기록</summary>
        <div class="table-scroll"><table><thead><tr><th>렌더러</th><th>장면 / 몹</th><th>측정</th><th>FPS</th><th>프레임 p95</th><th>DOM 반영 중앙값</th><th>DOM 반영 p95</th><th>예산 초과</th><th>정확성</th></tr></thead><tbody id="results"></tbody></table></div>
      </details>
    </section></main>`;

  const form = host.querySelector('form')!;
  const select = (name: string) => form.querySelector<HTMLSelectElement>(`select[name=${name}]`)!;
  const renderer = select('renderer');
  const comparison = select('comparison');
  const duration = select('duration');
  const diagnostic = form.querySelector<HTMLInputElement>('[name=diagnostic]')!;
  const submit = form.querySelector<HTMLButtonElement>('button[type=submit]')!;
  const durationText = host.querySelector('.experiment-duration')!;
  const stage = host.querySelector('#benchmark-stage')!;
  const status = host.querySelector('.experiment-status')!;
  const summary = host.querySelector<HTMLElement>('.experiment-summary')!;
  const jsonButton = host.querySelector<HTMLButtonElement>('#download-json')!;
  const csvButton = host.querySelector<HTMLButtonElement>('#download-csv')!;
  const results: BenchmarkResult[] = [];
  let busy = false;

  for (const adapter of adapters) renderer.add(new Option(rendererLabel(adapter.name), adapter.name));
  if (adapters.some(adapter => adapter.name === 'mini-scene')) renderer.value = 'mini-scene';

  function updateComparisonOptions(preferred: string) {
    comparison.replaceChildren(new Option('단일 측정', ''));
    for (const adapter of adapters) {
      if (adapter.name !== renderer.value) comparison.add(new Option(rendererLabel(adapter.name), adapter.name));
    }
    comparison.value = [...comparison.options].some(option => option.value === preferred) ? preferred : '';
  }

  function syncControls() {
    const seconds = Number(duration.value);
    const total = (warmups[seconds] + seconds) * (comparison.value ? 2 : 1);
    durationText.textContent = `렌더러당 ${warmups[seconds]}초 예열 + ${seconds}초 측정 · 총 약 ${total}초`;
    submit.textContent = comparison.value ? '비교 시작 ↗' : '측정 시작 ↗';
    form.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('input,button,select').forEach(input => { input.disabled = busy; });
    diagnostic.disabled = busy || !!comparison.value || renderer.value.startsWith('react-');
    jsonButton.disabled = csvButton.disabled = busy || !results.length;
  }

  function showSummary(runs: BenchmarkResult[]) {
    const [first, second] = runs;
    const config = first.config;
    summary.hidden = false;
    summary.querySelector('.summary-context')!.textContent = `${scenarioLabels[config.scenario]} · 몹 ${config.count}마리 · 렌더러당 ${config.durationMs / 1000}초 측정${config.diagnostic ? ' · 별도 진단' : ''}`;
    const head = summary.querySelector('thead tr')!;
    head.replaceChildren();
    for (const label of ['지표', ...runs.map(run => rendererLabel(run.renderer)), ...(second ? ['차이'] : [])]) {
      const cell = document.createElement('th');
      cell.scope = 'col';
      cell.textContent = label;
      head.append(cell);
    }
    const body = summary.querySelector('tbody')!;
    body.replaceChildren();
    const valid = runs.every(correct);
    for (const metric of metrics) {
      const values = runs.map(run => metric.value(run));
      const cells = [metric.label, ...values.map(value => `${value.toFixed(metric.digits)}${metric.unit}`)];
      if (second) {
        const [left, right] = values.map(value => Number(value.toFixed(metric.digits)));
        const amount = Math.abs(left - right).toFixed(metric.digits);
        const better = (metric.higher ? left > right : left < right) ? first : second;
        const unit = metric.unit === '%' ? '%p' : metric.unit;
        const difference = Number(amount) ? `${rendererLabel(better.renderer)} ${amount}${unit} ${metric.higher ? '높음' : '낮음'}` : '표시 정밀도 내 동일';
        cells.push(valid ? difference : '비교 제외');
      }
      appendRow(body, cells);
    }
    summary.querySelector('.summary-note')!.textContent = valid
      ? '최종 DOM과 상태가 기대값과 일치했어요. 작은 차이는 같은 설정으로 다시 측정해 보세요.'
      : '최종 DOM 또는 상태가 기대값과 달라요. 이 결과의 수치 차이는 성능 비교에 사용할 수 없어요.';
  }

  async function measure(names: string[], config: BenchmarkConfig) {
    if (busy) throw Error('이미 측정 중입니다.');
    busy = true;
    syncControls();
    summary.hidden = true;
    const runs: BenchmarkResult[] = [];
    try {
      // Load any React code before starting either timer in a comparison.
      status.textContent = '렌더러 준비 중…';
      const ready: Adapter[] = [];
      for (const name of names) {
        const adapter = adapters.find(candidate => candidate.name === name);
        if (!adapter) throw Error('알 수 없는 렌더러');
        ready.push('load' in adapter ? await adapter.load() : adapter);
      }
      for (const adapter of ready) {
        status.textContent = `(${runs.length + 1}/${ready.length}) ${rendererLabel(adapter.name)} 측정 중 · 탭을 전경에 유지하세요.`;
        const result = await runBenchmark(stage, adapter, config);
        runs.push(result);
        results.push(result);
        appendRow(host.querySelector('#results')!, [rendererLabel(result.renderer) + (config.diagnostic ? ' (진단)' : ''),
          `${scenarioLabels[config.scenario]} / ${config.count}`, `${config.durationMs / 1000}초`, result.framesPerSecond.toFixed(1),
          `${result.frameP95Ms.toFixed(2)}ms`, `${result.commitMedianMs.toFixed(2)}ms`, `${result.commitP95Ms.toFixed(2)}ms`,
          `${(result.overBudgetRatio * 100).toFixed(1)}%`, correct(result) ? '일치' : '불일치']);
      }
      showSummary(runs);
      status.textContent = `${names.length > 1 ? '비교' : '측정'} 완료 · 아래 결과에서 지표와 수치 차이를 확인하세요.`;
      return runs;
    } catch (error) {
      if (runs.length) showSummary(runs);
      status.textContent = `측정 실패: ${error instanceof Error ? error.message : error}`;
      throw error;
    } finally {
      busy = false;
      syncControls();
    }
  }

  function download(name: string, content: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  renderer.addEventListener('change', () => { updateComparisonOptions(comparison.value); syncControls(); });
  comparison.addEventListener('change', syncControls);
  duration.addEventListener('change', syncControls);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const names = comparison.value ? [renderer.value, comparison.value] : [renderer.value];
    const seconds = Number(duration.value);
    void measure(names, { count: Number(select('count').value), scenario: select('scenario').value as Scenario,
      warmupMs: warmups[seconds] * 1000, durationMs: seconds * 1000, seed: 73021,
      diagnostic: !diagnostic.disabled && diagnostic.checked }).catch(() => {});
  });
  jsonButton.addEventListener('click', () => download('benchmark.json', JSON.stringify({ versions, results }, null, 2), 'application/json'));
  csvButton.addEventListener('click', () => download('benchmark.csv', resultCSV(results), 'text/csv'));
  updateComparisonOptions('react-baseline');
  syncControls();
  window.benchmark = { run: async (name, config) => (await measure([name], config))[0], results };
}
