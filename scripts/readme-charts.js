/**
 * README용 슬라이드 이미지(SVG)를 만든다. 의존성 없음. 실행: node scripts/readme-charts.js
 * 결과: docs/images/<이름>.svg — 흰 카드 슬라이드라 GitHub 라이트·다크 테마 어디서나 같게 보인다.
 *
 * 수치 출처
 * - Part 2(LIS 연구): docs/perf/lis-data/2026-11-09.csv 를 그대로 읽는다 (방법: docs/perf/lis-experiment.md)
 * - 공통 기반 작업 수: `npm run bench` 1,000행, 매번 같은 값 (docs/benchmarks.md)
 * - 테스트 수: 병합마다 bash .claude/check.sh 결과
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../docs/images/', import.meta.url));
const CSV = fileURLToPath(new URL('../docs/perf/lis-data/2026-11-09.csv', import.meta.url));

// 파랑 단색 계열 (남색 → 파랑 → 연파랑). LIS = 파랑, 단방향 스캔 = 연파랑, React = 남색
const C = {
  navy: '#0b2069',
  royal: '#1d4ed8',
  blue: '#3b6ef5',
  sky: '#8db0ff',
  pale: '#c9d7fb',
  mist: '#eef3ff',
  ink: '#111827',
  ink2: '#6b7280',
  line: '#e5e9f2',
  card: '#ffffff',
  page: '#f6f8fc',
};
const FONT = "Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', 'Segoe UI', sans-serif";
const W = 960;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = (n, digits = 2) => (Number.isInteger(n) ? n.toLocaleString('en-US') : n.toFixed(digits));
const textWidth = (s, size) => [...String(s)].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e80 ? 1.0 : 0.58) * size, 0);

// ---------- 데이터 ----------
function readCsv() {
  const lines = readFileSync(CSV, 'utf8').split('\n').filter((l) => l && !l.startsWith('#'));
  const header = lines[0].split(',');
  return Object.fromEntries(
    lines.slice(1).map((line) => {
      const cells = line.split(',');
      const row = Object.fromEntries(header.map((h, i) => [h, cells[i] === '' ? null : Number.isNaN(Number(cells[i])) ? cells[i] : Number(cells[i])]));
      return [row.id, row];
    }),
  );
}
const D = readCsv();

// ---------- 슬라이드 부품 ----------
const DEFS = `<defs>
<filter id="sh" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="6" stdDeviation="9" flood-color="#1e2a55" flood-opacity="0.10"/></filter>
<filter id="sh2" x="-10%" y="-10%" width="120%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#1e2a55" flood-opacity="0.08"/></filter>
<linearGradient id="gA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.royal}" stop-opacity="0.55"/><stop offset="1" stop-color="${C.royal}" stop-opacity="0.04"/></linearGradient>
<linearGradient id="gB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.sky}" stop-opacity="0.45"/><stop offset="1" stop-color="${C.sky}" stop-opacity="0.05"/></linearGradient>
<linearGradient id="gBar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.blue}"/><stop offset="1" stop-color="${C.royal}"/></linearGradient>
<linearGradient id="gNavy" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1c3aa9"/><stop offset="1" stop-color="${C.navy}"/></linearGradient>
</defs>`;

/** 슬라이드 한 장: 흰 카드 + 제목·부제 + 오른쪽 위 태그 */
function slide(height, { title, subtitle, tag }, body, label) {
  const tagW = textWidth(tag, 12) + 30;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}" role="img" aria-label="${esc(label)}" font-family="${FONT}">
${DEFS}
<rect x="14" y="10" width="${W - 28}" height="${height - 34}" rx="18" fill="${C.card}" stroke="${C.line}" filter="url(#sh)"/>
<rect x="46" y="44" width="5" height="26" rx="2.5" fill="${C.royal}"/>
<text x="62" y="65" font-size="25" font-weight="800" fill="${C.ink}" letter-spacing="-0.5">${esc(title)}</text>
<text x="62" y="91" font-size="13.5" fill="${C.ink2}">${esc(subtitle)}</text>
<rect x="${W - 46 - tagW}" y="44" width="${tagW}" height="26" rx="13" fill="${C.navy}"/>
<text x="${W - 46 - tagW / 2}" y="61.5" font-size="12" font-weight="700" text-anchor="middle" fill="#ffffff" letter-spacing="1">${esc(tag)}</text>
${body}
</svg>
`;
}

const card = (x, y, w, h, fill = C.card) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${fill}" stroke="${C.line}" filter="url(#sh2)"/>`;
const badge = (x, y, n) => `<rect x="${x}" y="${y}" width="36" height="36" rx="8" fill="url(#gNavy)"/><text x="${x + 18}" y="${y + 24}" font-size="15" font-weight="800" text-anchor="middle" fill="#ffffff">${n}</text>`;

