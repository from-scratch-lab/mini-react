# Mini React · Phase 1 + Phase 2

Vanilla TypeScript + Vite로 구현한 Mini React 실험 페이지입니다. Phase 1의 DOM 편집·Diff·Patch 실험과 Phase 2의 함수형 컴포넌트·상태·Hooks 데모를 함께 제공합니다. UI 프레임워크나 Virtual DOM 라이브러리는 사용하지 않습니다.

## Phase 2 · Component, State, Hooks

왼쪽의 Phase 2 탭에서 카운터 증가·감소·초기화, 자동 증가 시작·중지, 이름 입력을 실행할 수 있습니다. Phase 1 탭에서는 왼쪽 HTML 편집기와 오른쪽 미리보기·실제 DOM을 나란히 확인할 수 있습니다. 탭을 이동해도 편집 내용과 이력, 카운터 상태는 유지됩니다.

Phase 2 카드 아래의 **렌더링 관찰**에서 `mount()`와 `update()`를 구분하고, 최근 상태 변경과 실행된 컴포넌트를 확인할 수 있습니다. `컴포넌트와 props`는 App이 자식에게 전달하는 값을, `Hook 상세`는 호출 순서에 따라 값이 저장되는 `hooks` 슬롯을 보여줍니다. `DOM 변경 목록`에서는 Phase 1의 Diff가 찾아낸 이전 VDOM 값과 Patch로 반영된 값을 비교할 수 있습니다. DOM 구조도는 상위 노드와 최근 Patch 대상까지 이어지는 경로를 그립니다. 변경 항목을 선택하면 구조도, 전체 DOM 트리, 데모의 해당 위치를 함께 강조합니다. 카운터가 0일 때 `초기화`를 눌러 렌더링이 생략되고 슬롯이 유지되는 경우도 확인해 보세요.

Phase 1에서 시작해 3초 안에 `Phase 1 → Phase 2 → Phase 1 → Phase 2 → Phase 1` 순서로 전환하면 숨겨진 `Phase2.1(이상형 월드컵)` 탭이 열립니다. 클릭과 키보드 탭 이동 모두 가능합니다. 왼쪽 탭 옆의 `×`를 누르면 탭이 다시 숨겨지고, 같은 순서로 전환하면 다시 열립니다. 탭의 열림 여부는 같은 브라우저 탭에서 새로고침해도 유지됩니다. 사진 4장으로 월드컵을 진행하고, 우승 화면의 `다시 시작`을 누르면 첫 대진으로 돌아갑니다.

| 파일 | 역할 |
| --- | --- |
| `src/core/element.ts` | `h()`로 요소/함수 컴포넌트 표현 생성, stateless 자식 실행, Phase 1 VTree 및 이벤트 바인딩 생성 |
| `src/core/component.ts` | `FunctionComponent`의 `hooks`, `mount()`, `update()`, `unmount()`와 `useState`, `useEffect`, `useMemo` |
| `src/components-demo.ts` | 루트 App과 props만 사용하는 Counter/Summary 데모 |
| `src/world-cup.ts` | 루트 상태와 props로 구성한 4강 이상형 월드컵 |
| `src/main.ts`, `src/phase-tabs.ts`, `src/style.css` | Phase 탭, 키보드 탐색, 데스크톱 작업공간 |
| `tests/components.test.ts` | 상태 보존, Hook 의존성·cleanup·제약, 이벤트, DOM 동일성 테스트 |
| `tests/browser/components.spec.ts`, `tests/browser/workspace.spec.ts` | 실제 클릭·입력·포커스 보존, 타이머 정리, 탭 전환과 데스크톱 배치 |

### 사용 예시

```ts
import { h } from './core/element';
import { FunctionComponent, useState, useEffect, useMemo } from './core/component';

function Counter({ value, onIncrease }: { value: number; onIncrease: () => void }) {
  return h('button', { onClick: onIncrease }, value);
}

function App() {
  const [count, setCount] = useState(0);
  const doubled = useMemo(() => count * 2, [count]);
  useEffect(() => {
    const timer = setInterval(() => setCount(previous => previous + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  return h('section', null,
    h(Counter, { value: count, onIncrease: () => setCount(previous => previous + 1) }),
    h('p', null, '두 배: ', doubled));
}

const root = new FunctionComponent(App, document.querySelector('#root')!, {});
root.mount(); // 비어 있는 전용 컨테이너에 처음 렌더링
// root.update(); // 필요하면 명시적으로 재렌더링
// root.unmount(); // Effect cleanup, 리스너 제거, 관리 DOM 제거
```

