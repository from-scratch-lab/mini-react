# mini-react

크래프톤 정글 13기 팀 프로젝트. JavaScript로 구현하는 미니 React (Virtual DOM, Diff, Hooks).

## 빌드와 테스트
- 의존성 설치: `npm ci`
- 전체 검사: `bash .claude/check.sh` (작업을 마치기 전에 반드시 통과해야 함. Stop 훅과 CI가 같은 파일을 실행함)
- 테스트만: `npm test`
- 데모 서버: `npm run serve` (127.0.0.1:5173, 미리보기는 `.claude/launch.json`의 `demo`)

## 디렉터리
- `src/vdom/`: `createElement`, 가상 노드 구조, 첫 `render`
- `src/diff/`: 이전·다음 가상 트리 비교(diff)와 실제 DOM 반영(patch)
- `src/hooks/`: `FunctionComponent`(컴포넌트별 훅 저장소, mount·update), `useState`, `useEffect`, `useMemo`
- `tests/`: 기능 단위 테스트 (`tests/demo/`는 데모 페이지 기능 테스트)
- `demo/`: 브라우저 데모 페이지 (`demo/phase1/`: Virtual DOM·Diff·Patch 검증 페이지, `demo/phase2/`: 훅으로 만든 학습 트래커, `demo/integrated/`: 두 Phase를 잇는 렌더 파이프라인, `demo/shared/`: 공용 도우미). 화면도 `render`·`mountComponent`로 그린다.
- `scripts/serve.js`: 데모용 정적 서버 (의존성 없음)

## 도메인 규칙
- 실제 DOM은 `src/diff/`의 patch 단계에서만 바꾼다. 다른 곳에서 `document`를 직접 조작하지 않는다.
- 훅은 호출 순서로 자기 상태를 찾는다. 그래서 조건문·반복문 안에서 훅을 부르지 않는다.
- 컴포넌트 함수는 같은 props와 state면 같은 가상 트리를 돌려준다 (렌더 중 부수 효과 금지, 부수 효과는 `useEffect`).
- 자식 목록은 `key`가 있으면 `key`로, 없으면 위치로 비교한다.

## 팀 규칙
@.claude/team-rules.md