/** 도넛 게이지: pct(0~100) 만큼 칠한다 */
function donut(cx, cy, r, pct, color, center, sub) {
  const len = 2 * Math.PI * r;
  const filled = Math.max((pct / 100) * len, 2);
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${C.mist}" stroke-width="14"/>
<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="14" stroke-linecap="round" stroke-dasharray="${filled} ${len}" transform="rotate(-90 ${cx} ${cy})"/>
<text x="${cx}" y="${cy + 8}" font-size="27" font-weight="800" text-anchor="middle" fill="${C.ink}">${esc(center)}</text>
<text x="${cx}" y="${cy + 28}" font-size="11.5" text-anchor="middle" fill="${C.ink2}">${esc(sub)}</text>`;
}

/** 여러 줄 글 (줄마다 배열 원소) */
const lines = (x, y, arr, size = 12.5, color = C.ink2, gap = 19) =>
  arr.map((s, i) => `<text x="${x}" y="${y + i * gap}" font-size="${size}" fill="${color}">${s}</text>`).join('\n');

// ---------- 슬라이드 ----------

/** 배너 */
function banner() {
  const H = 300;
  const keys = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  const next = ['A', 'F', 'C', 'D', 'B', 'E', 'G'];
  const stays = new Set(['A', 'C', 'D', 'E', 'G']);
  const x0 = 590;
  const cell = 40;
  const box = (k, x, y, stay) =>
    `<rect x="${x}" y="${y}" width="32" height="32" rx="8" fill="${stay ? '#5b8cff' : 'none'}" stroke="${stay ? '#5b8cff' : '#ffb27a'}" stroke-width="2"/><text x="${x + 16}" y="${y + 21}" font-size="14" font-weight="800" text-anchor="middle" fill="${stay ? '#ffffff' : '#ffb27a'}">${k}</text>`;
  const parts = [
    `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#081a5c"/><stop offset="1" stop-color="#1d4ed8"/></linearGradient>
<marker id="ar" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#ffb27a"/></marker></defs>`,
    `<rect width="${W}" height="${H}" rx="18" fill="url(#bg)"/>`,
    `<circle cx="${W - 60}" cy="40" r="120" fill="#ffffff" fill-opacity="0.04"/><circle cx="80" cy="${H}" r="150" fill="#ffffff" fill-opacity="0.04"/>`,
    `<text x="52" y="96" font-size="48" font-weight="800" fill="#ffffff" letter-spacing="-1.5">mini-react</text>`,
    `<text x="54" y="134" font-size="17" fill="#c7d6ff">Virtual DOM · Diff · Patch · Hooks를 직접 구현하고,</text>`,
    `<text x="54" y="160" font-size="17" fill="#c7d6ff">LIS 기반 keyed 재조정이 <tspan font-weight="800" fill="#ffffff">언제 이득이고 언제 아닌지</tspan> 측정했다</text>`,
  ];
  const chip = (x, a, b) => {
    const w = textWidth(a, 13) + textWidth(b, 13) + 40;
    return [`<rect x="${x}" y="198" width="${w}" height="36" rx="18" fill="#ffffff" fill-opacity="0.12" stroke="#ffffff" stroke-opacity="0.3"/><text x="${x + 18}" y="221" font-size="13" font-weight="800" fill="#ffffff">${esc(a)}<tspan font-weight="400" fill="#dbe5ff"> ${esc(b)}</tspan></text>`, w];
  };
  const [c1, w1] = chip(52, 'Part 1', '필수 기능 증명');
  const [c2] = chip(52 + w1 + 12, 'Part 2', 'LIS 차별화 연구');
  parts.push(c1, c2, `<text x="54" y="270" font-size="12.5" fill="#9fb6f5">크래프톤 정글 13기 · Vanilla JS · 런타임 의존성 0</text>`);
  parts.push(`<rect x="${x0 - 22}" y="44" width="352" height="214" rx="16" fill="#ffffff" fill-opacity="0.07" stroke="#ffffff" stroke-opacity="0.15"/>`);
  parts.push(`<text x="${x0}" y="78" font-size="12" fill="#9fb6f5">이전</text><text x="${x0}" y="200" font-size="12" fill="#9fb6f5">다음</text>`);
  keys.forEach((k, i) => parts.push(box(k, x0 + 36 + i * cell, 60, stays.has(k))));
  next.forEach((k, i) => parts.push(box(k, x0 + 36 + i * cell, 182, stays.has(k))));
  for (const k of stays) {
    const a = x0 + 36 + keys.indexOf(k) * cell + 16;
    const b = x0 + 36 + next.indexOf(k) * cell + 16;
    parts.push(`<line x1="${a}" y1="96" x2="${b}" y2="178" stroke="#5b8cff" stroke-opacity="0.45" stroke-width="1.5"/>`);
  }
  for (const k of ['B', 'F']) {
    const a = x0 + 36 + keys.indexOf(k) * cell + 16;
    const b = x0 + 36 + next.indexOf(k) * cell + 16;
    parts.push(`<path d="M${a},96 C${a},138 ${b},138 ${b},176" fill="none" stroke="#ffb27a" stroke-width="2" stroke-dasharray="5 4" marker-end="url(#ar)"/>`);
  }
  parts.push(`<text x="${x0 + 36}" y="240" font-size="12.5" fill="#dbe5ff"><tspan fill="#5b8cff" font-weight="800">■</tspan> 그대로 둔다 (LIS)    <tspan fill="#ffb27a" font-weight="800">■</tspan> 옮긴다 (2개)</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="mini-react: LIS 기반 keyed 재조정이 언제 이득인지 측정한 미니 React" font-family="${FONT}">
${parts.join('\n')}
</svg>
`;
}