### 상태가 유지되는 원리와 렌더링 흐름

1. 루트를 감싼 `FunctionComponent` 인스턴스가 렌더링 사이에도 살아 있으며 `hooks` 배열을 보관합니다.
2. 매 렌더링 시작 시 Hook 인덱스를 0으로 되돌립니다. 호출 순서에 해당하는 슬롯에서 이전 상태·메모·Effect 정보를 읽습니다.
3. 루트 함수가 `h()` 표현을 반환하면 Hook 실행 컨텍스트를 닫고 자식 함수를 props로 실행합니다. 자식도 `h(Child, props)`로 선언합니다. 자식은 별도 상태나 인스턴스를 가지지 않습니다.
4. 표현을 기존 `VNode[]`로 변환합니다. 이벤트 함수는 별도 바인딩에 저장하여 Phase 1의 순수 데이터와 `structuredClone` 정책을 유지합니다.
5. 기존 **`diff(previousTree, nextTree)` → `patch(container, operations)`** 를 그대로 호출합니다. 최초 mount도 빈 트리와 비교합니다. 상태 갱신 시 `innerHTML`이나 전체 DOM 교체를 사용하지 않습니다.
6. 실제 노드에 이벤트를 연결하고, DOM 반영이 끝난 뒤 Effect를 실행합니다. 바뀐 핸들러와 삭제/교체된 노드의 리스너는 제거해 중복 등록과 오래된 상태 참조를 방지합니다.

### Hook 동작과 제약

- `useState(initial)`: 값 또는 지연 초기화 함수를 받습니다. setter는 새 값 또는 `previous => next`를 지원하고 같은 슬롯에서 동일한 함수로 유지됩니다. `Object.is`로 같은 상태는 재렌더링하지 않습니다. 객체·배열 상태는 새 참조로 교체해야 합니다. unmount 또는 이전 mount에서 보관한 setter는 무시합니다.
- `useEffect(effect, deps?)`: DOM commit 직후 동기 실행합니다. 의존성이 바뀌면 이전 cleanup 후 새 Effect를 실행하고, unmount에도 cleanup합니다. `[]`는 mount마다 한 번, 생략하면 매 commit 실행합니다. Effect 안의 상태 변경은 현재 Effect 실행이 끝난 뒤 다음 렌더링으로 처리합니다.
- `useMemo(factory, deps?)`: 의존성이 같으면 이전 결과를 반환합니다. `[]`는 mount마다 한 번 계산하고, 생략하면 매 렌더링 계산합니다. Effect/Memo 의존성은 길이 및 각 값의 `Object.is`로 비교하고 배열을 복사해 보관합니다.
- Hook은 루트 함수 실행 중에만 호출합니다. 조건문/반복문에 따라 Hook 호출 개수나 종류 순서를 바꾸면 오류입니다. 같은 종류 Hook끼리의 의미적 순서 변경은 검출할 수 없으므로 항상 고정된 순서로 호출해야 합니다. 자식·이벤트·Effect 안에서 Hook 호출, 렌더링 중 setter 호출도 오류입니다.
- 일반 setter는 동기 갱신하며 React의 비동기 스케줄러나 이벤트 배칭을 구현하지 않습니다. 무한 Effect 업데이트는 100회에서 오류로 중단합니다. JSX, keyed reconciliation, 자식 Hook, Fragment 컴포넌트, 오류 경계는 구현 범위에 포함하지 않습니다. 배열·빈 값·여러 루트 반환은 지원합니다.
- `h()`는 문자열/숫자 자식, 중첩 배열, `null`/`undefined`/boolean 자식 생략을 지원합니다. HTML 속성, `className`, `htmlFor`, boolean 및 `aria-*`/`data-*` 속성, input/textarea 값을 지원합니다. `onClick`, `onInput`, `onChange`는 각각 네이티브 DOM 이벤트이며 React의 합성 이벤트가 아닙니다. JSX식 style 객체나 이벤트 capture 옵션은 지원하지 않습니다.
- DOM 보존 범위는 Phase 1과 동일한 **인덱스 기반 비교**입니다. 같은 위치·타입·태그의 요소와 텍스트 노드는 유지하며, 키 기반 정렬/이동 최적화는 없습니다. 관리 컨테이너 내부를 외부 코드로 직접 변경하지 않아야 합니다.

### Phase 2 검증 (2026-11-07)

