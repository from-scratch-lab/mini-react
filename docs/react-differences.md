# 구현한 mini-react와 실제 React의 차이

이 프로젝트는 React의 **원리**(가상 DOM → diff → 바뀐 곳만 DOM 반영, 훅으로 함수 컴포넌트에 상태 두기)를 직접 구현한 것이다.
React의 API를 흉내 낸 부분과 일부러 다르게 만든 부분, 아예 없는 부분을 한곳에 모은다. 설명 카드는 종합 데모(`demo/integrated/`)에 흩어져 있다.

## 한눈에

| 주제 | mini-react | 실제 React | 이유·근거 |
|---|---|---|---|
| 가상 노드 | `{ type, props, children, key }` + 실제 노드 참조 `dom`(열거 안 됨) | React Element(불변) + Fiber 노드(작업 단위, 부모·자식·형제 포인터) | 과제 범위: 트리 비교만 하면 되므로 Fiber 없이 재귀 |
| 렌더 단계 | 루트 컴포넌트 함수를 다시 실행해 **트리 전체**를 새로 만들고 한 번에 비교 (동기, 중단 없음) | Fiber 단위로 쪼개 중간에 양보·재시작 가능 (Concurrent, 우선순위, `startTransition`) | 단순함. 1,000행 비교가 jsdom 8ms 안팎이라 중단할 필요가 작다 |
| 커밋 단계 | `diff`가 패치 목록(6종: CREATE·REMOVE·REPLACE·PROPS·TEXT·MOVE)을 만들고 `patch`만 DOM을 바꾼다 | 렌더 단계에서 Fiber에 표시(Placement·Update·Deletion)하고 커밋 단계에서 반영 | 같은 생각(계산과 반영 분리). 여기서는 패치 목록을 화면에 보여 줄 수 있게 값으로 만든다 |
| 자식 목록 재정렬 | 앞뒤 공통 구간을 건너뛰고, 가운데만 **LIS(최장 증가 부분 수열)** 로 옮길 노드를 최소로 고른다 (Vue 3·Inferno 방식) | 한 방향으로 훑으며 `lastPlacedIndex`보다 앞에 있던 노드를 옮긴다 | 같은 key 순서에서 이동 수: swap 2 vs 997, 맨 뒤 → 맨 앞 1 vs 999 (React 쪽은 알고리즘대로 센 값, `scripts/bench/react-moves.js`) |
| key 중복 | 경고하고 그 목록 전체를 위치로 비교 | 경고하고 계속 (결과는 보장하지 않음) | 짝을 확정할 수 없으면 가장 예측 가능한 쪽(위치)으로 |
| 컴포넌트 단위 건너뛰기 | 없음. 매 렌더 트리 전체를 비교한다. 같은 가상 노드 **객체**를 같은 자리에 다시 쓰면 그 하위 트리만 건너뛴다 | `React.memo`·같은 element면 하위 컴포넌트 렌더를 건너뜀(bailout) | 자식 컴포넌트가 상태 없는 순수 함수라 인스턴스가 없다. memo는 ADR 0001의 조건부 항목(측정 근거 없음 → 보류) |
| 상태를 가진 컴포넌트 | **루트 하나만** 훅을 쓸 수 있다. 자식은 props만 받는 순수 함수(Lifting State Up) | 모든 함수 컴포넌트가 훅을 쓸 수 있다 | 과제 요구사항. 자식에서 훅을 부르면 오류 |
| 제공하는 훅 | `useState`·`useEffect`·`useMemo` | 그 밖에 `useReducer`·`useRef`·`useContext`·`useLayoutEffect`·`useCallback`·`useTransition` 등 | 과제 범위 |
| setState | 함수형 업데이트 지원. 값을 **바로 계산**해 저장하고 같은 값(`Object.is`)이면 건너뜀. 렌더 중 호출은 오류 | 업데이트를 큐에 쌓았다가 렌더 때 차례로 계산 | 단순함. 결과는 같은 경우가 대부분이다 |
| 배칭 | 같은 마이크로태스크 안의 여러 setState를 렌더 한 번으로 묶음(`queueMicrotask`) | React 18: 이벤트·타이머·Promise 어디서든 자동 배칭, `flushSync`로 즉시 | 같은 효과. 테스트용 `flushUpdates()` 제공 |
| useEffect 시점 | patch 직후 **동기**로 실행 (React의 `useLayoutEffect` 시점에 가깝다). 다시 실행할 effect의 정리를 모두 먼저 부르고 effect 실행 | 화면을 그린 뒤 비동기로 실행 | 테스트에서 결과를 바로 확인하기 쉽다 |
| 무한 갱신 | 양보 없이 이어진 렌더가 50번을 넘으면 멈추고 알림 | "Maximum update depth exceeded" (중첩 갱신 50번) | 같은 기준 |
| 이벤트 | 요소마다 `addEventListener`. 렌더마다 새 함수여도 리스너는 그대로 두고 핸들러 표만 바꾼다(핸들러 상자) | 루트 하나에서 받아 나눠 주는 위임 + 합성 이벤트 | 위임 없이도 "핸들러 교체 = DOM 변경 0"을 얻는다 (`docs/perf/handler-box.md`) |
| 대량 삽입·삭제 | 이어진 CREATE는 DocumentFragment 한 번, 자식 전체 삭제는 한 번에 비움 (DOM 변경 기록 1,000 → 1) | 렌더 단계에서 떨어진 하위 트리를 만들어 두고 커밋 때 붙임 | `docs/perf/batch-insert.md`. 브라우저 시간 이득은 작다(레이아웃 비용이 그대로) |
| 폼 상태 | `value`·`checked`·`selected`를 속성이 아니라 프로퍼티로 넣고, 선택 그룹(하나만 고르는 select, 같은 name radio)은 patch 끝에 속성대로 다시 맞춤 | 제어 컴포넌트(controlled)를 권장, 렌더마다 값을 맞춤 | B1·B2·B6·B7은 브라우저 파서와 대조하는 fuzz가 찾았다 |
| 이미 있는 HTML 이어받기 | `domToVNode(el, { attach: true })`로 실제 DOM을 읽어 그대로 이어받음 (Phase 1) | `hydrateRoot`(서버 렌더 HTML) | 비슷한 생각. 불일치 검사는 없다 |
| 실패 처리 | patch가 중간에 실패하면 실제 DOM을 다시 읽어 직전 화면으로 되돌림. effect 오류는 `onError`로 | Error Boundary로 하위 트리를 대체 화면으로 | 과제 범위에서 "화면과 기억한 트리가 어긋나지 않게"를 우선 |
| 개발 도구 | 데모 페이지(패치 목록, DOM 변경 수 깜빡임, 렌더 타임라인), `npm run bench`·`npm run fuzz` | React DevTools, StrictMode, Profiler | |

