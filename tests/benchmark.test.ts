import { describe, expect, it } from 'vitest';
import { battleInitial, battleTick, percentile, renderFixtures, resultCSV } from '../src/game/benchmark';
import { stateChecksum } from '../src/game/model';

describe('shared benchmark workload', () => {
  it('keeps a fixed visible density for moving/static and exercises slot turnover for churn', () => {
    const moving = renderFixtures(100, 'moving', 5), still = renderFixtures(100, 'static', 5), churn = renderFixtures(100, 'churn', 5);
    expect(moving).toHaveLength(180); expect(moving.every(frame => frame.length === 100 && frame.every(slot => slot.active))).toBe(true);
    expect(moving[0][0].x).not.toBe(moving[1][0].x); expect(still).toHaveLength(1);
    expect(churn[0][0].active).not.toBe(churn[15][0].active); expect(churn[30][0].entityId).not.toBe(churn[0][0].entityId);
    expect(renderFixtures(100, 'moving', 5)).toEqual(moving);
  });
  it('reproduces battle workloads including auto-upgrades and restarts', () => {
    const play = () => { let state = battleInitial(100, 9); for (let tick = 0; tick < 400; tick++) state = battleTick(state, tick, 100, 9); return state; };
    expect(stateChecksum(play())).toBe(stateChecksum(play()));
    const lost = { ...battleInitial(100, 9), phase: 'lost' as const };
    expect(battleTick(lost, 5, 100, 9)).toEqual(battleTick(battleInitial(100, 9), 5, 100, 9));
  });
  it('reports nearest-rank percentiles without mutating sample order', () => {
    const samples = [10, 2, 4, 1]; expect(percentile(samples, .5)).toBe(2); expect(percentile(samples, .95)).toBe(10);
    expect(samples).toEqual([10, 2, 4, 1]); expect(percentile([], .95)).toBe(0); expect(resultCSV([])).toContain('commitP95Ms');
  });
});
