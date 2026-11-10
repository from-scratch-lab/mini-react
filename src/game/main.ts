import './style.css';
import { FunctionComponent, useEffect, useFrame, useScene, useState } from '../core/component';
import { h } from '../core/element';
import { advanceGame, chooseUpgrade, createGame, DURATION, pauseGame, sceneSlots, startGame, WIDTH,
  type GameState, type Input, type Upgrade } from './model';

const directions: Record<string, keyof Input> = { w: 'up', arrowup: 'up', s: 'down', arrowdown: 'down',
  a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right' };
const upgrades: { id: Upgrade; name: string; symbol: string; detail: string }[] = [
  { id: 'power', name: '과충전', symbol: '↗', detail: '투사체 공격력 +1' },
  { id: 'haste', name: '속사', symbol: '»', detail: '공격 속도 ×1.2 · 최대 4배' },
  { id: 'speed', name: '가속', symbol: '⌁', detail: '이동 속도 +20 · 최대 300' },
];
function clock(ms: number): string { const seconds = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`; }

function Hud({ game }: { game: GameState }) {
  return h('header', { className: 'hud' },
    h('div', { className: 'health' }, h('span', { className: 'eyebrow' }, 'VITAL SIGNAL'),
      h('div', { className: 'health-line' }, h('strong', { 'data-testid': 'health' }, game.player.hp), h('span', null, '/ 100')),
      h('div', { className: 'meter', role: 'progressbar', 'aria-label': '체력', 'aria-valuenow': game.player.hp, 'aria-valuemin': 0, 'aria-valuemax': 100 },
        h('i', { style: `transform:scaleX(${game.player.hp / 100})` }))),
    h('div', { className: 'timer' }, h('span', { className: 'eyebrow' }, 'SURVIVE THE SIGNAL'),
      h('strong', { 'data-testid': 'time' }, clock(DURATION - game.elapsed))),
    h('div', { className: 'kill-counter' }, h('span', { className: 'eyebrow' }, 'ELIMINATED'),
      h('strong', { 'data-testid': 'kills' }, String(game.kills).padStart(3, '0'))));
}

function Overlay({ game, start, resume, restart, upgrade }: { game: GameState; start: () => void; resume: () => void;
  restart: () => void; upgrade: (value: Upgrade) => void }) {
  if (game.phase === 'running') return null;
  const ready = game.phase === 'ready', level = game.phase === 'upgrade', paused = game.phase === 'paused';
  return h('section', { className: `overlay overlay--${game.phase}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'overlay-title' },
    h('div', { className: 'overlay-content' },
      h('p', { className: 'eyebrow' }, ready ? 'A THREE-MINUTE SURVIVAL' : level ? `LEVEL ${game.level} / EVOLUTION AVAILABLE` : paused ? 'SIGNAL ON HOLD' : 'TRANSMISSION COMPLETE'),
      h('h1', { id: 'overlay-title' }, ready ? ['NEON', h('br', null), h('span', null, 'SURVIVOR')] : level ? '다음 진화를 선택하세요.' : paused ? '잠시, 숨 고르기.' : game.phase === 'won' ? '신호를 지켜냈습니다.' : '신호가 끊겼습니다.'),
      h('p', { className: 'overlay-copy' }, ready ? '몰려오는 신호를 뚫고, 3분을 버티세요.' : level ? '선택하는 동안 전투는 멈춥니다.' : paused ? '준비되면 전투를 이어가세요.' : `${clock(game.elapsed)} 생존 · ${game.kills} 처치 · 레벨 ${game.level}`),
      level ? h('div', { className: 'upgrades' }, upgrades.map((item, index) => h('button', { className: 'upgrade', onClick: () => upgrade(item.id) },
        h('span', { className: 'upgrade-key' }, `0${index + 1}`), h('span', { className: 'upgrade-symbol', 'aria-hidden': true }, item.symbol),
        h('strong', null, item.name), h('span', null, item.detail))))
        : h('button', { className: 'primary-action', onClick: ready ? start : paused ? resume : restart },
          ready ? '생존 시작' : paused ? '계속하기' : '다시 도전', h('span', { 'aria-hidden': true }, '↗')),
      ready && h('p', { className: 'start-note' }, 'WASD / 방향키 이동', h('span', null, '·'), '공격은 자동으로')));
}