- `npm test`: **67개 통과** (기존 43개 + Phase 2 24개).
- `npm run build`: TypeScript 검사 및 Vite 프로덕션 빌드 성공.
- 브라우저 테스트: **12개 통과** (기존 9개 + Phase 2 3개). 프로젝트용 Chromium 미설치로 기본 명령의 브라우저 실행은 실패했으며, 임시 Playwright 설정에서 `channel: 'chrome'`으로 설치된 Google Chrome을 사용해 전체 테스트를 통과했습니다. 임시 설정은 검증 후 제거했습니다.
- DOM 객체·텍스트 노드·입력 포커스 보존, 최신 이벤트 핸들러, 타이머 중지/재시작, 390px 모바일 화면의 조작을 확인했습니다. Firefox/WebKit은 검증하지 않았습니다.

## 실행

Node.js 22.12 이상을 권장합니다. 이번 검증 환경은 Node.js 26.7 / npm 12.1 / macOS / Chromium입니다.

```sh
npm ci
npm run dev
# http://127.0.0.1:5173

npm test                  # jsdom 기반 핵심 모듈 단위 테스트
npm run test:e2e:install   # 최초 1회: 프로젝트 내부에 Chromium 설치
npm run test:e2e           # 로컬 서버 자동 실행 + 실제 Chromium 기능 테스트
npm run build             # TypeScript 검사 + dist 프로덕션 빌드
```

브라우저 명령은 macOS/Linux 셸 기준입니다. Windows에서는 `PLAYWRIGHT_BROWSERS_PATH=0` 환경변수를 설정하고 `npx playwright install chromium`, `npx playwright test`를 실행할 수 있습니다. E2E는 5173 포트의 기존 개발 서버가 있으면 재사용하며, CI에서는 별도 서버를 시작합니다. 브라우저/포트 실행 제한이 있는 환경에서는 해당 권한이 필요합니다. 브라우저를 내려받으려면 네트워크가 필요하며 앱 실행에는 외부 폰트나 서비스가 필요하지 않습니다.

## 파일 안내

| 파일 | 역할 |
| --- | --- |
| `src/core/vdom.ts` | VNode/VTree 데이터 타입, `domToVNode`, `readDOM`, `createDOM`, `renderPreview`, 입력 속성 동기화 |
| `src/core/diff.ts` | 순수 함수 `diff(previous, next)`와 경로 기반 변경 작업 타입 |
| `src/core/patch.ts` | `patch(container, operations)`에서만 확정 DOM 변경 |
| `src/history.ts` | 복제·동결한 스냅샷, 위치 이동, 분기 및 변경 없는 저장 방지 |
| `src/editor.ts` | 편집 HTML의 비활성 파싱·제외 정책, 현재 입력값을 표현하는 HTML 직렬화 |
| `src/main.ts` | 초기 로딩, 이벤트 연결, Patch/이력 이동 및 버튼·상태 표시 |
| `src/sample.ts`, `src/style.css` | 초기 HTML, 영역별 샘플 스타일, 페이지 레이아웃 |
| `tests/core.test.ts` | 변환·렌더링·Diff·Patch와 DOM 객체 동일성 검증 |
| `tests/editor.test.ts`, `tests/history.test.ts` | HTML 처리 및 불변 이력 검증 |
| `tests/browser/app.spec.ts` | 실제 브라우저에서 편집, 적용, 입력, 이력 통합 검증 |

`core`는 UI나 History를 가져오지 않습니다. Phase 2에서는 같은 `VTree`, `diff`, `patch`를 재사용할 수 있습니다.

## 핵심 설계

### 데이터와 관리 경계

`VTree`는 `VNode[]`입니다. 단일 루트 요소를 강제하지 않아 빈 콘텐츠와 여러 최상위 노드를 자연스럽게 처리합니다. 노드는 `element`, `text`, `comment`로 구분하며, DOM 참조를 갖지 않는 데이터만 저장합니다. 요소는 태그, 속성 맵, 순서 있는 자식을 가집니다. 공백 텍스트도 그대로 보존합니다.

실제 영역과 테스트 영역은 각각 별도의 **열린 Shadow Root**를 가집니다. 공통 샘플 스타일은 Shadow Root 안의 별도 `style`에 있고, 관리 컨테이너 `#content` 내부만 변환·Patch합니다. 호스트, 컨테이너, 스타일 요소는 이력에 포함되지 않고 유지됩니다. 편집 HTML의 ID, 클래스, 폼 이름과 CSS 탐색이 다른 영역이나 툴바에 영향을 주지 않습니다. 실제 영역은 `inert`로 직접 편집·조작을 막습니다. 링크 이동과 폼 제출은 테스트 영역에서도 취소합니다.

