/**
 * README용 차트(SVG)를 만든다. 의존성 없음. 실행: node scripts/readme-charts.js
 * 결과: docs/images/<이름>-light.svg, <이름>-dark.svg (README는 <picture>로 GitHub 테마에 맞춰 고른다)
 *
 * 수치 출처 (모두 docs/benchmarks.md에 측정 방법과 함께 있다)
 * - 작업 수(패치·DOM 변경 기록): `npm run bench` 1,000행, 매번 같은 값 (시작 = dev 5cbca8b 기준선)
 * - 이동 수: 같은 key 순서를 엔진(LIS)과 React의 lastPlacedIndex 규칙으로 센 값 (React를 실행한 측정이 아님)
 * - 브라우저 시간: demo/bench, Chrome 152, 1,000행, 5회 중앙값
 * - diff 시간: Node 22 + jsdom, 1,000행, 같은 데이터 다시 렌더, 중앙값 (같은 기계)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../docs/images/', import.meta.url));

// 색: 검증한 범주형 팔레트 (파랑·주황·청록), "이전" 값은 무채색
const THEMES = {
  light: {
    surface: '#fcfcfb',
    ink: '#0b0b0b',
    ink2: '#52514e',
    grid: '#e4e3df',
    before: '#b9b8b1',
    series: ['#2a78d6', '#eb6834', '#1baf7a'],
    tile: '#f3f2ee',
  },
  dark: {
    surface: '#1a1a19',
    ink: '#f0efec',
    ink2: '#c3c2b7',
    grid: '#383835',
    before: '#5f5e58',
    series: ['#3987e5', '#d95926', '#199e70'],
    tile: '#252523',
  },
};
const FONT = "Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', 'Segoe UI', sans-serif";
const W = 760;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = (n) => (Number.isInteger(n) ? n.toLocaleString('en-US') : n.toFixed(1));

function svg(height, body, t, title) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}" role="img" aria-label="${esc(title)}" font-family="${FONT}">
<rect width="${W}" height="${height}" rx="12" fill="${t.surface}"/>
${body}
</svg>
`;
}

function heading(t, title, subtitle) {
  return `<text x="24" y="34" font-size="17" font-weight="700" fill="${t.ink}">${esc(title)}</text>
<text x="24" y="56" font-size="12.5" fill="${t.ink2}">${esc(subtitle)}</text>`;
}

function legend(t, items, y) {
  let x = 24;
  return items
    .map(({ name, color }) => {
      const out = `<rect x="${x}" y="${y - 9}" width="12" height="12" rx="3" fill="${color}"/><text x="${x + 18}" y="${y + 1}" font-size="12.5" fill="${t.ink2}">${esc(name)}</text>`;
      x += 40 + [...name].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e80 ? 13 : 7.5), 0); // 한글은 영문보다 넓다
      return out;
    })
    .join('\n');
}

/** 묶음 가로 막대: rows = [{ label, values: [이전, 이후] 또는 [a, b] }], 값마다 직접 라벨 */
function groupedBars(t, { title, subtitle, rows, series, max, unit = '' }) {
  const top = 92;
  const labelW = 210;
  const plotW = W - labelW - 90;
  const barH = 14;
  const gap = 4;
  const rowH = series.length * (barH + gap) + 18;
  const height = top + rows.length * rowH + 16;
  const x0 = 24 + labelW;
  // 계열이 하나면 범례 없이 제목이 이름을 대신한다
  const parts = [heading(t, title, subtitle), series.length > 1 ? legend(t, series, 76) : ''];
  rows.forEach((row, r) => {
    const y = top + r * rowH;
    parts.push(`<text x="24" y="${y + (series.length * (barH + gap)) / 2 + 3}" font-size="13" fill="${t.ink}">${esc(row.label)}</text>`);
    row.values.forEach((v, i) => {
      const by = y + i * (barH + gap);
      const w = Math.max(v === 0 ? 0 : 3, (v / max) * plotW);
      parts.push(`<rect x="${x0}" y="${by}" width="${w}" height="${barH}" rx="4" fill="${series[i].color}"/>`);
      const strong = i === row.values.length - 1 ? ' font-weight="700"' : '';
      parts.push(`<text x="${x0 + w + 6}" y="${by + barH - 3}" font-size="12"${strong} fill="${t.ink}">${fmt(v)}${unit}</text>`);
    });
    parts.push(`<line x1="${x0}" y1="${y - 4}" x2="${x0}" y2="${y + series.length * (barH + gap)}" stroke="${t.grid}"/>`);
  });
  return svg(height, parts.join('\n'), t, title);
}

