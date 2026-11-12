# 고도화 최종 보고 (2026-11-09)

기준: 시작 `dev` 5cbca8b (테스트 237개) → 끝 `dev` (테스트 396개, 비판적 검토 반영 후). 계획: [ADR 0001](decisions/0001-plan.md), 마무리 결정: [ADR 0002](decisions/0002-conditional-items.md).

## 바꾼 것

| 단계 | 브랜치 | 내용 |
|---|---|---|
| 0 | `feat/lead-proposal` | 요구사항 체크리스트, 제안서 3개, ADR 0001 |
| 1 | `fix/dx-form-prop-order` | B1 다중 select 선택 오류, B2 input type 변경 시 value 잔존 |
| 1 | `feat/perf-bench`, `feat/perf-bench-reuse` | `npm run bench`(14 시나리오), CI 성능 예산(패치·기록·붙임+뗌·새 노드), React식 이동 수 비교 |
| 2 | `fix/dx-adjacent-text` | B3 주석으로 갈린 텍스트 때문에 고치지 않은 Patch가 DOM을 바꾸던 문제 |
| 2 | `feat/dx-concepts` | 종합 데모 8~11절: Document·Window, DOM 변화 감지, 컴포넌트 나누기, State 위치 |
| 3 | `feat/dx-differential-fuzz` | HTML 표준 파서 구현(jsdom)을 정답으로 삼는 차등 fuzz, `npm run fuzz` |
| 4 | `feat/perf-handler-box` | 핸들러 교체를 패치 대신 핸들러 표로: 같은 데이터 다시 렌더 패치 2000 → 0 |
| 5 | `feat/batch-insert` | 이어진 CREATE를 fragment 한 번, 자식 전체 삭제를 한 번에: 기록 1000 → 1, B6 |
| 5 | `fix/form-groups` | B7 선택 그룹(단일 선택 select, 같은 name radio)을 patch 끝에 속성대로 다시 맞춤 |
| 6 | `feat/children-fastpath` | 자식 목록 앞뒤 공통 구간 건너뛰기: 같은 데이터 diff 11.3 → 8.4ms, 패치 목록 동일 |
| 7 | `feat/phase1-presets`, `feat/bench-page` | Phase 1 프리셋 5종, 브라우저 벤치마크 페이지(레이아웃 시간 포함) |
| 8 | `docs/react-differences` | 실제 React와의 차이 비교표 |
| 9 | `docs/adr-0002` | 조건부 최적화는 측정 근거가 약해 하지 않음 |
| 10 | `docs/readme-portfolio`, `docs/readme-visuals` | README 포트폴리오 정리, 그래프(`scripts/readme-charts.js` → `docs/images/`) |
| Part 2 | `feat/lis-experiment` | LIS 차별화 연구: `reconcileMode`(lis / lastPlacedIndex), keyed fuzz, DOM 계수기, 브라우저 실험 페이지, React 18.3.1 기준선, [보고서](perf/lis-experiment.md) |
| README | `docs/readme-two-part` | Part 1(필수 기능 증명) + Part 2(LIS 연구) 구조, 슬라이드형 이미지 7장, 트레이드오프 표 |
| 검토 | `fix/critical-review` | 비판적 검토의 중요 지적 반영: React devDependency 사실 기재와 미사용 검사 테스트, 시간 주장 낮춤(diff 비용 검출 못 함, 레이아웃 제외 명시), fuzz 정답지를 jsdom으로 정정, 테스트 영역 설명, 문서 갱신 |

## 검사 결과

- `bash .claude/check.sh` 통과: 테스트 396개, 실패 0.
- 성능 예산(결정적, CI): 모든 시나리오가 상한 이하. 상한은 최적화마다 측정값으로 낮췄다.
- 차등 fuzz(정답지: HTML 표준 파서 구현 jsdom): CI 시드(7·20261109·1·재사용 31) 불일치 0. 긴 실행 시드 1·3·5·99·2026(각 4,000 patch) 불일치 0. 실제 Chrome에서는 돌리지 않았다.
- LIS 두 모드: keyed 1,000쌍 + 일반 트리 1,000쌍에서 최종 DOM·key 순서·노드 정체성 문제 0.
- 자식 비교 빠른 경로: 이전 코드 사본과 무작위·편집 트리 40,000쌍의 패치 목록 대조 불일치 0.
- 브라우저 확인(Chromium): Phase 1 프리셋, 벤치마크 페이지(결정적 지표가 jsdom과 같음, 375px에서 가로 넘침 없음), 콘솔 오류 없음.
- 런타임 의존성 0. devDependencies에 `react`·`react-dom` 18.3.1이 있지만 LIS 실험의 비교 기준선 전용이며, 구현·과제 데모가 React를 불러오지 않는지 테스트로 검사한다. 실제 DOM 변경은 `src/diff/patch.js`에서만(측정용 컨테이너 붙이기·떼기는 `scripts/bench`).

## 남은 한계

- 시간 이득은 주장하지 않는다: 핸들러 상자는 측정 흔들림 안, 일괄 삽입은 브라우저에서 넣기 36.5 → 36.2ms. 이득은 DOM 변경 수다.
- "React보다 빠르다"고 말하지 않는다. LIS 실험에서 React 18.3.1을 같은 조건으로 쟀지만 조건마다 결과가 엇갈렸고, 구현 전체가 달라 원인을 가를 수 없다. React가 실제로 옮긴 노드 수는 단방향 스캔과 같았다.
- LIS 실험의 시간은 DOM 조작까지의 JS 시간이다(레이아웃·페인트 제외). LIS의 diff 쪽 추가 비용은 측정 잡음(약 ±10%)보다 작아 검출하지 못했다. 측정은 한 기계·한 브라우저에서 한 번 했다.
- value·selected 없는 단일 선택 select의 맨 앞에 option을 넣거나 옮기면 이전 자동 선택이 남는다(처음부터 그린 화면과 다름, React와 같음).
- Phase 1에서 텍스트 뒤에 요소가 있는 주석(`a<!---->b<b>x</b>`)은 로드 정규화 때 그 요소를 다시 만든다(화면 결과는 같음).
- 잘못 중첩된 HTML(B5)은 직렬화 왕복에서 원래대로 돌아오지 않는다(HTML 파서의 규칙).
- 2단계 이후 mr-lead가 이어받은 작업(일괄 삽입 리뷰 반영, B7 마무리, 6~10단계) 중 7단계 벤치마크 페이지부터는 reviewer 리뷰 없이 병합했다.
- GitHub 기본 브랜치 `main`에는 결과물이 없다(모두 `dev`). PR·리뷰 기록 없이 `dev`에 병합했다.
