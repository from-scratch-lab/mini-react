# mini-react

크래프톤 정글 13기 팀 프로젝트. JavaScript로 구현하는 미니 React (Virtual DOM, Diff, Hooks).

## 빌드와 테스트
- 의존성 설치: `npm ci`
- 전체 검사: `bash .claude/check.sh` (작업을 마치기 전에 반드시 통과해야 함. Stop 훅과 CI가 같은 파일을 실행함)
- 테스트만: `npm test`

## 디렉터리
- `src/vdom/`: `createElement`, 가상 노드 구조, 첫 `render`
- `src/diff/`: 이전·다음 가상 트리 비교(diff)와 실제 DOM 반영(patch)
- `src/hooks/`: `useState`, `useEffect`와 컴포넌트별 훅 저장소
- `tests/`: 기능 단위 테스트

## 도메인 규칙
- 실제 DOM은 `src/diff/`의 patch 단계에서만 바꾼다. 다른 곳에서 `document`를 직접 조작하지 않는다.
- 훅은 호출 순서로 자기 상태를 찾는다. 그래서 조건문·반복문 안에서 훅을 부르지 않는다.
- 컴포넌트 함수는 같은 props와 state면 같은 가상 트리를 돌려준다 (렌더 중 부수 효과 금지, 부수 효과는 `useEffect`).
- 자식 목록은 `key`가 있으면 `key`로, 없으면 위치로 비교한다.

## 팀 규칙
@.claude/team-rules.md