/** 누적 가로 막대 (구간 사이 2px 틈), 끝에 합계 */
function stackedBars(t, { title, subtitle, rows, series, max, unit }) {
  const top = 92;
  const labelW = 190;
  const plotW = W - labelW - 100;
  const barH = 18;
  const rowH = 30;
  const height = top + rows.length * rowH + 30;
  const x0 = 24 + labelW;
  const parts = [heading(t, title, subtitle), legend(t, series, 76)];
  for (let g = 0; g <= max; g += 10) {
    const gx = x0 + (g / max) * plotW;
    parts.push(`<line x1="${gx}" y1="${top - 6}" x2="${gx}" y2="${top + rows.length * rowH - 6}" stroke="${t.grid}"/>`);
    parts.push(`<text x="${gx}" y="${top + rows.length * rowH + 10}" font-size="11" text-anchor="middle" fill="${t.ink2}">${g}${unit}</text>`);
  }
  rows.forEach((row, r) => {
    const y = top + r * rowH;
    parts.push(`<text x="24" y="${y + barH - 4}" font-size="13" fill="${t.ink}">${esc(row.label)}</text>`);
    let x = x0;
    row.values.forEach((v, i) => {
      const w = (v / max) * plotW;
      if (w > 0.5) parts.push(`<rect x="${x}" y="${y}" width="${Math.max(w - 2, 1)}" height="${barH}" rx="3" fill="${series[i].color}"/>`);
      x += w;
    });
    const total = row.values.reduce((a, b) => a + b, 0);
    parts.push(`<text x="${x + 6}" y="${y + barH - 4}" font-size="12" font-weight="700" fill="${t.ink}">${fmt(total)}${unit}</text>`);
  });
  return svg(height, parts.join('\n'), t, title);
}

