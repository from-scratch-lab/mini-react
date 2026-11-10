# 과제 요구사항 체크리스트

기준: `dev` 2026-11-09 비판적 검토 반영 후 (테스트 396개 통과). 처음 작성은 6853949(237개).
상태: ✅ 충족 · 🟨 부분 · ❌ 미충족. 증거는 파일과 함수 이름, 테스트 이름(따옴표), 데모 위치로 댄다(줄 번호는 코드가 바뀌면 틀리므로 쓰지 않는다).

## Phase 1. Virtual DOM + Diff + Patch

| # | 완료 조건 | 상태 | 증거 |
|---|---|---|---|
| 1.1 | 브라우저 DOM을 읽어 Virtual DOM으로 바꾸는 함수 | ✅ | `src/vdom/domToVNode.js` `domToVNode`·`htmlToVNodes` · tests/vdom/domToVNode.test.js "요소·속성·텍스트를 가상 노드로 바꾼다" 외 |
| 1.2 | 두 Virtual DOM을 비교해 변경을 찾는 Diff | ✅ | `src/diff/diff.js` `diff`, `PatchType` 6종 · tests/diff/diff.test.js |
| 1.3 | 최소 변경을 찾는 5가지 핵심 케이스 | ✅ | CREATE·REMOVE·REPLACE·PROPS·TEXT (+ key MOVE) · "1. 새 자식이 생기면 CREATE" ~ "5. 텍스트가 바뀌면 TEXT" |
| 1.4 | 변경 부분만 실제 DOM에 반영(Patch) | ✅ | `src/diff/patch.js` `patch` · "MutationObserver로 세어도 실제 DOM 변경이 최소다", "key 재정렬은 기존 DOM 노드를 옮길 뿐 다시 만들지 않는다" |
| 1.5 | 검증 페이지에 실제 영역·테스트 영역 2개 | ✅ | `demo/phase1/index.html` `#actual`(실제), `#app`(테스트, `demo/phase1/app.js` `view`). 테스트 영역은 Virtual DOM을 HTML 코드로 그린 편집기다(속성·key·태그까지 고치기 위해서이며, 이유를 페이지와 README에 적었다) |
| 1.6 | Patch·뒤로가기·앞으로가기 버튼 | ✅ | `demo/phase1/app.js` `view`의 `data-action` back·patch·forward |
| 1.7 | 로드 시 실제 영역 HTML → VDOM → 테스트 영역 렌더 | ✅ | `demo/phase1/app.js` `startPhase1` · "로드하면 실제 영역의 HTML로 테스트 영역 코드를 채운다" |
| 1.8 | 테스트 영역 HTML을 자유롭게 수정 | ✅ | textarea 편집 · `demo/phase1/app.js` `onInput` |
| 1.9 | Patch: 테스트 영역 → 새 VDOM → diff → 바뀐 곳만 실제 영역 → History 저장 | ✅ | `demo/phase1/app.js` `onPatch`·`applyTo` · "Patch를 누르면 바뀐 부분만 실제 영역에 반영하고 기록에 저장한다" |
| 1.10 | 뒤로·앞으로 이동 시 실제·테스트 영역 함께 변경 | ✅ | `demo/phase1/app.js` `navigate`, `demo/phase1/history.js` · "뒤로가기·앞으로가기를 누르면 실제 영역과 테스트 영역이 함께 바뀐다", tests/demo/history.test.js |
| 1.11 | 다양한 태그·요소로 여러 변화를 확인 | ✅ | 샘플 h1·p·b·i·ul/li(key)·checkbox·svg + 프리셋 5종(표·폼·선택 상자·중첩 목록·key 재정렬, `demo/phase1/presets.js`) · "각 단계 버튼에 적힌 예상 패치 종류가 실제로 나온 패치 종류와 같다" |

## Phase 2. Component · State · Hooks