/** Part 1: 필수 기능 증명 — 번호 카드 + 테스트 증가 영역 그래프 */
function part1() {
  const H = 470;
  const parts = [];
  const items = [
    ['01', 'Phase 1 · Virtual DOM · Diff · Patch', ['패치 6종, key 목록, 실제 DOM ↔ 가상 노드', '검증 페이지: Patch · 뒤로 · 앞으로']],
    ['02', 'Phase 2 · Component · Hooks', ['FunctionComponent, useState · useEffect · useMemo', '루트만 상태, 자식은 순수 함수']],
    ['03', '연결 · 정확성', ['setState → diff → patch 하나의 파이프라인', '브라우저 대조 fuzz로 폼 버그 4개 수정']],
  ];
  items.forEach(([n, title, desc], i) => {
    const y = 122 + i * 104;
    parts.push(card(46, y, 400, 90), badge(64, y + 18, n));
    parts.push(`<text x="116" y="${y + 33}" font-size="15" font-weight="800" fill="${C.ink}">${esc(title)}</text>`);
    parts.push(lines(116, y + 55, desc.map(esc), 12.5));
    parts.push(`<circle cx="${46 + 400 - 26}" cy="${y + 26}" r="11" fill="${C.mist}"/><path d="M${46 + 400 - 31},${y + 26} l4,4 l7,-8" fill="none" stroke="${C.royal}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`);
  });
  // 오른쪽: 테스트 증가
  const cx = 474;
  const cw = W - 46 - cx;
  parts.push(card(cx, 122, cw, 298));
  parts.push(`<text x="${cx + 24}" y="152" font-size="15" font-weight="800" fill="${C.ink}">병합마다 늘어난 테스트</text>`);
  parts.push(`<text x="${cx + 24}" y="172" font-size="12" fill="${C.ink2}">모든 병합은 check.sh 통과가 조건</text>`);
  const pts = [237, 244, 268, 279, 290, 301, 320, 339, 351, 355, 392];
  const labels = ['시작', '', '벤치', '', '핸들러', 'fuzz', '', 'B7', '프리셋', '', 'LIS'];
  const px = (i) => cx + 40 + (i / (pts.length - 1)) * (cw - 80);
  const py = (v) => 380 - ((v - 200) / 200) * 170;
  const path = pts.map((v, i) => `${i ? 'L' : 'M'}${px(i)},${py(v)}`).join(' ');
  for (const g of [200, 300, 400]) parts.push(`<line x1="${cx + 40}" y1="${py(g)}" x2="${cx + cw - 40}" y2="${py(g)}" stroke="${C.line}" stroke-dasharray="${g === 200 ? '' : '3 4'}"/><text x="${cx + 32}" y="${py(g) + 4}" font-size="10.5" text-anchor="end" fill="${C.ink2}">${g}</text>`);
  parts.push(`<path d="${path} L${px(pts.length - 1)},${py(200)} L${px(0)},${py(200)} Z" fill="url(#gA)"/>`);
  parts.push(`<path d="${path}" fill="none" stroke="${C.royal}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`);
  pts.forEach((v, i) => {
    parts.push(`<circle cx="${px(i)}" cy="${py(v)}" r="${i === pts.length - 1 ? 6 : 3.5}" fill="#ffffff" stroke="${C.royal}" stroke-width="2.4"/>`);
    if (labels[i]) parts.push(`<text x="${px(i)}" y="402" font-size="10.5" text-anchor="middle" fill="${C.ink2}">${labels[i]}</text>`);
  });
  parts.push(`<rect x="${px(pts.length - 1) - 62}" y="${py(392) - 40}" width="62" height="26" rx="13" fill="${C.navy}"/><text x="${px(pts.length - 1) - 31}" y="${py(392) - 22}" font-size="13" font-weight="800" text-anchor="middle" fill="#ffffff">392</text>`);
  parts.push(`<text x="${px(0)}" y="${py(237) - 12}" font-size="12" font-weight="700" text-anchor="middle" fill="${C.ink2}">237</text>`);
  return slide(H, { title: 'Part 1 · 필수 기능 증명', subtitle: '과제 요구사항을 조건마다 증거(파일:줄, 테스트 이름)로 확인 — 체크리스트 전 항목 충족', tag: 'PART 1' }, parts.join('\n'), 'Part 1 필수 기능 증명: Phase 1, Phase 2, 연결과 정확성, 테스트 237개에서 392개로');
}