/** 계단 선 그래프: 병합할 때마다 늘어난 테스트 수 */
function stepLine(t, { title, subtitle, points, min, max, color }) {
  const top = 80;
  const left = 56;
  const plotW = W - left - 40;
  const plotH = 170;
  const height = top + plotH + 58;
  const xOf = (i) => left + (i / (points.length - 1)) * plotW;
  const yOf = (v) => top + plotH - ((v - min) / (max - min)) * plotH;
  const parts = [heading(t, title, subtitle)];
  for (let g = min; g <= max; g += 40) {
    parts.push(`<line x1="${left}" y1="${yOf(g)}" x2="${left + plotW}" y2="${yOf(g)}" stroke="${t.grid}"/>`);
    parts.push(`<text x="${left - 8}" y="${yOf(g) + 4}" font-size="11" text-anchor="end" fill="${t.ink2}">${g}</text>`);
  }
  let d = `M${xOf(0)},${yOf(points[0].v)}`;
  points.slice(1).forEach((p, i) => {
    d += ` H${xOf(i + 1)} V${yOf(p.v)}`;
  });
  parts.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>`);
  points.forEach((p, i) => {
    parts.push(`<circle cx="${xOf(i)}" cy="${yOf(p.v)}" r="4.5" fill="${color}" stroke="${t.surface}" stroke-width="2"/>`);
    if (p.label) {
      parts.push(`<text x="${xOf(i)}" y="${yOf(p.v) - 12}" font-size="11.5" text-anchor="middle" font-weight="700" fill="${t.ink}">${p.v}</text>`);
      parts.push(`<text x="${xOf(i)}" y="${top + plotH + 22}" font-size="11" text-anchor="middle" fill="${t.ink2}">${esc(p.label)}</text>`);
    }
  });
  return svg(height, parts.join('\n'), t, title);
}

/** 숫자 카드 한 줄 */
function tiles(t, items) {
  const height = 132;
  const gap = 12;
  const w = (W - 24 * 2 - gap * (items.length - 1)) / items.length;
  const parts = items.map((it, i) => {
    const x = 24 + i * (w + gap);
    return `<rect x="${x}" y="18" width="${w}" height="96" rx="10" fill="${t.tile}"/>
<text x="${x + 16}" y="46" font-size="12" fill="${t.ink2}">${esc(it.caption)}</text>
<text x="${x + 16}" y="80" font-size="26" font-weight="800" fill="${it.accent ? t.series[0] : t.ink}">${esc(it.value)}</text>
<text x="${x + 16}" y="101" font-size="11.5" fill="${t.ink2}">${esc(it.note)}</text>`;
  });
  return svg(height, parts.join('\n'), t, items.map((it) => `${it.caption} ${it.value}`).join(', '));
}

const charts = {
  highlights: (t) =>
    tiles(t, [
      { caption: '같은 데이터 다시 렌더', value: '2,000 → 0', note: '패치 수 (1,000행)', accent: true },
      { caption: '1,000행 생성·지우기', value: '1,000 → 1', note: 'DOM 변경 알림', accent: true },
      { caption: '두 행 swap 이동 수', value: '2 vs 997', note: 'LIS vs React식 규칙' },
      { caption: '테스트 · 찾아 고친 버그', value: '355 · 4', note: '차등 fuzz 불일치 0' },
    ]),
  work: (t) =>
    groupedBars(t, {
      title: '1,000행에서 엔진이 하는 일의 수',
      subtitle: 'npm run bench · 매번 같은 값 · 시작 = dev 5cbca8b',
      series: [
        { name: '시작', color: t.before },
        { name: '지금', color: t.series[0] },
      ],
      max: 2100,
      rows: [
        { label: '같은 데이터 다시 렌더 · 패치', values: [2000, 0] },
        { label: '10행마다 갱신 · 패치', values: [2100, 100] },
        { label: '한 행 선택 · 패치', values: [2001, 1] },
        { label: '빈 표에 생성 · DOM 변경 기록', values: [1000, 1] },
        { label: '전체 지우기 · DOM 변경 기록', values: [1000, 1] },
        { label: '전체 교체 · DOM 변경 기록', values: [2000, 2] },
      ],
    }),
  moves: (t) =>
    groupedBars(t, {
      title: 'key 목록 재정렬: 옮기는 노드 수',
      subtitle: '1,000행 · 같은 key 순서를 두 규칙으로 센 값 (React 쪽은 실행 측정이 아님)',
      series: [
        { name: '이 엔진 (LIS)', color: t.series[0] },
        { name: 'React식 lastPlacedIndex', color: t.series[1] },
      ],
      max: 1000,
      rows: [
        { label: '두 행 swap (1 ↔ 998)', values: [2, 997] },
        { label: '맨 뒤 → 맨 앞', values: [1, 999] },
        { label: '뒤집기', values: [999, 999] },
      ],
    }),
  browser: (t) =>
    stackedBars(t, {
      title: '실제 브라우저에서 걸린 시간 (Reflow 포함)',
      subtitle: 'demo/bench · Chrome 152 · 1,000행 · 5회 중앙값',
      series: [
        { name: 'diff (비교)', color: t.series[0] },
        { name: 'patch (DOM 반영)', color: t.series[1] },
        { name: 'layout (Reflow)', color: t.series[2] },
      ],
      max: 50,
      unit: 'ms',
      rows: [
        { label: '1k 뒤에 1k 추가', values: [5.8, 9.9, 33.9] },
        { label: '빈 표에 생성', values: [1.2, 11.3, 28.2] },
        { label: '뒤집기', values: [4.2, 5.9, 27.1] },
        { label: '10행마다 갱신', values: [8.3, 1.0, 5.2] },
        { label: '두 행 swap', values: [7.0, 0.7, 4.6] },
        { label: '한 행 선택', values: [3.7, 0.4, 0] },
        { label: '같은 데이터 다시 렌더', values: [4.2, 0.5, 0] },
      ],
    }),
  diff: (t) =>
    groupedBars(t, {
      title: '같은 데이터 다시 렌더: diff 시간',
      subtitle: 'Node 22 + jsdom · 1,000행 · 중앙값 · 같은 기계 (jsdom 시간은 ±30% 흔들린다)',
      series: [{ name: 'diff ms', color: t.series[0] }],
      max: 16,
      unit: 'ms',
      rows: [
        { label: '시작 (dev 5cbca8b)', values: [14.3] },
        { label: '핸들러 상자 · 일괄 삽입 후', values: [11.3] },
        { label: '자식 비교 빠른 경로 후', values: [8.4] },
      ],
    }),
  tests: (t) =>
    stepLine(t, {
      title: '병합마다 늘어난 테스트',
      subtitle: '모든 병합은 bash .claude/check.sh 통과가 조건',
      color: t.series[0],
      min: 200,
      max: 360,
      points: [
        { v: 237, label: '시작' },
        { v: 244, label: 'B1·B2' },
        { v: 268, label: '벤치·예산' },
        { v: 272 },
        { v: 279, label: '개념' },
        { v: 290, label: '핸들러' },
        { v: 301, label: 'fuzz' },
        { v: 320, label: '일괄 삽입' },
        { v: 339, label: 'B7' },
        { v: 344 },
        { v: 351, label: '프리셋' },
        { v: 355, label: '끝' },
      ],
    }),
};

mkdirSync(OUT, { recursive: true });
for (const [name, make] of Object.entries(charts)) {
  for (const [mode, theme] of Object.entries(THEMES)) writeFileSync(`${OUT}${name}-${mode}.svg`, make(theme));
}
console.log(`docs/images: ${Object.keys(charts).length * 2} files`);