function App() {
  const [game, setGame] = useState(() => createGame());
  const [width, setWidth] = useState(WIDTH);
  useFrame(({ delta }) => setGame(previous => advanceGame(previous, delta)), game.phase === 'running');
  const scene = useScene(sceneSlots(game));

  useEffect(() => {
    const resize = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    resize.observe(document.querySelector('.arena-window')!);
    return () => resize.disconnect();
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase(), direction = directions[key];
      if (direction) {
        event.preventDefault();
        setGame(previous => {
          const pressed = event.type === 'keydown';
          if (previous.phase !== 'running' || previous.input[direction] === pressed) return previous;
          return { ...previous, input: { ...previous.input, [direction]: pressed } };
        });
      } else if (event.type === 'keydown' && !event.repeat) {
        if (key === 'escape' || (key === ' ' && !(event.target instanceof HTMLButtonElement))) {
          event.preventDefault(); setGame(previous => previous.phase === 'paused' ? startGame(previous) : pauseGame(previous));
        }
        if (['1', '2', '3'].includes(key)) setGame(previous => chooseUpgrade(previous, upgrades[Number(key) - 1].id));
      }
    };
    const stop = () => setGame(pauseGame);
    const visibility = () => { if (document.hidden) stop(); };
    window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey);
    window.addEventListener('blur', stop); document.addEventListener('visibilitychange', visibility);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', stop); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  useEffect(() => {
    const target = game.phase === 'running' ? document.querySelector<HTMLElement>('.arena-window')
      : document.querySelector<HTMLElement>('.overlay button');
    target?.focus({ preventScroll: true });
  }, [game.phase, game.level]);

  return h('main', { className: 'game-shell', 'data-phase': game.phase },
    h('nav', { className: 'game-nav' }, h('a', { href: './index.html', className: 'brand' }, h('span', { className: 'brand-mark', 'aria-hidden': true }, '⟐'), 'MINI REACT', h('span', { className: 'edition' }, '/ PLAYGROUND 03')),
      h('div', { className: 'nav-right' }, h('span', { className: 'engine-status' }, h('i', null), 'DOM ENGINE'),
        h('button', { className: 'pause-action', disabled: game.phase !== 'running' && game.phase !== 'paused', onClick: () => setGame(previous => previous.phase === 'paused' ? startGame(previous) : pauseGame(previous)), 'aria-label': game.phase === 'paused' ? '게임 계속하기' : '게임 일시정지' }, game.phase === 'paused' ? '▶' : 'Ⅱ'))),
    h(Hud, { game }),
    h('div', { className: 'arena-window', tabIndex: -1, 'aria-label': '전투 경기장' },
      h('div', { className: 'arena', style: `transform:scale(${width / WIDTH})` },
        h('div', { className: 'arena-grid', 'aria-hidden': true }), scene,
        h('span', { className: 'arena-coordinate coord-tl', 'aria-hidden': true }, 'SECTOR 07 / 960 × 540'),
        h('span', { className: 'arena-coordinate coord-br', 'aria-hidden': true }, 'NO SIGNAL BEYOND THIS POINT')),
      h(Overlay, { game, start: () => setGame(startGame), resume: () => setGame(startGame),
        restart: () => setGame(startGame(createGame())), upgrade: value => setGame(previous => chooseUpgrade(previous, value)) })),
    h('div', { className: 'experience-row' }, h('span', { className: 'level-label' }, 'LV.', h('strong', null, String(game.level).padStart(2, '0'))),
      h('div', { className: 'experience meter', role: 'progressbar', 'aria-label': '경험치', 'aria-valuenow': game.xp, 'aria-valuemin': 0, 'aria-valuemax': game.level * 5 }, h('i', { style: `transform:scaleX(${Math.min(1, game.xp / (game.level * 5))})` })),
      h('span', { className: 'experience-value' }, `${game.xp} / ${game.level * 5} XP`)),
    h('footer', { className: 'game-footer' }, h('p', null, h('kbd', null, 'W A S D'), ' 이동', h('span', { className: 'footer-divider' }, '/'), h('kbd', null, 'ESC'), ' 일시정지', h('span', { className: 'footer-divider' }, '/'), '자동 공격'),
      h('a', { href: './experiment.html' }, '렌더링 실험실', h('span', { 'aria-hidden': true }, ' ↗'))),
    h('p', { className: 'mobile-note' }, '키보드가 연결된 데스크톱에서 플레이하세요.'));
}

const root = new FunctionComponent(App, document.querySelector('#game')!, {});
root.mount();
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