편집은 `parseEditorHTML`에서 HTML 문자열을 inert template으로 파싱해 테스트 DOM을 교체합니다. 확정 DOM의 초기 HTML 배치에만 `innerHTML`을 사용합니다. 이후 실제 영역은 `patch`의 `insertBefore`, `removeChild`, `replaceChild`, `nodeValue`, 속성·입력 프로퍼티 연산으로만 갱신합니다. 미리보기 전체 렌더링과 실제 DOM의 부분 Patch를 구분합니다.

### Diff와 순차 경로

작업의 `path: number[]`는 관리 컨테이너를 기준으로 한 **childNodes 인덱스**입니다. 공백과 주석도 인덱스를 차지합니다. 공통 인덱스의 노드를 먼저 재귀 비교하고, 남는 이전 자식은 뒤에서 앞으로 삭제한 뒤, 새 자식을 순서대로 삽입합니다. 따라서 하위 변경이 다른 형제의 경로를 밀어내지 않습니다. 작업 목록은 생성된 순서로 같은 이전 트리에 적용해야 합니다.

텍스트 변경은 기존 텍스트 노드의 `nodeValue`만, 속성 변경은 해당 속성만 수정합니다. 타입이나 태그가 다를 때만 해당 서브트리를 교체합니다. 같은 트리는 빈 작업 목록을 반환합니다. 입력 트리를 수정하지 않으며 삽입·교체 작업의 노드 데이터도 복제합니다.

비교는 **인덱스 기반**입니다. 중간 삽입이나 정렬 시 뒤쪽 인덱스의 노드 내용을 바꾸거나 교체할 수 있습니다. 키 기반 의미적 동일성, 노드 이동 최적화, 전역 최소 변경은 보장하지 않습니다. 동일한 인덱스·타입·태그를 유지하는 변경 없는 노드와 수정 대상의 무관한 자식은 기존 객체를 유지합니다.

### 입력값 정책

- `input`: 현재 `.value`를 스냅샷의 `value` 속성으로 정규화합니다. 현재 `.checked`가 참이면 `checked=""`, 거짓이면 속성을 제외합니다. 과거 defaultValue/defaultChecked와 현재 값이 다르면 **현재 값이 우선**하며, 이전 기본값을 따로 보존하지 않습니다. 생성·속성 Patch 후에는 `.value`와 `.checked`도 동기화해 dirty input에서도 동작합니다. 체크박스의 기본 value `on` 등 브라우저가 정규화한 값도 반영됩니다.
- `textarea`: 실제 자식 텍스트와 현재 `.value`를 **분리**합니다. VNode의 선택 필드 `value`에 현재 값을 저장하고, 별도 `value` 작업으로 현재 값만 바꿀 수 있습니다. 빈 textarea에 타이핑해도 존재하지 않는 자식 경로를 만들지 않습니다. 자식 변경 후 현재 값을 적용해 기본 텍스트와 dirty value의 차이를 보존합니다.
- HTML 편집기에 직렬화할 때 textarea의 현재 값을 텍스트로 표현합니다. 따라서 dirty textarea의 실제 `innerHTML`은 기본 텍스트를 유지하면서 화면과 편집기는 새 값을 보일 수 있습니다. 이 경우 문자열 일치만으로 현재 상태를 검증할 수 없으며 `.value`도 확인해야 합니다. 편집기 HTML을 다시 파싱하면 표시된 현재 값이 새 기본 텍스트가 됩니다.
- 테스트 미리보기의 input/change 이벤트는 편집기도 동기화하되 포커스가 있는 입력 노드를 다시 만들지 않습니다. Patch 시에는 편집 문자열 대신 **현재 미리보기 DOM을 읽어** 입력값을 확정합니다.
- input의 속성 Patch는 변경되지 않은 현재 value/checked를 유지합니다. type 변경처럼 브라우저가 입력 상태를 바꿀 수 있는 경우에도 Patch 전 현재 상태와 명시된 변경을 기준으로 동기화합니다. textarea 값이 줄바꿈으로 시작하면 HTML 파서가 첫 줄바꿈을 소비하는 동작을 보정해 편집기 왕복 시 값을 보존합니다.
- `select`/`option`은 HTML 속성과 자식 구조만 지원합니다. 사용자가 바꾼 현재 선택, input의 `indeterminate`, 파일 선택, 커서·포커스·스크롤 위치, DOM 이벤트 리스너는 스냅샷 대상이 아닙니다. 파일 input은 편집 파싱 시 text input으로 바꿉니다.