| # | 완료 조건 | 상태 | 증거 |
|---|---|---|---|
| 2.1 | 함수형 컴포넌트만 사용 | ✅ | `demo/phase2/app.js`, `demo/integrated/app.js` (클래스 컴포넌트 없음) |
| 2.2 | `FunctionComponent` 클래스: `hooks` 배열, `mount()`, `update()` | ✅ | `src/hooks/component.js` `FunctionComponent` · "hooks 배열을 가지고, mount()하면 처음 렌더링한다", "update()는 다시 렌더링하고 바뀐 부분만 patch한다" |
| 2.3 | 훅은 최상위(루트) 컴포넌트에서만 | ✅ | `src/hooks/hooks.js` `nextHook`의 자식 렌더 검사 · "자식 컴포넌트에서 훅을 부르면 오류 (상태는 루트 컴포넌트만 가진다)" |
| 2.4 | 자식은 props만 받는 순수 함수(Lifting State Up) | ✅ | `demo/phase2/app.js` `App`만 상태를 가짐 · tests/hooks/component.test.js "자식 컴포넌트 (상태 없는 순수 함수)" |
| 2.5 | State 변경 시 자동 재렌더 | ✅ | "setState는 상태를 바꾸고 화면을 자동으로 다시 그린다" |
| 2.6 | useState | ✅ | `src/hooks/hooks.js` `useState` · tests/hooks/useState.test.js |
| 2.7 | useEffect (deps, 정리 함수) | ✅ | `src/hooks/hooks.js` `useEffect` · tests/hooks/useEffect.test.js, failures.test.js |
| 2.8 | useMemo | ✅ | `src/hooks/hooks.js` `useMemo` · tests/hooks/useMemo.test.js |
| 2.9 | 핵심 질문 "함수는 매번 새로 실행되는데 상태는?" 답변 | ✅ | "렌더할 때마다 함수가 새로 실행되지만 hooks 배열에 상태가 남는다" · `demo/integrated/index.html` 기본 개념 6절 |

## Phase 1 ↔ 2 연계

