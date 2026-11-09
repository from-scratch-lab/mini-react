import photo1 from './assets/world-cup/candidate-1.png';
import photo2 from './assets/world-cup/candidate-2.png';
import photo3 from './assets/world-cup/candidate-3.png';
import photo4 from './assets/world-cup/candidate-4.png';
import { FunctionComponent, useEffect, useState } from './core/component';
import { h } from './core/element';

type Candidate = { name: string; photo: string };
type Tournament = { selections: Candidate[]; pending: Candidate | null };

const candidates = [photo1, photo2, photo3, photo4].map((photo, index) => ({
  name: `후보 ${index + 1}`,
  photo,
}));
const rounds = ['4강 · 1/2', '4강 · 2/2', '결승 · 1/1'];
const selectionDuration = 420;
const confettiPaths = [
  [-214, 32, -135], [-190, -64, 210], [-152, -120, -180], [-112, 82, 220],
  [-76, -148, 145], [-30, -105, -170], [36, -134, 200], [82, -100, -220],
  [120, 78, 160], [156, -116, 180], [192, -56, -200], [214, 36, 165],
];

function CandidateCard({ candidate, pending, onChoose }: {
  candidate: Candidate; pending: Candidate | null; onChoose: () => void;
}) {
  const selected = pending === candidate;
  return h('button', {
    type: 'button', className: 'world-cup-choice', onClick: onChoose,
    'aria-disabled': pending ? true : undefined,
    'data-state': pending ? selected ? 'selected' : 'passed' : undefined,
  },
    h('span', { className: 'world-cup-portrait' },
      h('img', { src: candidate.photo, alt: '', width: 512, height: 512 })),
    h('span', { className: 'world-cup-name' }, candidate.name),
    selected && h('span', { className: 'world-cup-selected', 'aria-hidden': true }, '✓ 선택'));
}

function Confetti() {
  return h('div', { className: 'world-cup-confetti', 'aria-hidden': true },
    confettiPaths.map(([x, y, rotation], index) =>
      h('span', { style: `--x:${x}px;--y:${y}px;--rotation:${rotation}deg;--delay:${index % 3 * 35}ms` })));
}

function WorldCup({ container }: { container: Element }) {
  const [{ selections, pending }, setTournament] = useState<Tournament>({ selections: [], pending: null });
  const [firstFinalist, secondFinalist, winner] = selections;
  const [left, right] = firstFinalist && secondFinalist
    ? [firstFinalist, secondFinalist]
    : firstFinalist ? [candidates[2], candidates[3]] : [candidates[0], candidates[1]];

  useEffect(() => {
    if (!pending) return;
    const timeout = window.setTimeout(() => {
      const focusWinner = selections.length === 2 && container.contains(container.ownerDocument.activeElement);
      setTournament({ selections: [...selections, pending], pending: null });
      if (focusWinner) container.querySelector<HTMLElement>('.world-cup-result h3')?.focus();
    }, selectionDuration);
    return () => window.clearTimeout(timeout);
  }, [container, selections, pending]);

  function choose(candidate: Candidate): void {
    setTournament(current => current.pending ? current : { ...current, pending: candidate });
  }

  function restart(): void {
    setTournament({ selections: [], pending: null });
    container.querySelector<HTMLButtonElement>('.world-cup-choice')?.focus();
  }

  return h('section', { className: 'world-cup', 'aria-labelledby': 'world-cup-title' },
    h('header', { className: 'world-cup-heading' },
      h('div', null,
        h('h2', { id: 'world-cup-title' }, '이상형 월드컵'),
        h('p', null, '마음에 드는 사진을 선택하세요.')),
      h('p', { className: 'world-cup-status', role: 'status' },
        winner ? '우승 확정' : rounds[selections.length],
        pending && ` · ${pending.name} 선택`)),
    winner
      ? h('div', { className: 'world-cup-result' },
        h('div', { className: 'world-cup-winner-photo' },
          h('img', { src: winner.photo, alt: '', width: 512, height: 512 }),
          h(Confetti, {})),
        h('h3', { tabindex: -1 }, `${winner.name} 우승`),
        h('button', { type: 'button', className: 'world-cup-restart', onClick: restart }, '다시 시작'))
      : h('div', { className: 'world-cup-match' },
        h(CandidateCard, { candidate: left, pending, onChoose: () => choose(left) }),
        h('span', { className: 'world-cup-versus', 'aria-hidden': true }, 'VS'),
        h(CandidateCard, { candidate: right, pending, onChoose: () => choose(right) })));
}

export function mountWorldCup(container: Element) {
  const root = new FunctionComponent(WorldCup, container, { container });
  root.mount();
  return root;
}
