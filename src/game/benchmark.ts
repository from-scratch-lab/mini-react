import { spriteAttributes, type SpriteSlot } from '../core/scene';
import { chooseUpgrade, createGame, sceneSlots, startGame, stateChecksum, stepGame, type GameState } from './model';

export type Scenario = 'moving' | 'churn' | 'static' | 'battle';
export type Snapshot = { tick: number; slots: readonly SpriteSlot[] };
export type Source = (time: number) => Snapshot | undefined;
export interface Diagnostic { renderMs: number; diffMs: number; patchMs: number; operations: number }
export interface Adapter {
  name: string;
  mount(container: Element, initial: Snapshot, source: Source, committed: (snapshot: Snapshot) => void,
    diagnostic?: (sample: Diagnostic) => void): () => void;
}
export interface BenchmarkConfig { count: number; scenario: Scenario; warmupMs: number; durationMs: number; seed: number; diagnostic?: boolean }
export interface BenchmarkResult {
  renderer: string; config: BenchmarkConfig; timestamp: string; environment: { userAgent: string; width: number; height: number; dpr: number; visibility: string };
  frames: number; framesPerSecond: number; frameMedianMs: number; frameP95Ms: number; commitMedianMs: number; commitP95Ms: number;
  budgetMs: number; overBudgetRatio: number; skippedRequests: number; elapsedMs: number;
  simulationSteps: number; finalChecksum: string; expectedChecksum: string; domCorrect: boolean;
  samples: { intervalsMs: number[]; commitsMs: number[] }; diagnostics?: Diagnostic[];
}

export function hashString(value: string): string {
  let hash = 2166136261; for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}