| # | 완료 조건 | 상태 | 증거 |
|---|---|---|---|
| 3.1 | 상태 변경 재렌더에 Phase 1의 VDOM·diff·patch 재사용 | ✅ | `src/hooks/component.js` `update` → `src/vdom/render.js` `commitTree` → `diff`/`patch` |
| 3.2 | 전체가 아니라 필요한 부분만 갱신 | ✅ | "타이머가 한 칸 갈 때 실제 DOM 변경은 시간 텍스트 하나뿐이다", "점수 +1은 항목 점수와 합계(useMemo) 텍스트만 바꾼다" |
| 3.3 | 사용자 입력·클릭으로 화면이 바뀌는 웹 페이지 | ✅ | demo/phase2(학습 트래커), demo/integrated(렌더 파이프라인) · tests/demo/* |

## 기술 스택·제약

| # | 완료 조건 | 상태 | 증거 |
|---|---|---|---|
| 4.1 | Vanilla HTML/CSS/JS, 외부 프레임워크 금지 | ✅ | 런타임 의존성 0. 구현(`src/`)과 과제 데모 3종(phase1·phase2·integrated)·공용 도우미는 React·Vue를 불러오지 않는다 · tests/scripts/no-framework.test.js "구현과 과제 데모 3종은 React·Vue를 불러오지 않는다". **devDependencies에는 vitest·jsdom 외에 `react`·`react-dom` 18.3.1이 있다.** Part 2 LIS 실험(`demo/bench/lis.html`)에서 비교 기준선으로만 쓰며, 그 페이지에 "과제 구현물이 아니라 비교 실험용"이라고 적었다. 그 밖에 데모 페이지들이 jsdelivr에서 Pretendard 폰트 CSS를 읽는다(프레임워크 아님, 오프라인이면 기본 글꼴) |
| 4.2 | 실제 DOM 변경은 patch에서만 (CLAUDE.md 도메인 규칙) | ✅ | 구현(`src/`)과 과제 데모에서 `src/diff/patch.js` 밖 DOM 변경 없음. 예외: `src/vdom/domToVNode.js` `htmlToVNodes`의 `template.innerHTML`(문서 밖 파싱), 측정 하네스 `scripts/bench/scenarios.js`·`scripts/bench/lis-harness.js`의 측정용 컨테이너 붙이기·떼기, `demo/bench/lis.js`의 문서에 붙이지 않는 내려받기 링크 |

## 품질

| # | 완료 조건 | 상태 | 증거 |
|---|---|---|---|
| 5.1 | 모듈별 단위 테스트 (VDOM 변환, Diff, Patch, useState, useEffect, useMemo) | ✅ | tests/vdom, tests/diff, tests/hooks |
| 5.2 | 화면 동작 기능 테스트 | ✅ | tests/demo/ |
| 5.3 | 엣지 케이스 | ✅ | 고도화 중 고친 것: B1 다중 select 선택·B2 type 변경 시 value 잔존, B3 주석으로 갈린 텍스트, B6 빈 select의 마지막 option 선택, B7 선택 그룹 · 중복 key, vnode 재사용, 폼 상태, SVG, patch 실패 복구, effect 실패, 무한 렌더 감지 · HTML 표준 파서 구현(jsdom)과 대조하는 차등 fuzz(tests/diff/differential.test.js). 실제 Chrome에서 fuzz를 돌린 기록은 없다 |
| 5.4 | 포트폴리오 수준 완성도 | ✅ | README: Part 1(필수 기능 증명)·Part 2(LIS 차별화 연구), 트레이드오프 표, 실제 React와의 차이, 실행 방법 · `docs/final-report.md` |
| 5.5 | 다른 팀과의 차별점 | ✅ | Part 2 LIS 연구(`docs/perf/lis-experiment.md`): LIS·단방향 스캔·React 18.3.1을 같은 계수기로 측정. 공통 기반: `npm run bench`, CI 성능 예산, 핸들러 상자·일괄 삽입·자식 빠른 경로 |

## 중점 포인트 (문서·데모로 설명되어 있는가)

| # | 주제 | 상태 | 증거 |
|---|---|---|---|
| 6.1 | DOM을 다루는 방법 (Document, Window) | ✅ | `demo/integrated/index.html` 기본 개념 8절 · tests/demo/concepts.test.js |
| 6.2 | 실제 DOM 변화를 감지하는 브라우저 API | ✅ | 같은 페이지 9절 · tests/demo/concepts.test.js |
| 6.3 | 실제 DOM이 느린 이유 (Reflow/Repaint) | ✅ | 같은 페이지 2절. 수치: `demo/bench/`(브라우저, 레이아웃 시간 포함), docs/benchmarks.md "브라우저 벤치마크 페이지" |
| 6.4 | Virtual DOM의 구조와 필요한 이유 | ✅ | 같은 2절, `src/vdom/vnode.js` |
| 6.5 | Diff 동작 방식·5가지 케이스·실제 DOM 반영 | ✅ | 같은 페이지 3절, phase1 "이렇게 바꿔 보세요"(`demo/phase1/index.html`) |
| 6.6 | React에서 VDOM·Diff가 DOM을 바꾸는 방식 | ✅ | 같은 페이지 3·4·5절(재조정, lastPlacedIndex, 렌더/커밋, Fiber) |
| 6.7 | UI를 Component로 나누는 법 | ✅ | 같은 페이지 10절 · tests/demo/concepts.test.js |
| 6.8 | State를 어디에 두는가 | ✅ | 같은 페이지 11절 · tests/demo/concepts.test.js |
| 6.9 | setState가 상태 변경 외에 하는 일 | ✅ | `src/hooks/hooks.js` `useState` 주석, 같은 페이지 6·7절 |
| 6.10 | Batching | ✅ | 같은 페이지 7절, "여러 번 setState해도 한 번만 다시 렌더링한다 (배칭)" |
| 6.11 | 구현한 React와 실제 React의 차이 | ✅ | `docs/react-differences.md` (주제 18개 비교표, 말할 수 있는 것과 없는 것) · 데모 설명 카드 `demo/integrated/concepts.js` |

## 남은 위험 (비판적 검토에서 나온 것 중 이 문서 범위 밖)

| 항목 | 상태 |
|---|---|
| GitHub 기본 브랜치 `main`에 결과물이 없다 (`dev`에만 있음) | 사용자 결정 대기 |
| PR·리뷰 기록 없이 `dev`에 병합 (팀 규칙은 PR → 리뷰 → 병합) | 기록으로만 남김 |
