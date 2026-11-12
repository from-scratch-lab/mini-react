/**
 * Phase 1 프리셋 시나리오. 단계마다 테스트 영역에 넣을 HTML과, 바로 앞 단계에서 Patch하면 나올 패치 종류(expect)를 적어 둔다.
 * 첫 단계는 지금 실제 영역에 무엇이 있든 그 프리셋을 불러오는 단계라 expect가 없다.
 * 폼은 <form> 대신 <fieldset>으로 묶는다: 실제 영역의 <form>에서 Enter를 누르면 제출되어 페이지가 새로 고쳐진다.
 * 단계 버튼은 코드만 바꾸고, 실제 영역에 반영하는 것은 사용자가 누르는 Patch다(diff → patch 과정을 직접 보도록).
 */
const row = (key, name, score, extra = '') => `    <tr key="${key}"${extra}><td>${name}</td><td>${score}</td></tr>`;
const table = (rows) => `<table class="score-table">
  <thead><tr><th>이름</th><th>점수</th></tr></thead>
  <tbody>
${rows.join('\n')}
  </tbody>
</table>`;

const list = (items, keyed) =>
  `<ul class="todo">\n${items.map((t) => `  <li${keyed ? ` key="${t}"` : ''}>${t}</li>`).join('\n')}\n</ul>`;

export const PRESETS = [
  {
    id: 'table',
    label: '표 (table)',
    steps: [
      { label: '처음 표', html: table([row('kim', '김', 72), row('lee', '이', 95), row('park', '박', 88), row('choi', '최', 60)]) },
      { label: '점수순 정렬', expect: 'MOVE', html: table([row('lee', '이', 95), row('park', '박', 88), row('kim', '김', 72), row('choi', '최', 60)]) },
      { label: '점수 고치고 강조', expect: 'TEXT·PROPS', html: table([row('lee', '이', 95, ' class="top"'), row('park', '박', 91), row('kim', '김', 72), row('choi', '최', 60)]) },
      { label: '한 명 빼고 한 명 넣기', expect: 'REMOVE·CREATE', html: table([row('lee', '이', 95, ' class="top"'), row('park', '박', 91), row('kim', '김', 72), row('jung', '정', 84)]) },
    ],
  },
  {
    id: 'form',
    label: '폼 (fieldset)',
    steps: [
      {
        label: '처음 폼',
        html: `<fieldset>
  <legend>가입 정보</legend>
  <label>이름 <input type="text" placeholder="이름" /></label>
  <label><input type="checkbox" /> 알림 받기</label>
  <label><input type="radio" name="plan" checked /> 무료</label>
  <label><input type="radio" name="plan" /> 유료</label>
  <textarea>메모</textarea>
  <button type="button">저장</button>
</fieldset>`,
      },
      {
        label: '속성 바꾸기',
        expect: 'PROPS',
        html: `<fieldset>
  <legend>가입 정보</legend>
  <label>이름 <input type="text" placeholder="성과 이름" required /></label>
  <label><input type="checkbox" checked /> 알림 받기</label>
  <label><input type="radio" name="plan" /> 무료</label>
  <label><input type="radio" name="plan" checked /> 유료</label>
  <textarea>메모</textarea>
  <button type="button" disabled>저장</button>
</fieldset>`,
      },
    ],
  },
  {
    id: 'select',
    label: '선택 (select)',
    steps: [
      {
        label: '처음 선택 상자',
        html: `<select>
  <option key="html">HTML</option>
  <option key="css" selected>CSS</option>
  <option key="js">JavaScript</option>
</select>`,
      },
      {
        label: '선택 바꾸고 하나 더하기',
        expect: 'PROPS·CREATE',
        html: `<select>
  <option key="html">HTML</option>
  <option key="css">CSS</option>
  <option key="js" selected>JavaScript</option>
  <option key="ts">TypeScript</option>
</select>`,
      },
      {
        label: '여러 개 고르기 (multiple)',
        expect: 'PROPS',
        html: `<select multiple>
  <option key="html" selected>HTML</option>
  <option key="css">CSS</option>
  <option key="js" selected>JavaScript</option>
  <option key="ts">TypeScript</option>
</select>`,
      },
    ],
  },
  {
    id: 'nested',
    label: '중첩 목록',
    steps: [
      {
        label: '처음 목록',
        html: `<ol>
  <li key="p1">Phase 1<ul><li key="vdom">Virtual DOM</li><li key="diff">Diff</li><li key="patch">Patch</li></ul></li>
  <li key="p2">Phase 2<ul><li key="state">useState</li><li key="effect">useEffect</li></ul></li>
</ol>`,
      },
      {
        label: '안쪽 순서 바꾸고 항목 더하기',
        expect: 'MOVE·CREATE',
        html: `<ol>
  <li key="p1">Phase 1<ul><li key="vdom">Virtual DOM</li><li key="patch">Patch</li><li key="diff">Diff</li></ul></li>
  <li key="p2">Phase 2<ul><li key="state">useState</li><li key="effect">useEffect</li><li key="memo">useMemo</li></ul></li>
</ol>`,
      },
      {
        label: '바깥 순서 바꾸기',
        expect: 'MOVE',
        html: `<ol>
  <li key="p2">Phase 2<ul><li key="state">useState</li><li key="effect">useEffect</li><li key="memo">useMemo</li></ul></li>
  <li key="p1">Phase 1<ul><li key="vdom">Virtual DOM</li><li key="patch">Patch</li><li key="diff">Diff</li></ul></li>
</ol>`,
      },
    ],
  },
  {
    id: 'reorder',
    label: 'key 재정렬',
    steps: [
      { label: 'key 있는 목록', html: list(['사과', '바나나', '체리', '포도'], true) },
      { label: 'key 있게 뒤집기', expect: 'MOVE', html: list(['포도', '체리', '바나나', '사과'], true) },
      { label: 'key 지우기 (key가 바뀌어 다시 만듦)', expect: 'REMOVE·CREATE', html: list(['사과', '바나나', '체리', '포도'], false) },
      { label: 'key 없게 뒤집기', expect: 'TEXT', html: list(['포도', '체리', '바나나', '사과'], false) },
    ],
  },
];