### 편집 HTML 지원 범위

표준 HTML의 일반적인 문서·표·리스트·링크·폼 요소를 지원합니다. 허용 태그 목록은 `editor.ts`의 `allowedTags`에 있습니다. HTML 파서가 잘못된 마크업을 자동 보정하며, 정규화된 결과를 사용합니다. 속성 순서·따옴표 형태 등 원본 소스 서식은 보장하지 않습니다.

주석은 보존합니다. SVG/MathML, script, style 태그, iframe, object/embed, template, 커스텀 요소 및 허용 목록 외 태그는 서브트리째 제외합니다. 인라인 이벤트 속성(`on*`), inline style, srcdoc, srcset, autofocus, is 속성을 제외합니다. URL 속성은 상대 경로 또는 http/https/mailto/tel 프로토콜만 허용하고 잘못된 URL과 javascript/data 등은 제거합니다. 제외 개수는 미리보기 갱신 시 상태 표시줄에 표시됩니다. 외부 이미지 URL은 브라우저가 로드할 수 있습니다.

이는 과제용 제한 파서 정책이며 범용 보안 sanitizer를 제공하는 라이브러리는 아닙니다. `core`의 렌더러는 HTML 입력을 정제하지 않으므로 앱 외부에서 재사용할 때에도 신뢰·검증된 VTree를 전달해야 합니다. 앱은 사용자 HTML을 반드시 편집 파서 경계에서 처리합니다. Shadow DOM은 스타일·탐색 격리 수단이며 보안 sandbox 자체는 아닙니다.

속성명은 환경 간 재생성이 가능한 범위로 제한합니다. 첫 글자는 유니코드 문자, `_`, `:`를 허용하고 이후에는 숫자·결합 문자·`.`·`-`·`·`도 허용하며 DOM API로 생성 가능한지 검사합니다. `@click`, `foo@bar`, `[title]` 같은 이름은 제외 개수에 포함합니다. 일부 Chrome 버전이 허용하더라도 jsdom 등에서 재생성할 때 실패하는 차이를 방지합니다.

### History

저장 시 `structuredClone`하고 모든 하위 데이터에 `Object.freeze`를 적용합니다. 이후 편집은 과거 스냅샷을 바꾸지 않습니다. `History.current`/`at`이 돌려주는 스냅샷은 수정하지 않고 읽기 전용으로 사용합니다.

이력 이동은 새 상태를 저장하지 않습니다. 이동 시 미확정 편집은 버리고, 실제 영역은 Diff·Patch, 테스트 미리보기는 렌더링, 편집기는 직렬화로 같은 선택 상태를 반영합니다. 스냅샷은 메모리에만 있으므로 새로고침하면 초기화됩니다. Patch 중 외부 코드가 실제 DOM을 임의로 변경하는 상황은 지원하지 않습니다.

## 실제 함수로 따라가는 실행 흐름

### 1. 초기 로딩

1. `main.ts`의 `createSurface`로 두 영역의 유지할 컨테이너를 만듭니다.
2. `actual.innerHTML = initialHTML`로 **실제 영역에 먼저** 샘플 HTML을 배치합니다.
3. `readDOM(actual)` → 각 자식의 `domToVNode` → 요소의 자식에 다시 `readDOM`을 호출해 `initialTree`를 만듭니다. 초기 VTree를 하드코딩하지 않습니다.
4. `renderPreview(preview, initialTree)`가 `createDOM`으로 새 DOM을 만들어 테스트 미리보기를 채웁니다.
5. `serializeTree(initialTree)`를 `editor.value`에 넣습니다.
6. `new History(initialTree)`로 복제·동결한 첫 스냅샷을 저장합니다. `updateControls`가 `1 / 1`과 비활성 이동 버튼을 표시합니다.

### 2. 문단 텍스트 하나를 바꾸고 Patch

