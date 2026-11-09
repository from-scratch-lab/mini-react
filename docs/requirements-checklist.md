# 과제 요구사항 체크리스트

기준: `dev` feat/dx-concepts 병합 후 (테스트 23파일 279개 통과, 2026-11-09). 처음 작성은 6853949(237개). 총괄 세션(mr-lead)이 병합 때마다 갱신한다.
상태: ✅ 충족 · 🟨 부분 · ❌ 미충족. 증거는 `파일:줄`, 테스트 이름(따옴표), 데모 위치.

## Phase 1. Virtual DOM + Diff + Patch

| # | 완료 조건 | 상태 | 증거 |
|---|---|---|---|
| 1.1 | 브라우저 DOM을 읽어 Virtual DOM으로 바꾸는 함수 | ✅ | `src/vdom/domToVNode.js:47` `domToVNode`, `:55` `htmlToVNodes` · tests/vdom/domToVNode.test.js "요소·속성·텍스트를 가상 노드로 바꾼다" 외 15개 |
| 1.2 | 두 Virtual DOM을 비교해 변경을 찾는 Diff | ✅ | `src/diff/diff.js:34` `diff`, 패치 6종 `:14` · tests/diff/diff.test.js |
| 1.3 | 최소 변경을 찾는 5가지 핵심 케이스 | ✅ | CREATE·REMOVE·REPLACE·PROPS·TEXT (+ key MOVE) · "1. 새 자식이 생기면 CREATE" ~ "5. 텍스트가 바뀌면 TEXT" |
| 1.4 | 변경 부분만 실제 DOM에 반영(Patch) | ✅ | `src/diff/patch.js:30` · "MutationObserver로 세어도 실제 DOM 변경이 최소다", "key 재정렬은 기존 DOM 노드를 옮길 뿐 다시 만들지 않는다" |
| 1.5 | 검증 페이지에 실제 영역·테스트 영역 2개 | ✅ | `demo/phase1/index.html:27`(실제), `:62`(테스트, `app.js` 렌더) |
| 1.6 | Patch·뒤로가기·앞으로가기 버튼 | ✅ | `demo/phase1/app.js:132-139` |
| 1.7 | 로드 시 실제 영역 HTML → VDOM → 테스트 영역 렌더 | ✅ | `demo/phase1/app.js:29` · "로드하면 실제 영역의 HTML로 테스트 영역 코드를 채운다" |
| 1.8 | 테스트 영역 HTML을 자유롭게 수정 | ✅ | textarea 편집 · `demo/phase1/app.js:110` |
| 1.9 | Patch: 테스트 영역 → 새 VDOM → diff → 바뀐 곳만 실제 영역 → History 저장 | ✅ | `demo/phase1/app.js:78-86` · "Patch를 누르면 바뀐 부분만 실제 영역에 반영하고 기록에 저장한다" |
| 1.10 | 뒤로·앞으로 이동 시 실제·테스트 영역 함께 변경 | ✅ | `demo/phase1/app.js:89-98`, `history.js` · "뒤로가기·앞으로가기를 누르면 실제 영역과 테스트 영역이 함께 바뀐다", tests/demo/history.test.js |
| 1.11 | 다양한 태그·요소로 여러 변화를 확인 | 🟨 | 샘플은 h1·p·b·i·ul/li(key)·checkbox·svg (`demo/phase1/index.html:29-41`). table·select/option·form·중첩 목록 등 프리셋 시나리오는 없음 |

## Phase 2. Component · State · Hooks

| # | 완료 조건 | 상태 | 증거 |
|---|---|---|---|
| 2.1 | 함수형 컴포넌트만 사용 | ✅ | `demo/phase2/app.js`, `demo/integrated/app.js` (클래스 컴포넌트 없음) |
| 2.2 | `FunctionComponent` 클래스: `hooks` 배열, `mount()`, `update()` | ✅ | `src/hooks/component.js:33,39,55,90` · "hooks 배열을 가지고, mount()하면 처음 렌더링한다", "update()는 다시 렌더링하고 바뀐 부분만 patch한다" |
| 2.3 | 훅은 최상위(루트) 컴포넌트에서만 | ✅ | `src/hooks/hooks.js:14` · "자식 컴포넌트에서 훅을 부르면 오류 (상태는 루트 컴포넌트만 가진다)" |
| 2.4 | 자식은 props만 받는 순수 함수(Lifting State Up) | ✅ | `demo/phase2/app.js:15` · tests/hooks/component.test.js "자식 컴포넌트 (상태 없는 순수 함수)" |
| 2.5 | State 변경 시 자동 재렌더 | ✅ | "setState는 상태를 바꾸고 화면을 자동으로 다시 그린다" |
| 2.6 | useState | ✅ | `src/hooks/hooks.js:50` · tests/hooks/useState.test.js 10개 |
| 2.7 | useEffect (deps, 정리 함수) | ✅ | `src/hooks/hooks.js:77` · tests/hooks/useEffect.test.js, failures.test.js |
| 2.8 | useMemo | ✅ | `src/hooks/hooks.js:90` · tests/hooks/useMemo.test.js |
| 2.9 | 핵심 질문 "함수는 매번 새로 실행되는데 상태는?" 답변 | ✅ | "렌더할 때마다 함수가 새로 실행되지만 hooks 배열에 상태가 남는다" · `demo/integrated/index.html:142` 6절 |

## Phase 1 ↔ 2 연계

