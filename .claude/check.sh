#!/usr/bin/env bash
# 🟩 특화: mini-react의 "통과/실패" 기준. 공통 게이트(Stop 훅, CI)는 이 파일의 종료 코드만 본다.
set -euo pipefail

if [ ! -f package.json ]; then
  echo "package.json이 아직 없어. npm init과 테스트 도구 설정부터 해." >&2
  exit 1
fi

# lock 파일이 있으면 그대로 설치(재현 가능), 없으면 일반 설치
if [ -f package-lock.json ]; then npm ci; else npm install; fi
npm test
