import type { SpriteSlot } from '../core/scene';

export const WIDTH = 960, HEIGHT = 540, STEP_MS = 1000 / 60, DURATION = 180_000;
export type Phase = 'ready' | 'running' | 'paused' | 'upgrade' | 'won' | 'lost';
export type Upgrade = 'power' | 'haste' | 'speed';
export interface Input { up: boolean; down: boolean; left: boolean; right: boolean }
export const emptyInput = (): Input => ({ up: false, down: false, left: false, right: false });
export interface Enemy { id: number; active: boolean; x: number; y: number; hp: number }
export interface Bullet { id: number; active: boolean; x: number; y: number; vx: number; vy: number; life: number }
export interface GameState {
  phase: Phase; seed: number; nextId: number; elapsed: number; steps: number; accumulator: number; droppedMs: number;
  input: Input; player: { x: number; y: number; hp: number; invulnerable: number };
  enemies: readonly Enemy[]; bullets: readonly Bullet[]; spawnClock: number; shotClock: number;
  kills: number; xp: number; level: number; power: number; haste: number; speed: number;
}

export function createGame(seed = 73021, enemyCapacity = 300, bulletCapacity = 128): GameState {
  return {
    phase: 'ready', seed: seed >>> 0, nextId: 1, elapsed: 0, steps: 0, accumulator: 0, droppedMs: 0,
    input: emptyInput(), player: { x: WIDTH / 2, y: HEIGHT / 2, hp: 100, invulnerable: 0 },
    enemies: Array.from({ length: enemyCapacity }, () => ({ id: 0, active: false, x: 0, y: 0, hp: 0 })),
    bullets: Array.from({ length: bulletCapacity }, () => ({ id: 0, active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0 })),
    spawnClock: 0, shotClock: 0, kills: 0, xp: 0, level: 1, power: 1, haste: 1, speed: 170,
  };
}

export function startGame(state: GameState): GameState {
  return { ...state, phase: 'running', input: emptyInput(), accumulator: 0 };
}

export function pauseGame(state: GameState): GameState {
  return { ...state, phase: state.phase === 'running' ? 'paused' : state.phase, input: emptyInput(), accumulator: 0 };
}

export function chooseUpgrade(state: GameState, upgrade: Upgrade): GameState {
  if (state.phase !== 'upgrade') return state;
  const next = { ...state, input: emptyInput(), accumulator: 0,
    power: state.power + (upgrade === 'power' ? 1 : 0),
    haste: upgrade === 'haste' ? Math.min(4, state.haste * 1.2) : state.haste,
    speed: upgrade === 'speed' ? Math.min(300, state.speed + 20) : state.speed };
  const threshold = next.level * 5;
  return next.xp >= threshold
    ? { ...next, xp: next.xp - threshold, level: next.level + 1, phase: 'upgrade' }
    : { ...next, phase: 'running' };
}

