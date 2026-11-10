import { describe, expect, it } from 'vitest';
import { advanceGame, chooseUpgrade, createGame, DURATION, pauseGame, sceneSlots, startGame, stateChecksum, STEP_MS, stepGame } from '../src/game/model';

describe('deterministic survivor simulation', () => {
  it('replays the same seed/input and never mutates its source', () => {
    const initial = startGame(createGame()); const copy = structuredClone(initial);
    const play = () => { let state = initial; for (let i = 0; i < 180; i++) state = stepGame({ ...state, input: { up: false, down: false, left: false, right: i < 100 } }); return state; };
    expect(stateChecksum(play())).toBe(stateChecksum(play())); expect(initial).toEqual(copy);
  });
  it('normalizes diagonal movement, clamps boundaries, and preserves fixed slot counts', () => {
    const initial = startGame(createGame());
    const next = stepGame({ ...initial, input: { up: true, down: false, left: false, right: true } });
    expect(Math.hypot(next.player.x - initial.player.x, next.player.y - initial.player.y)).toBeCloseTo(initial.speed / 60);
    const edge = stepGame({ ...initial, player: { ...initial.player, x: 946 }, input: { ...initial.input, right: true } });
    expect(edge.player.x).toBe(946); expect(sceneSlots(next)).toHaveLength(429);
  });
  it('caps catch-up to five steps and records discarded time', () => {
    const next = advanceGame(startGame(createGame()), 1000); expect(next.steps).toBe(5);
    expect(next.droppedMs).toBeCloseTo(55 * STEP_MS); expect(next.accumulator).toBeCloseTo(0);
    expect(advanceGame(next, -1)).toBe(next); expect(advanceGame(next, Infinity)).toBe(next);
  });
  it('clears input and accumulator on pause; stopped simulation does not advance', () => {
    const state = pauseGame({ ...startGame(createGame()), accumulator: 10, input: { up: true, down: false, left: false, right: false } });
    expect(state.phase).toBe('paused'); expect(state.input.up).toBe(false); expect(state.accumulator).toBe(0);
    expect(advanceGame(state, 1000)).toBe(state); expect(startGame(state).phase).toBe('running');
  });
  it('resolves collision, kill, experience, level-up and upgrade without changing the previous pool', () => {
    const initial = startGame(createGame(1, 1, 1));
    const state = { ...initial, xp: 4, spawnClock: 1000, shotClock: 1000,
      enemies: [{ id: 1, active: true, x: 520, y: 270, hp: 1 }],
      bullets: [{ id: 2, active: true, x: 515, y: 270, vx: 0, vy: 0, life: 500 }] };
    const next = stepGame(state); expect(next.kills).toBe(1); expect(next.enemies[0].active).toBe(false);
    expect(state.enemies[0].active).toBe(true); expect(next.phase).toBe('upgrade'); expect(next.level).toBe(2); expect(next.xp).toBe(0);
    expect(chooseUpgrade(next, 'power').power).toBe(2); expect(chooseUpgrade(next, 'haste').haste).toBe(1.2);
    expect(chooseUpgrade(next, 'speed').speed).toBe(190); expect(chooseUpgrade(next, 'speed').phase).toBe('running');
  });
  it('applies contact damage once during invulnerability and handles defeat', () => {
    const initial = startGame(createGame(1, 1, 0));
    const state = { ...initial, player: { ...initial.player, hp: 20 }, enemies: [{ id: 1, active: true, x: 480, y: 270, hp: 2 }] };
    const next = stepGame(state); expect(next.player.hp).toBe(10); expect(stepGame(next).player.hp).toBe(10);
    const dead = stepGame({ ...next, player: { ...next.player, invulnerable: 0 } }); expect(dead.phase).toBe('lost');
  });
  it('skips saturated pools, wins at three minutes, and creates a clean restart', () => {
    const initial = startGame(createGame(7, 0, 0));
    expect(stepGame(initial).nextId).toBe(1);
    expect(stepGame({ ...initial, elapsed: DURATION - STEP_MS }).phase).toBe('won');
    const restart = startGame(createGame(7)); expect(restart.elapsed).toBe(0); expect(restart.kills).toBe(0); expect(restart.player.hp).toBe(100);
  });
});
