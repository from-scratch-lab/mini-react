# Mini-Ract
크래프톤 정글 13기 · Virtual DOM, Diff, Hooks를 직접 구현한 미니 React

## 데모 실행
- `npm run serve` → http://127.0.0.1:5173/demo/ (이 컴퓨터에서만 열리고 `demo/`·`src/`만 내보낸다)
- Phase 1: Virtual DOM + Diff + Patch 검증 페이지 (`demo/phase1/`)
- Phase 2: Component · State · Hooks로 만든 학습 트래커 (`demo/phase2/`). 렌더마다 패치 목록과 `hooks` 배열을 옆 패널에 보여 준다.

## 개발 환경
- Node `^20.19.0 || >=22.12.0` (CI는 Node 20)
- 설치: `npm ci` / 테스트: `npm test`
- 의존성을 추가하거나 바꿀 때(lock 파일이 바뀌는 설치)는 `npx npm@11 install <패키지>`로 한다.
  npm 10.9.x의 `npm install`은 vitest@4의 선택적 peer 의존성을 계산하다가 `Cannot read properties of null (reading 'edgesOut')`로 실패한다.
  `npm ci`는 npm 10에서도 정상 동작한다.
