import { startPhase2 } from './app.js';

function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return undefined; // 저장소가 막힌 환경에서는 저장 없이 동작한다
  }
}

startPhase2({
  root: document.getElementById('app'),
  log: document.getElementById('inspector'),
  storage: browserStorage(),
});