| # | 완료 조건 | 상태 | 증거 |
|---|---|---|---|
| 3.1 | 상태 변경 재렌더에 Phase 1의 VDOM·diff·patch 재사용 | ✅ | `src/hooks/component.js:217` `commit` → `src/vdom/render.js:43` `commitTree` → `diff`/`patch` |
| 3.2 | 전체가 아니라 필요한 부분만 갱신 | ✅ | "타이머가 한 칸 갈 때 실제 DOM 변경은 시간 텍스트 하나뿐이다", "점수 +1은 항목 점수와 합계(useMemo) 텍스트만 바꾼다" |
| 3.3 | 사용자 입력·클릭으로 화면이 바뀌는 웹 페이지 | ✅ | demo/phase2(학습 트래커), demo/integrated(렌더 파이프라인) · tests/demo/* |

## 기술 스택·제약

| # | 완료 조건 | 상태 | 증거 |
|---|---|---|---|
| 4.1 | Vanilla HTML/CSS/JS, 외부 프레임워크 금지 | ✅ | `package.json` 런타임 의존성 0, devDependencies는 vitest·jsdom뿐 |
| 4.2 | 실제 DOM 변경은 patch에서만 (CLAUDE.md 도메인 규칙) | ✅ | `src/`·`demo/`에서 patch.js 밖 DOM 변경 없음. 예외: `domToVNode.js:56` `template.innerHTML`은 문서 밖 template 파싱("문서(document)의 실제 트리는 바꾸지 않는다") |

## 품질

| # | 완료 조건 | 상태 | 증거 |
|---|---|---|---|
| 5.1 | 모듈별 단위 테스트 (VDOM 변환, Diff, Patch, useState, useEffect, useMemo) | ✅ | tests/vdom, tests/diff, tests/hooks |
| 5.2 | 화면 동작 기능 테스트 | ✅ | tests/demo/ 5파일 |
| 5.3 | 엣지 케이스 | ✅ | 고도화 중 고친 것: B1 다중 select 선택·B2 type 변경 시 value 잔존(`fix/dx-form-prop-order`), B3 주석으로 갈린 텍스트(`fix/dx-adjacent-text`) · 중복 key, vnode 재사용, select/option 순서, 폼 상태, SVG, patch 실패 복구, effect 실패, 무한 렌더 감지, fuzz("어떤 이전 트리에서 patch해도 결과 DOM은 새로 그린 다음 트리와 같다") |
| 5.4 | 포트폴리오 수준 완성도 | 🟨 | README에 특화 방향·구조도·로드맵·벤치마크 하이라이트 있음(9d9ea8c). 실제 React와의 차이 표와 최종 정리는 아직 |
| 5.5 | 다른 팀과의 차별점 | 🟨 | `npm run bench`(14 시나리오), tests/bench/budget.test.js(CI 성능 예산), React lastPlacedIndex와 이동 수 비교(swap 2 vs 997), docs/benchmarks.md. 최적화(핸들러 상자·일괄 삽입·자식 빠른 경로)와 차등 fuzz는 진행 중 |

## 중점 포인트 (문서·데모로 설명되어 있는가)

| # | 주제 | 상태 | 증거 / 빠진 것 |
|---|---|---|---|
| 6.1 | DOM을 다루는 방법 (Document, Window) | ✅ | `demo/integrated/index.html` 기본 개념 8절 · tests/demo/concepts.test.js |
| 6.2 | 실제 DOM 변화를 감지하는 브라우저 API | ✅ | `demo/integrated/index.html` 기본 개념 9절 · tests/demo/concepts.test.js |
| 6.3 | 실제 DOM이 느린 이유 (Reflow/Repaint) | ✅ | `demo/integrated/index.html:84` 2절. 수치는 docs/benchmarks.md(jsdom 기준; 브라우저 수치는 벤치 페이지 예정) |
| 6.4 | Virtual DOM의 구조와 필요한 이유 | ✅ | 같은 2절, `src/vdom/vnode.js` |
| 6.5 | Diff 동작 방식·5가지 케이스·실제 DOM 반영 | ✅ | `demo/integrated/index.html:97` 3절, phase1 "이렇게 바꿔 보세요"(`demo/phase1/index.html:44`) |
| 6.6 | React에서 VDOM·Diff가 DOM을 바꾸는 방식 | ✅ | 3·4·5절(재조정, lastPlacedIndex, 렌더/커밋, Fiber) |
| 6.7 | UI를 Component로 나누는 법 | ✅ | `demo/integrated/index.html` 기본 개념 10절 · tests/demo/concepts.test.js |
| 6.8 | State를 어디에 두는가 | ✅ | `demo/integrated/index.html` 기본 개념 11절 · tests/demo/concepts.test.js |
| 6.9 | setState가 상태 변경 외에 하는 일 | ✅ | `src/hooks/hooks.js:46` 주석, 6·7절 |
| 6.10 | Batching | ✅ | 7절, "여러 번 setState해도 한 번만 다시 렌더링한다 (배칭)" |
| 6.11 | 구현한 React와 실제 React의 차이 | 🟨 | 설명 카드마다 흩어져 있음(`demo/integrated/concepts.js`). 한곳에 모은 표(README/문서)가 없음 |

## 남은 일과 담당

| 우선순위 | 항목 | 담당 |
|---|---|---|
| ✅ | 5.5 벤치마크·성능 예산 (`feat/perf-bench`) | mr-perf |
| P1 | 5.5 최적화: 핸들러 상자 → 일괄 삽입 → 자식 빠른 경로 (ADR 0001 순서) | mr-perf |
| P1 | 5.3 브라우저 파서 대조 차등 fuzz | mr-dx |
| ✅ | 6.1·6.2·6.7·6.8 설명 보강 (`feat/dx-concepts`) | mr-dx |
| P2 | 1.11 phase1 프리셋 시나리오(table·form·select·중첩 목록·key 재정렬) | mr-dx |
| P2 | 6.11 실제 React와의 차이 표 | mr-dx 초안 → mr-lead가 README에 반영 |
| P3 | 5.4 README 포트폴리오 정리 | mr-lead (마지막) |