/** Part 2 핵심 결과: 도넛 4개 + 아래 설명 카드 */
function lisSummary() {
  const H = 452;
  const r1 = D['ratio-6'];
  const r50 = D['ratio-10'];
  const r100 = D['ratio-11'];
  const sw = D['pattern-12'];
  const items = [
    { pct: (r1.A_js / r1.B_js) * 100, center: `${Math.round((r1.A_js / r1.B_js) * 100)}%`, sub: 'LIS ÷ 단방향', title: '1%만 옮길 때', note: [`합계 시간 ${fmt(r1.A_js)} vs ${fmt(r1.B_js)}ms`, `옮긴 노드 ${r1.moved_A} vs ${r1.moved_B}`], color: C.royal },
    { pct: (sw.moved_A / sw.moved_B) * 100, center: '0.2%', sub: '옮긴 노드 비율', title: '두 행 swap', note: [`옮긴 노드 ${sw.moved_A} vs ${sw.moved_B}`, `React 18.3.1 실측도 ${sw.moved_C}`], color: C.royal },
    { pct: (r50.A_js / r50.B_js) * 100, center: `${Math.round((r50.A_js / r50.B_js) * 100)}%`, sub: 'LIS ÷ 단방향', title: '50% 옮길 때', note: [`합계 시간 ${fmt(r50.A_js)} vs ${fmt(r50.B_js)}ms`, `옮긴 노드 ${r50.moved_A} vs ${r50.moved_B}`], color: C.blue },
    { pct: (r100.A_js / r100.B_js) * 100, center: `${Math.round((r100.A_js / r100.B_js) * 100)}%`, sub: 'LIS ÷ 단방향', title: '전부 섞을 때', note: [`합계 시간 ${fmt(r100.A_js)} vs ${fmt(r100.B_js)}ms`, '옮길 노드가 비슷 → 이득 없음'], color: C.sky },
  ];
  const parts = [];
  const colW = (W - 92 - 3 * 18) / 4;
  items.forEach((it, i) => {
    const x = 46 + i * (colW + 18);
    parts.push(donut(x + colW / 2, 190, 62, it.pct, it.color, it.center, it.sub));
    parts.push(card(x, 280, colW, 124, i === 0 ? 'url(#gNavy)' : C.card));
    const dark = i === 0;
    parts.push(`<text x="${x + 20}" y="312" font-size="15.5" font-weight="800" fill="${dark ? '#ffffff' : C.ink}">${esc(it.title)}</text>`);
    parts.push(lines(x + 20, 336, it.note.map(esc), 12, dark ? '#c7d6ff' : C.ink2));
    parts.push(`<rect x="${x + 20}" y="378" width="${colW - 40}" height="6" rx="3" fill="${dark ? '#ffffff' : C.mist}" fill-opacity="${dark ? 0.2 : 1}"/><rect x="${x + 20}" y="378" width="${Math.max(((colW - 40) * it.pct) / 100, 4)}" height="6" rx="3" fill="${dark ? '#ffffff' : it.color}"/>`);
  });
  return slide(H, { title: 'Part 2 · LIS 차별화 연구 — 핵심 결과', subtitle: 'N=1,000 · LIS vs 단방향 스캔(React 방식 참고 구현) · Chrome 152, 63회 중앙값 · 낮을수록 LIS가 적게 씀', tag: 'PART 2' }, parts.join('\n'), 'LIS 핵심 결과: 1% 이동 59%, swap 옮긴 노드 0.2%, 50% 이동 79%, 전체 셔플 99%');
}