export function renderFixtures(count: number, scenario: Exclude<Scenario, 'battle'>, seed: number): readonly SpriteSlot[][] {
  const frames = scenario === 'static' ? 1 : 180;
  return Array.from({ length: frames }, (_, frame) => Array.from({ length: count }, (_, index): SpriteSlot => ({
    entityId: scenario === 'churn' ? index + Math.floor(frame / 30) * count : index,
    kind: 'enemy', active: scenario !== 'churn' || (index + Math.floor(frame / 15)) % 5 !== 0,
    x: 24 + ((index * 73 + seed % 97 + (scenario === 'static' ? 0 : frame * 2)) % 912),
    y: 24 + ((index * 41 + (scenario === 'static' ? 0 : frame)) % 492),
  })));
}
export function battleInitial(count: number, seed: number): GameState {
  const game = startGame(createGame(seed, count));
  return { ...game, nextId: count + 1, enemies: Array.from({ length: count }, (_, index) => ({
    id: index + 1, active: true, hp: 2, x: 24 + (index * 73 + seed % 97) % 912, y: 24 + (index * 41) % 492,
  })) };
}
export function battleTick(game: GameState, tick: number, count: number, seed: number): GameState {
  if (game.phase === 'lost' || game.phase === 'won') game = battleInitial(count, seed);
  while (game.phase === 'upgrade') game = chooseUpgrade(game, ['power', 'haste', 'speed'][tick % 3] as 'power' | 'haste' | 'speed');
  const direction = Math.floor(tick / 120) % 4;
  return stepGame({ ...game, input: { right: direction === 0, down: direction === 1, left: direction === 2, up: direction === 3 } });
}
function expectedDOM(slots: readonly SpriteSlot[]): string {
  return JSON.stringify(slots.map(slot => [spriteAttributes(slot).class, String(slot.entityId),
    Number(slot.x.toFixed(2)), Number(slot.y.toFixed(2)), slot.active ? 'visible' : 'hidden']));
}
function actualDOM(container: Element): string {
  return JSON.stringify([...container.querySelectorAll<HTMLElement>('.scene > i')].map(node => {
    const [x, y] = node.style.transform.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    return [node.className, node.getAttribute('data-entity'), x, y, node.style.visibility];
  }));
}
export function percentile(values: readonly number[], fraction: number): number {
  if (!values.length) return 0; const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

/** Timer samples exclude fixture generation, result rendering, DOM verification and cleanup. */
export function runBenchmark(container: Element, adapter: Adapter, config: BenchmarkConfig): Promise<BenchmarkResult> {
  if (document.hidden) return Promise.reject(Error('측정 탭을 전경으로 가져오세요.'));
  if (![100, 300, 1000].includes(config.count) || config.durationMs <= 0 || config.warmupMs < 0) return Promise.reject(Error('잘못된 측정 설정입니다.'));
  const fixtures = config.scenario === 'battle' ? null : renderFixtures(config.count, config.scenario, config.seed);
  let game = battleInitial(config.count, config.seed);
  const initial = { tick: -1, slots: fixtures?.[0] ?? sceneSlots(game) };
  return new Promise((resolve, reject) => {
    let first = -1, measuredAt = -1, previous = -1, lastTimestamp = 0, start = 0, tick = 0;
    let waiting = false, measuring = false, finished = false, skippedRequests = 0;
    let cleanup = () => {}; let timeout: ReturnType<typeof setTimeout>;
    const intervals: number[] = [], commits: number[] = [], diagnostics: Diagnostic[] = [];
    const finish = (error?: Error, snapshot?: Snapshot) => {
      if (finished) return; finished = true;
      queueMicrotask(() => {
        clearTimeout(timeout); document.removeEventListener('visibilitychange', hidden);
        try {
          if (error || !snapshot) throw error ?? Error('측정 결과가 없습니다.');
          const domCorrect = actualDOM(container) === expectedDOM(snapshot.slots);
          const finalChecksum = fixtures ? hashString(expectedDOM(snapshot.slots)) : stateChecksum(game);
          // Re-simulate exactly the accepted ticks outside the measurement window.
          let reference = battleInitial(config.count, config.seed);
          if (!fixtures) for (let i = 0; i < tick; i++) reference = battleTick(reference, i, config.count, config.seed);
          const expectedChecksum = fixtures ? hashString(expectedDOM(fixtures[(tick - 1) % fixtures.length])) : stateChecksum(reference);
          resolve({ renderer: adapter.name, config, timestamp: new Date().toISOString(),
            environment: { userAgent: navigator.userAgent, width: innerWidth, height: innerHeight, dpr: devicePixelRatio, visibility: document.visibilityState },
            frames: commits.length, framesPerSecond: intervals.length * 1000 / intervals.reduce((a, b) => a + b, 0),
            frameMedianMs: percentile(intervals, .5), frameP95Ms: percentile(intervals, .95),
            commitMedianMs: percentile(commits, .5), commitP95Ms: percentile(commits, .95),
            budgetMs: 1000 / 60, overBudgetRatio: intervals.filter(value => value > 1000 / 60 + 1).length / Math.max(1, intervals.length),
            skippedRequests, elapsedMs: lastTimestamp - measuredAt, simulationSteps: fixtures ? 0 : tick,
            finalChecksum, expectedChecksum, domCorrect, samples: { intervalsMs: intervals, commitsMs: commits },
            ...(config.diagnostic ? { diagnostics } : {}) });
        } catch (error) { reject(error); } finally { cleanup(); }
      });
    };
    const hidden = () => { if (document.hidden) finish(Error('탭이 숨겨져 측정을 취소했습니다.')); };
    const source: Source = time => {
      if (finished) return undefined;
      if (first === -1) first = time;
      if (waiting) { if (measuring) skippedRequests++; return undefined; }
      measuring = time - first >= config.warmupMs;
      if (measuring) {
        if (measuredAt === -1) measuredAt = time;
        if (previous !== -1) intervals.push(time - previous);
        previous = time;
      }
      lastTimestamp = time; start = performance.now(); waiting = true;
      let slots: readonly SpriteSlot[];
      if (fixtures) slots = fixtures[tick % fixtures.length];
      else { game = battleTick(game, tick, config.count, config.seed); slots = sceneSlots(game); }
      return { tick: tick++, slots };
    };
    const committed = (snapshot: Snapshot) => {
      if (snapshot.tick < 0 || finished) return;
      if (measuring) commits.push(performance.now() - start);
      waiting = false;
      if (measuring && lastTimestamp - measuredAt >= config.durationMs) finish(undefined, snapshot);
    };
    document.addEventListener('visibilitychange', hidden);
    timeout = setTimeout(() => finish(Error('측정 시간 제한을 초과했습니다.')), config.warmupMs + config.durationMs + 30_000);
    try { cleanup = adapter.mount(container, initial, source, committed, config.diagnostic ? sample => { if (measuring) diagnostics.push(sample); } : undefined); }
    catch (error) { finish(error instanceof Error ? error : Error(String(error))); }
  });
}

export function resultCSV(results: readonly BenchmarkResult[]): string {
  const fields = ['renderer', 'scenario', 'count', 'fps', 'frameP95Ms', 'commitMedianMs', 'commitP95Ms', 'overBudgetRatio', 'frames', 'simulationSteps', 'correct', 'warmupMs', 'durationMs', 'seed', 'diagnostic'];
  return [fields.join(','), ...results.map(result => [result.renderer, result.config.scenario, result.config.count,
    result.framesPerSecond, result.frameP95Ms, result.commitMedianMs, result.commitP95Ms, result.overBudgetRatio,
    result.frames, result.simulationSteps, result.domCorrect && result.finalChecksum === result.expectedChecksum,
    result.config.warmupMs, result.config.durationMs, result.config.seed, !!result.config.diagnostic].join(','))].join('\n');
}
