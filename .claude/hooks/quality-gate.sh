#!/usr/bin/env bash
# 🟦 공통 — Stop 훅 = 품질 게이트: Claude가 "다 했어요"라고 끝내려는 순간 실행된다.
# 무엇을 검사할지는 모른다. .claude/check.sh를 실행해서 0이면 통과, 아니면 막는다.
source "$(dirname "$0")/json-field.sh"

input=$(cat)
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# 이 브랜치에서 코드가 바뀌었는지 확인한다 (문서와 하네스 파일만 바뀐 경우는 검사하지 않음).
#  - git status: 커밋 안 한 수정 + 새로 만든(untracked) 파일
#  - merge-base..HEAD: 이미 커밋한 변경. 기준은 origin/main이 있으면 그것, 없으면 main
base_ref=main
git rev-parse --verify -q origin/main >/dev/null && base_ref=origin/main
base=$(git merge-base "$base_ref" HEAD 2>/dev/null)
changed=$( {
  git status --porcelain | cut -c4-
  [ -n "$base" ] && git diff --name-only "$base" HEAD
} 2>/dev/null | grep -Ev '(\.md$|^\.claude/|^\.github/|^\.git(ignore|attributes)$)' )
[ -z "$changed" ] && exit 0   # 질문만 한 세션 등은 검사하지 않음

if out=$(bash .claude/check.sh 2>&1); then
  exit 0
fi

# 게이트에 걸려 이미 한 번 이어서 작업했는데도 실패하면, 무한 반복을 막고 개발자에게 넘긴다.
# 조용히 통과시키지 않고 사용자 화면에 경고를 띄운다.
if [ "$(printf '%s' "$input" | json_field '.stop_hook_active')" = "true" ]; then
  echo '{"systemMessage": "⚠ 품질 게이트가 두 번 연속 실패했어. check.sh 결과를 직접 확인해 줘."}'
  exit 0
fi

echo "품질 게이트 실패: .claude/check.sh가 통과하지 않았어. 원인을 찾아 고친 뒤에 끝내." >&2
printf '%s\n' "$out" | tail -n 30 >&2
exit 2   # exit 2 = 종료를 막고, 실패 로그를 Claude에게 돌려줌