/** 트레이드오프: 영역 그래프(합계·commit) + 번호 카드 */
function lisTradeoff() {
  const H = 500;
  const rows = ['ratio-6', 'ratio-7', 'ratio-8', 'ratio-9', 'ratio-10', 'ratio-11'].map((id) => D[id]);
  const parts = [];
  const cx = 46;
  const cw = 540;
  parts.push(card(cx, 116, cw, 340));
  parts.push(`<text x="${cx + 24}" y="148" font-size="15" font-weight="800" fill="${C.ink}">옮긴 비율별 commit 시간 (ms)</text>`);
  parts.push(`<rect x="${cx + 24}" y="160" width="12" height="12" rx="3" fill="${C.royal}"/><text x="${cx + 42}" y="171" font-size="12" fill="${C.ink2}">LIS</text><rect x="${cx + 84}" y="160" width="12" height="12" rx="3" fill="${C.sky}"/><text x="${cx + 102}" y="171" font-size="12" fill="${C.ink2}">단방향 스캔</text>`);
  const x0 = cx + 56;
  const x1 = cx + cw - 70;
  const y0 = 410;
  const yTop = 196;
  const max = 1.0;
  const px = (i) => x0 + (i / (rows.length - 1)) * (x1 - x0);
  const py = (v) => y0 - (v / max) * (y0 - yTop);
  for (const g of [0, 0.25, 0.5, 0.75, 1.0]) parts.push(`<line x1="${x0}" y1="${py(g)}" x2="${x1}" y2="${py(g)}" stroke="${C.line}" ${g ? 'stroke-dasharray="3 4"' : ''}/><text x="${x0 - 10}" y="${py(g) + 4}" font-size="10.5" text-anchor="end" fill="${C.ink2}">${g}</text>`);
  const area = (key, fill, stroke) => {
    const p = rows.map((r, i) => `${i ? 'L' : 'M'}${px(i)},${py(r[key])}`).join(' ');
    return `<path d="${p} L${px(rows.length - 1)},${y0} L${px(0)},${y0} Z" fill="${fill}"/><path d="${p}" fill="none" stroke="${stroke}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;
  };
  parts.push(area('B_commit', 'url(#gB)', C.sky), area('A_commit', 'url(#gA)', C.royal));
  rows.forEach((r, i) => {
    parts.push(`<circle cx="${px(i)}" cy="${py(r.B_commit)}" r="4" fill="#ffffff" stroke="${C.sky}" stroke-width="2.4"/><circle cx="${px(i)}" cy="${py(r.A_commit)}" r="4.5" fill="#ffffff" stroke="${C.royal}" stroke-width="2.6"/>`);
    parts.push(`<text x="${px(i)}" y="${y0 + 20}" font-size="11.5" text-anchor="middle" fill="${C.ink2}">${r.change.replace('k', '')}%</text>`);
  });
  parts.push(`<text x="${px(0) + 8}" y="${py(rows[0].A_commit) - 10}" font-size="12" font-weight="800" fill="${C.royal}">${fmt(rows[0].A_commit, 3)}</text>`);
  parts.push(`<text x="${px(0) + 8}" y="${py(rows[0].B_commit) - 10}" font-size="12" font-weight="800" fill="#5b7fd6">${fmt(rows[0].B_commit, 3)}</text>`);
  parts.push(`<text x="${x1 + 8}" y="${py(rows[5].B_commit) - 2}" font-size="12" font-weight="800" fill="#5b7fd6">${fmt(rows[5].B_commit, 2)}</text><text x="${x1 + 8}" y="${py(rows[5].A_commit) + 14}" font-size="12" font-weight="800" fill="${C.royal}">${fmt(rows[5].A_commit, 2)}</text>`);
  parts.push(`<text x="${(x0 + x1) / 2}" y="${y0 + 38}" font-size="11.5" text-anchor="middle" fill="${C.ink2}">옮긴 비율 k (무작위 위치로 이동)</text>`);
  // 오른쪽 번호 카드
  const rx = cx + cw + 22;
  const rw = W - 46 - rx;
  const notes = [
    ['01', 'diff에서 조금 더 쓴다', ['LIS 계산 때문에 diff 시간 중앙값', '+2~6% (구간이 겹쳐 단정은 안 함)']],
    ['02', 'commit에서 크게 아낀다', [`1% 이동: ${fmt(rows[0].B_commit, 3)} → ${fmt(rows[0].A_commit, 3)}ms`, `옮긴 노드 ${rows[0].moved_B} → ${rows[0].moved_A}`]],
    ['03', '많이 섞일수록 이득이 준다', [`합계 ${(rows[0].A_js / rows[0].B_js).toFixed(2)}× (1%) → ${(rows[5].A_js / rows[5].B_js).toFixed(2)}× (100%)`, '거의 다 섞이면 옮길 노드가 비슷']],
  ];
  notes.forEach(([n, title, desc], i) => {
    const y = 116 + i * 116;
    parts.push(card(rx, y, rw, 102), badge(rx + 18, y + 18, n));
    parts.push(`<text x="${rx + 68}" y="${y + 40}" font-size="15" font-weight="800" fill="${C.ink}">${esc(title)}</text>`);
    parts.push(lines(rx + 68, y + 64, desc.map(esc), 12.2));
  });
  return slide(H, { title: '트레이드오프: diff ↔ commit', subtitle: 'N=1,000 · 노드 k%를 무작위 위치로 옮긴 갱신 · Chrome 152 · 63회 중앙값', tag: 'PART 2' }, parts.join('\n'), 'LIS 트레이드오프: diff는 조금 더, commit은 크게 덜, 많이 섞일수록 이득이 준다');
}

/** 패턴별 옮긴 노드 수: 둥근 세로 막대 */
function lisPatterns() {
  const H = 470;
  const rows = [
    ['Swap', '두 행 교환', D['pattern-12']],
    ['Block Shift', '10% 덩어리 이동', D['pattern-13']],
    ['Reversal', '뒤집기', D['pattern-14']],
    ['Shuffle', '무작위 섞기', D['pattern-15']],
  ];
  const parts = [];
  parts.push(card(46, 116, W - 92, 312));
  const leg = [
    ['LIS', 'url(#gBar)'],
    ['단방향 스캔', C.sky],
    ['React 18.3.1 실측', C.navy],
  ];
  let lx = 70;
  leg.forEach(([name, fill]) => {
    parts.push(`<rect x="${lx}" y="140" width="12" height="12" rx="3" fill="${fill}"/><text x="${lx + 18}" y="151" font-size="12.5" fill="${C.ink2}">${esc(name)}</text>`);
    lx += 40 + textWidth(name, 12.5);
  });
  const y0 = 370;
  const top = 182;
  const py = (v) => y0 - (v / 1000) * (y0 - top);
  for (const g of [0, 500, 1000]) parts.push(`<line x1="96" y1="${py(g)}" x2="${W - 70}" y2="${py(g)}" stroke="${C.line}" ${g ? 'stroke-dasharray="3 4"' : ''}/><text x="88" y="${py(g) + 4}" font-size="10.5" text-anchor="end" fill="${C.ink2}">${fmt(g)}</text>`);
  const gw = (W - 70 - 96) / rows.length;
  const bw = 30;
  rows.forEach(([name, ko, r], i) => {
    const gx = 96 + i * gw + gw / 2;
    [
      [r.moved_A, 'url(#gBar)', C.royal],
      [r.moved_B, C.sky, '#5b7fd6'],
      [r.moved_C, C.navy, C.navy],
    ].forEach(([v, fill, ink], j) => {
      const x = gx + (j - 1.5) * (bw + 6);
      const h = Math.max(y0 - py(v), 3);
      parts.push(`<rect x="${x}" y="${y0 - h}" width="${bw}" height="${h}" rx="6" fill="${fill}"/>`);
      parts.push(`<text x="${x + bw / 2}" y="${y0 - h - 7}" font-size="11.5" font-weight="800" text-anchor="middle" fill="${ink}">${fmt(v)}</text>`);
    });
    parts.push(`<text x="${gx}" y="${y0 + 22}" font-size="13.5" font-weight="800" text-anchor="middle" fill="${C.ink}">${esc(name)}</text><text x="${gx}" y="${y0 + 40}" font-size="11.5" text-anchor="middle" fill="${C.ink2}">${esc(ko)}</text>`);
  });
  // 강조 말풍선: 비어 있는 Block Shift 위쪽에 두고 Swap의 LIS 막대를 점선으로 가리킨다
  const lisX = 96 + gw / 2 - 1.5 * (bw + 6) + bw / 2;
  const bx = 96 + gw + 20;
  const by = py(820);
  parts.push(`<path d="M${bx},${by + 23} C${lisX + 40},${by + 23} ${lisX},${y0 - 60} ${lisX},${y0 - 22}" fill="none" stroke="${C.navy}" stroke-width="1.6" stroke-dasharray="4 4"/>`);
  parts.push(`<circle cx="${lisX}" cy="${y0 - 18}" r="3.5" fill="${C.navy}"/>`);
  parts.push(`<rect x="${bx}" y="${by}" width="150" height="46" rx="12" fill="${C.navy}"/><text x="${bx + 75}" y="${by + 20}" font-size="13" font-weight="800" text-anchor="middle" fill="#ffffff">LIS는 2개만 옮긴다</text><text x="${bx + 75}" y="${by + 37}" font-size="11.5" text-anchor="middle" fill="#c7d6ff">단방향 · React는 997개</text>`);
  return slide(H, { title: '패턴별로 실제 옮긴 노드 수', subtitle: 'N=1,000 · DOM API 계수기로 측정 · React 18.3.1도 같은 계수기로 실측 — 단방향 스캔과 React는 모든 패턴에서 같은 값', tag: 'PART 2' }, parts.join('\n'), '패턴별 옮긴 노드 수: swap LIS 2 단방향 997 React 997, block shift 100, reversal 999, shuffle 943 대 995');
}

/** N × k 표: LIS ÷ 단방향 합계 시간 */
function lisHeatmap() {
  const H = 468;
  const Ns = [100, 1000, 5000];
  const ks = [25, 50, 75, 100];
  const parts = [];
  parts.push(card(46, 116, W - 92, 312));
  const left = 176;
  const top = 168;
  const cw = (W - 70 - left) / ks.length;
  const ch = 76;
  ks.forEach((k, j) => parts.push(`<text x="${left + j * cw + cw / 2}" y="${top - 14}" font-size="13" font-weight="800" text-anchor="middle" fill="${C.ink2}">${k}% 이동</text>`));
  Ns.forEach((N, i) => {
    parts.push(`<text x="72" y="${top + i * ch + ch / 2 + 5}" font-size="14" font-weight="800" fill="${C.ink}">N = ${fmt(N)}</text>`);
    ks.forEach((k, j) => {
      const r = D[`two-N${N}-k${k}`];
      const ratio = r.A_js / r.B_js;
      const overlap = r.A_js_q3 >= r.B_js_q1 && r.B_js_q3 >= r.A_js_q1;
      const x = left + j * cw;
      const y = top + i * ch;
      let fill;
      let ink;
      if (ratio >= 1) {
        fill = '#f1f2f6';
        ink = C.ink2;
      } else {
        const s = Math.min((1 - ratio) / 0.33, 1);
        fill = s > 0.66 ? C.royal : s > 0.4 ? C.blue : s > 0.2 ? C.sky : C.pale;
        ink = s > 0.4 ? '#ffffff' : C.navy;
      }
      parts.push(`<rect x="${x + 4}" y="${y + 4}" width="${cw - 8}" height="${ch - 8}" rx="12" fill="${fill}"/>`);
      parts.push(`<text x="${x + cw / 2}" y="${y + 41}" font-size="23" font-weight="800" text-anchor="middle" fill="${ink}">${ratio.toFixed(2)}×</text>`);
      parts.push(`<text x="${x + cw / 2}" y="${y + 60}" font-size="11" text-anchor="middle" fill="${ink}" fill-opacity="0.8">${fmt(r.A_js, 2)} / ${fmt(r.B_js, 2)} ms${overlap ? ' · 구간 겹침' : ''}</text>`);
    });
  });
  parts.push(`<text x="72" y="${top + 3 * ch + 22}" font-size="12" fill="${C.ink2}">진할수록 LIS가 빠름 · 회색 = LIS가 느렸던 칸(중앙값) · "구간 겹침" = 두 방식의 Q1~Q3가 겹쳐 차이를 단정할 수 없는 칸</text>`);
  return slide(H, { title: '언제 이득인가: 크기 N × 옮긴 비율 k', subtitle: 'LIS 합계 시간 ÷ 단방향 합계 시간 · Chrome 152 · 63회 중앙값 · 1보다 작으면 LIS가 빠름', tag: 'PART 2' }, parts.join('\n'), 'N과 k에 따른 LIS 대 단방향 합계 시간 비율. N=5000, k=100%에서만 1.04로 LIS가 느림');
}

/** 공통 기반: 진행 막대 (시작 → 지금) */
function foundation() {
  const H = 392;
  const rows = [
    ['같은 데이터 다시 렌더', '패치', 2000, 0, '핸들러 상자'],
    ['10행마다 갱신', '패치', 2100, 100, '핸들러 상자'],
    ['빈 표에 1,000행 생성', 'DOM 변경 기록', 1000, 1, '일괄 삽입'],
    ['1,000행 전체 지우기', 'DOM 변경 기록', 1000, 1, '일괄 삽입'],
  ];
  const parts = [card(46, 116, W - 92, 236)];
  const bx = 330;
  const bw = W - 70 - bx - 150;
  rows.forEach(([name, metric, before, after, how], i) => {
    const y = 146 + i * 50;
    parts.push(`<text x="72" y="${y + 6}" font-size="14" font-weight="800" fill="${C.ink}">${esc(name)}</text><text x="72" y="${y + 24}" font-size="11.5" fill="${C.ink2}">${esc(metric)} · ${esc(how)}</text>`);
    parts.push(`<rect x="${bx}" y="${y - 6}" width="${(before / 2100) * bw}" height="16" rx="8" fill="${C.pale}"/>`);
    parts.push(`<rect x="${bx}" y="${y - 6}" width="${Math.max((after / 2100) * bw, 8)}" height="16" rx="8" fill="url(#gBar)"/>`);
    parts.push(`<text x="${W - 70}" y="${y + 7}" font-size="15" font-weight="800" text-anchor="end" fill="${C.ink}"><tspan fill="${C.ink2}" font-weight="600">${fmt(before)} →</tspan> <tspan fill="${C.royal}">${fmt(after)}</tspan></text>`);
  });
  return slide(H, { title: '공통 기반: 하지 않아도 될 일 줄이기', subtitle: 'A·B 비교 전에 두 모드가 함께 쓰는 엔진 개선 · npm run bench 1,000행 · 연한 막대 = 시작, 진한 막대 = 지금', tag: 'BASE' }, parts.join('\n'), '공통 기반: 같은 데이터 다시 렌더 패치 2000에서 0, 10행 갱신 2100에서 100, 생성 DOM 변경 1000에서 1, 지우기 1000에서 1');
}

const SLIDES = { banner, part1, 'lis-summary': lisSummary, 'lis-tradeoff': lisTradeoff, 'lis-patterns': lisPatterns, 'lis-heatmap': lisHeatmap, foundation };

mkdirSync(OUT, { recursive: true });
for (const [name, make] of Object.entries(SLIDES)) writeFileSync(`${OUT}${name}.svg`, make());
console.log(`docs/images: ${Object.keys(SLIDES).length} files`);