## 이 프로젝트가 숫자로 말할 수 있는 것과 없는 것

- **말할 수 있다**: 같은 key 순서에서 옮기는 횟수는 이론 최소(LIS)이고, React의 `lastPlacedIndex` 규칙보다 적을 수 있다(1번 ↔ N−2번 교환에서 2 vs 997).
  React 쪽 수는 React 18.3.1을 같은 DOM 계수기로 실제로 돌려 잰 값이다([LIS 실험](perf/lis-experiment.md), 크기 6개·패턴 4개에서 단방향 스캔과 같은 값). 인접한 두 항목 교환은 두 방식 모두 1개만 옮긴다.
- **말할 수 있다**: 갱신 시나리오에서 패치 수 = 실제 DOM을 바꾸는 일의 수다(같은 데이터 다시 렌더 = 패치 0, DOM 변경 0). CI 성능 예산이 이를 지킨다.
- **말할 수 있다**: HTML 표준 파서 구현(jsdom)을 정답으로 둔 차등 fuzz에서 CI 시드 불일치 0, 긴 실행(시드 1·3·5·99·2026, 각 4,000 patch) 불일치 0.
- **말할 수 없다**: "React보다 빠르다". LIS 실험에서 React 18.3.1을 같은 조건으로 쟀지만 결과는 조건마다 엇갈렸고(작은 목록·덩어리 이동은 React가 빠름, N=5,000 셔플은 느림), React는 Fiber·스케줄러·위임 이벤트 등 이 프로젝트에 없는 일을 하므로 차이의 원인을 가를 수 없다. 시간은 DOM 조작까지의 JS 시간이며 레이아웃·페인트는 재지 않았다.
- **말할 수 없다**: 핸들러 상자·일괄 삽입의 시간 이득. 측정값이 흔들림 안이거나(핸들러 상자) 브라우저에서 거의 차이가 없다(일괄 삽입: 넣기 36.5 → 36.2ms). 이득은 DOM 변경 수다.
