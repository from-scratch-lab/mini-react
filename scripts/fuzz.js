#!/usr/bin/env node
/**
 * 차등 fuzz를 길게 돌린다 (CI는 tests/diff/differential.test.js에서 짧게 돌린다).
 *
 *   npm run fuzz                                  시드 1~5, 시드마다 1,000라운드 × 4단계
 *   npm run fuzz -- --seed 99 --rounds 1500       시드 하나 (테스트 실패 메시지의 시드로 재현)
 *   npm run fuzz -- --seeds 10 --reuse 0.5        vnode 재사용 비율을 높여서
 *
 * 불일치가 있으면 시드·라운드·단계·HTML·기대·실제를 출력하고 종료 코드 1로 끝난다.
 */
import { JSDOM } from 'jsdom';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? def : Number(args[i + 1]);
};
const ROUNDS = opt('rounds', 1000);
const STEPS = opt('steps', 4);
const REUSE = opt('reuse', 0);
const seeds = args.includes('--seed') ? [opt('seed')] : Array.from({ length: opt('seeds', 5) }, (_, i) => i + 1);

// 하네스와 src는 브라우저 전역(document 등)을 쓴다. jsdom 창의 전역을 Node 전역에 연결한 뒤 불러온다.
const { window } = new JSDOM('<!doctype html><html><body></body></html>');
for (const name of ['window', 'document', 'Node', 'MutationObserver', 'DocumentFragment']) {
  globalThis[name] = name === 'window' ? window : window[name];
}
console.warn = () => {}; // 중복 key 경고는 fuzz 입력에서 일부러 만든다
const { runDifferential } = await import('../tests/support/differential.js');

let failed = 0;
for (const seed of seeds) {
  const started = Date.now();
  const report = runDifferential({ seed, rounds: ROUNDS, steps: STEPS, reuse: REUSE });
  const ms = Date.now() - started;
  const types = Object.entries(report.patchesByType).map(([t, n]) => `${t} ${n}`).join(', ');
  console.log(
    `seed ${seed}: ${report.steps} patch · 불일치 ${report.mismatches.length} · 재사용 ${report.reused} · ` +
      `기록 ${report.records} · 붙임 ${report.nodesAdded} · 뗌 ${report.nodesRemoved} · 새 노드 ${report.created} · ${ms}ms`,
  );
  console.log(`  패치: ${types}`);
  for (const m of report.mismatches) console.log(`\n${m}\n`);
  if (report.mismatches.length) failed += 1;
}
process.exit(failed ? 1 : 0);
