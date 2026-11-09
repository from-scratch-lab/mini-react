#!/usr/bin/env node
/**
 * 차등 fuzz를 길게 돌린다 (CI는 tests/diff/differential.test.js에서 짧게 돌린다).
 *
 *   npm run fuzz                                  시드 1~5, 시드마다 1,000라운드 × 4단계
 *   npm run fuzz -- --seed 99 --rounds 1500       시드 하나 (테스트 실패 메시지의 시드로 재현)
 *   npm run fuzz -- --seeds 10 --reuse 0.5        vnode 재사용 비율을 높여서
 *
 * 불일치가 있으면 시드·라운드·단계·HTML·최소 재현·기대·실제를 출력하고 종료 코드 1로 끝난다.
 * 알려진 버그(tests/diff/differential.test.js 위 주석의 B6 등)가 남아 있는 동안은 긴 실행에서 불일치가 나올 수 있다.
 */
import { JSDOM } from 'jsdom';

const NUMBER_OPTIONS = { seed: null, seeds: 5, rounds: 1000, steps: 4, reuse: 0 };
const values = { ...NUMBER_OPTIONS };
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 1) {
  const match = /^--([a-z]+)(?:=(.*))?$/.exec(args[i]);
  if (!match || !(match[1] in NUMBER_OPTIONS)) usage(`알 수 없는 인자: ${args[i]}`);
  const raw = match[2] ?? args[(i += 1)];
  const value = Number(raw);
  if (raw === undefined || raw === '' || !Number.isFinite(value)) usage(`--${match[1]}에는 숫자가 필요합니다 (받은 값: ${raw})`);
  values[match[1]] = value;
}
const seeds = values.seed !== null ? [values.seed] : Array.from({ length: values.seeds }, (_, i) => i + 1);

function usage(message) {
  console.error(`${message}\n사용법: npm run fuzz -- [--seed N | --seeds N] [--rounds N] [--steps N] [--reuse 0~1]`);
  process.exit(2);
}

// 하네스와 src는 브라우저 전역 document를 쓴다(htmlToVNodes). jsdom 창의 전역을 Node 전역에 연결한 뒤 불러온다.
const { window } = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = window;
globalThis.document = window.document;
console.warn = () => {}; // 중복 key 경고는 fuzz 입력에서 일부러 만든다
const { runDifferential } = await import('../tests/support/differential.js');

let failed = 0;
for (const seed of seeds) {
  const started = Date.now();
  const report = runDifferential({ seed, rounds: values.rounds, steps: values.steps, reuse: values.reuse });
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