/** A deterministic fixed step. Neither clocks, DOM nor framework state are read here. */
export function stepGame(state: GameState): GameState {
  if (state.phase !== 'running') return state;
  const dt = STEP_MS / 1000;
  const player = { ...state.player, invulnerable: Math.max(0, state.player.invulnerable - STEP_MS) };
  let dx = Number(state.input.right) - Number(state.input.left);
  let dy = Number(state.input.down) - Number(state.input.up);
  const length = Math.hypot(dx, dy);
  if (length) { dx /= length; dy /= length; }
  player.x = Math.max(14, Math.min(WIDTH - 14, player.x + dx * state.speed * dt));
  player.y = Math.max(14, Math.min(HEIGHT - 14, player.y + dy * state.speed * dt));
  const enemies = state.enemies.map(enemy => enemy.active ? { ...enemy } : enemy);
  const bullets = state.bullets.map(bullet => bullet.active ? { ...bullet } : bullet);
  let seed = state.seed, nextId = state.nextId, kills = state.kills, xp = state.xp;
  function random(): number { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
  const elapsed = state.elapsed + STEP_MS;
  const tier = Math.floor(elapsed / 30_000);
  let spawnClock = state.spawnClock - STEP_MS;
  if (spawnClock <= 0) {
    spawnClock += 1000 / (3 + tier);
    const index = enemies.findIndex(enemy => !enemy.active);
    if (index !== -1) {
      const side = Math.floor(random() * 4), offset = random();
      enemies[index] = { id: nextId++, active: true, hp: 2 + Math.floor(tier / 2),
        x: side === 0 ? 8 : side === 1 ? WIDTH - 8 : offset * WIDTH,
        y: side === 2 ? 8 : side === 3 ? HEIGHT - 8 : offset * HEIGHT };
    }
  }

  // Spatial grid is shared by every renderer, so collision work cannot bias comparisons.
  const grid = new Map<string, number[]>();
  let nearest = -1, nearestDistance = Infinity;
  for (let index = 0; index < enemies.length; index++) {
    const enemy = enemies[index]; if (!enemy.active) continue;
    const x = player.x - enemy.x, y = player.y - enemy.y, distance = Math.hypot(x, y);
    const travel = Math.min(distance, (36 + tier * 6) * dt);
    if (distance) { enemy.x += x / distance * travel; enemy.y += y / distance * travel; }
    const after = Math.hypot(player.x - enemy.x, player.y - enemy.y);
    if (after < nearestDistance) { nearest = index; nearestDistance = after; }
    if (after < 23 && player.invulnerable === 0) { player.hp = Math.max(0, player.hp - 10); player.invulnerable = 650; }
    const key = `${Math.floor(enemy.x / 48)},${Math.floor(enemy.y / 48)}`;
    const cell = grid.get(key); if (cell) cell.push(index); else grid.set(key, [index]);
  }

  let shotClock = Math.max(0, state.shotClock - STEP_MS);
  if (shotClock === 0 && nearest !== -1) {
    shotClock = 420 / state.haste;
    const index = bullets.findIndex(bullet => !bullet.active);
    if (index !== -1) {
      const target = enemies[nearest], angle = Math.atan2(target.y - player.y, target.x - player.x);
      bullets[index] = { id: nextId++, active: true, x: player.x, y: player.y,
        vx: Math.cos(angle) * 500, vy: Math.sin(angle) * 500, life: 1600 };
    }
  }
  for (const bullet of bullets) {
    if (!bullet.active) continue;
    bullet.x += bullet.vx * dt; bullet.y += bullet.vy * dt; bullet.life -= STEP_MS;
    if (bullet.life <= 0 || bullet.x < 0 || bullet.x > WIDTH || bullet.y < 0 || bullet.y > HEIGHT) { bullet.active = false; continue; }
    const cx = Math.floor(bullet.x / 48), cy = Math.floor(bullet.y / 48);
    collision: for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++) {
      for (const index of grid.get(`${x},${y}`) ?? []) {
        const enemy = enemies[index];
        if (!enemy.active || Math.hypot(enemy.x - bullet.x, enemy.y - bullet.y) > 15) continue;
        enemy.hp -= state.power; bullet.active = false;
        if (enemy.hp <= 0) { enemy.active = false; kills++; xp++; }
        break collision;
      }
    }
  }
  let phase: Phase = player.hp === 0 ? 'lost' : elapsed + 1e-6 >= DURATION ? 'won' : 'running';
  let level = state.level;
  if (phase === 'running' && xp >= level * 5) { xp -= level * 5; level++; phase = 'upgrade'; }
  return { ...state, player, enemies, bullets, seed, nextId, spawnClock, shotClock, elapsed,
    steps: state.steps + 1, kills, xp, level, phase,
    ...(phase !== 'running' ? { input: emptyInput(), accumulator: 0 } : {}) };
}

export function advanceGame(state: GameState, delta: number): GameState {
  if (state.phase !== 'running' || !Number.isFinite(delta) || delta < 0) return state;
  const total = state.accumulator + delta;
  const available = Math.floor((total + 1e-7) / STEP_MS);
  const count = Math.min(5, available);
  let next = state;
  for (let index = 0; index < count && next.phase === 'running'; index++) next = stepGame(next);
  return { ...next, accumulator: next.phase === 'running' ? Math.max(0, total - available * STEP_MS) : 0,
    droppedMs: state.droppedMs + Math.max(0, available - count) * STEP_MS };
}

export function sceneSlots(state: GameState): SpriteSlot[] {
  return [
    { entityId: -1, kind: 'player', active: true, x: state.player.x, y: state.player.y, hit: state.player.invulnerable > 450 },
    ...state.enemies.map(enemy => ({ entityId: enemy.id, kind: 'enemy' as const, active: enemy.active, x: enemy.x, y: enemy.y })),
    ...state.bullets.map(bullet => ({ entityId: bullet.id, kind: 'bullet' as const, active: bullet.active, x: bullet.x, y: bullet.y })),
  ];
}

/** Cross-renderer checksum, not a security hash. Includes every simulation field. */
export function stateChecksum(state: GameState): string {
  let hash = 2166136261;
  for (const char of JSON.stringify(state)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}