1. HTML 편집기 input → `updatePreviewFromEditor` → `parseEditorHTML`이 **테스트 미리보기만** 바꿉니다.
2. Patch 클릭 → `applyDraft`. 편집 소스가 미리보기에 반영됐는지 확인한 뒤 `readDOM(preview)`로 다음 VTree를 만듭니다.
3. `diff(history.current, next)`가 같은 문단까지 재귀 탐색해 `{type: 'text', path, text}` 작업 하나를 반환합니다.
4. `patch(actual, operations)`가 경로의 **기존 텍스트 노드**에 `nodeValue`를 대입합니다. 문단 요소, 제목, 링크, 입력과 무관한 자식 노드 객체는 유지됩니다.
5. `history.commit(next)`가 새 스냅샷을 저장하고 `syncEditor`, `updateControls`, `report`가 표시를 갱신합니다. 완전히 같다면 작업은 0개, 저장은 false이며 이력도 유지됩니다.

### 3. 뒤로가기 후 새 상태 Patch

1. A → B → C에서 뒤로가기 → `navigateHistory(1)`이 `history.at(1)`로 B를 읽습니다.
2. `diff(C, B)` → `patch(actual, operations)` → `history.moveTo(1)` 순서로 실제 DOM과 위치를 바꿉니다. `renderPreview`와 `syncEditor`로 테스트 영역과 편집기도 B가 됩니다. 이때 이력 배열에는 C가 남습니다.
3. D로 편집하고 `applyDraft` → `diff(B, D)` → `patch`를 수행합니다.
4. `History.commit(D)`가 변경 여부를 먼저 검사하고, 변경이 있으면 `snapshots.slice(0, position + 1)`로 A·B만 남긴 뒤 D의 독립 스냅샷을 추가합니다. 결과는 A → B → D입니다.
5. B에서 변경 없이 Patch하면 `commit`이 slice 이전에 false를 반환하므로 C와 앞으로가기 가능 상태를 그대로 유지합니다.

## 검증

초기 구현에서 실행한 검증 결과:

- `npm test`: **31개 통과**. 텍스트·속성·자식 순서·공백·주석, 렌더링, 다섯 기본 Diff, 동일 트리, 동결 입력의 불변성, Patch 목표 일치, DOM 객체 동일성, MutationObserver 변경 0건, 빈/다중 루트, 깊은 중첩, 연속 삭제·중간 삽입·속성 삭제, live input/textarea, 빈 textarea, 이력 분기·스냅샷 보존, 편집 정책 검증.
- `npm run test:e2e`: **7개 통과**. 초기 화면, 편집 중 실제 영역 보존, 부분 Patch 객체 동일성, 이력 왕복과 미확정 편집 폐기, no-op 이후 미래 보존, 분기, 다중/빈 콘텐츠와 중첩 변경, live 입력 복원, 금지 콘텐츠와 ID 격리, DOM mutation 0건, 빈 textarea의 값 변경·노드 유지 검증.
- `npm run build`: TypeScript 검사 및 프로덕션 번들 생성 성공.
- 데스크톱 화면을 Chromium으로 캡처해 레이아웃을 확인했습니다. Firefox/WebKit 테스트는 실행하지 않았습니다.

환경상 최초 npm 다운로드는 DNS 제한, 기본 Playwright 캐시는 쓰기 제한, 개발 서버는 포트 실행 제한이 있었습니다. 필요한 실행 권한과 프로젝트 내부 브라우저 경로로 해결했습니다. 설치된 Headless Shell에서는 프레임/스크린샷 대기가 멈췄으므로 Playwright 설정에 `channel: 'chromium'`을 명시해 전체 Chromium의 headless 모드에서 실제 클릭·입력 테스트를 통과했습니다. 클릭을 강제하거나 객체 동일성 검증을 생략하지 않았습니다.

### 리뷰 수정 후 검증 (2026-11-06)

- `npm test`: **43개 통과**. 속성명 제외와 유니코드 속성 보존, textarea 선행 줄바꿈·특수문자·반복 직렬화, dirty input의 무관한 속성 및 value/checked/type 변경 회귀 테스트를 추가했습니다. 수정 전 새 테스트 중 10개가 실패하는 것을 확인했습니다.
- 브라우저 테스트: **9개 통과**. 잘못된 속성명을 포함한 편집의 Patch·이력 왕복, textarea 선행 줄바꿈 보존·DOM 객체 유지·변경 없는 재적용을 추가 검증했습니다. 프로젝트용 Chromium이 설치되지 않아 저장소 설정은 유지하고 임시 Playwright 설정의 `launchOptions.executablePath`로 설치된 Google Chrome을 실행했습니다. Firefox/WebKit은 검증하지 않았습니다.
- `npm run build`: TypeScript 검사 및 프로덕션 빌드 성공.
