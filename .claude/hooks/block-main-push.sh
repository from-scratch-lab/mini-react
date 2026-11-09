#!/usr/bin/env bash
# 🟦 공통 — PreToolUse 훅: Bash 명령이 실행되기 직전에 main으로 가는 push를 막는다.
# 이 훅은 "실수 방지"용이다. 따옴표 쪼개기(ma'i'n) 같은 우회까지 막지는 못하므로,
# 진짜 보호는 GitHub의 main 브랜치 규칙(README의 체크리스트)이 맡는다.
source "$(dirname "$0")/json-field.sh"

input=$(cat)
cmd=$(printf '%s' "$input" | json_field '.tool_input.command')

block() {
  echo "main 브랜치로 가는 push는 막혀 있어. 작업 브랜치(feat/…, fix/…)를 만들어 push하고 PR을 열어." >&2
  exit 2   # exit 2 = 도구 실행을 막고, stderr를 Claude에게 전달
}

# push가 아닌 명령은 바로 통과
printf '%s' "$cmd" | grep -Eq '(^|[^[:alnum:]_-])git([[:space:]].*)?[[:space:]]push([[:space:]]|$)' || exit 0

# push 뒤의 인자만 본다. (git commit -m "fix main loop" && git push 처럼 앞쪽에 나온 main은 무시)
args=" ${cmd##*push}"

# 1) 대상 ref에 main이 단어로 등장: origin main, HEAD:main, +main, refs/heads/main
#    (feat/12-main-loop 같은 브랜치 이름은 걸리지 않도록 앞뒤 문자를 제한)
printf '%s' "$args" | grep -Eq '[[:space:]:+/]main([[:space:]]|$)' && block

# 2) 모든 브랜치를 한꺼번에 보내는 옵션
printf '%s' "$args" | grep -Eq '[[:space:]]--(all|mirror)([[:space:]]|$)' && block

# 3) 대상 없이 push하면 현재 브랜치로 간다: main에 체크아웃한 채 `git push`
branch=$(git -C "${CLAUDE_PROJECT_DIR:-.}" rev-parse --abbrev-ref HEAD 2>/dev/null)
[ "$branch" = "main" ] && block

exit 0
