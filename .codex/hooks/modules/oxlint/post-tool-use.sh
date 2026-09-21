#!/bin/bash
# oxlint를 쓰는 프로젝트에서 JS/TS 파일을 편집하면 그 파일만 lint --fix 한다.
#
# eslint 훅과 별개로 둔 이유: 두 도구는 설정도 실행 파일도 다르고, 한 프로젝트가 둘 다 쓰는 일은
# 드물다. eslint 훅은 eslint 설정이 없으면 조용히 빠지므로, oxlint만 쓰는 프로젝트에 eslint 훅을
# 깔면 아무 일도 일어나지 않는다(무동작이 "통과"처럼 보이는 상태). 실제로 쓰는 도구의 훅을 고르게
# 하려고 모듈을 나눠 둔다.
INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')

[[ "$TOOL_NAME" == "Edit" || "$TOOL_NAME" == "Write" || "$TOOL_NAME" == "write_file" ]] || exit 0

FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
[[ -n "$FILE_PATH" ]] || exit 0
[[ "$FILE_PATH" = /* ]] || FILE_PATH="$CWD/$FILE_PATH"

case "$FILE_PATH" in
    *.js|*.jsx|*.mjs|*.cjs|*.ts|*.tsx|*.mts|*.cts|*.vue|*.astro|*.svelte) ;;
    *) exit 0 ;;
esac

# oxlint를 쓰는 프로젝트인지 확인 — 설정 파일이거나 package.json에 선언되어 있어야 한다.
uses_oxlint() {
    local dir="$1"
    compgen -G "$dir/.oxlintrc*" > /dev/null 2>&1 && return 0
    compgen -G "$dir/oxlint.json" > /dev/null 2>&1 && return 0
    [[ -f "$dir/package.json" ]] && grep -q '"oxlint"' "$dir/package.json" && return 0
    return 1
}

# 모노레포에서는 편집한 파일 쪽 패키지가 기준이므로, 파일 위치부터 위로 올라가며 찾는다.
PROJECT_DIR=""
SEARCH_DIR=$(dirname "$FILE_PATH")
ROOT=$(git -C "$SEARCH_DIR" rev-parse --show-toplevel 2>/dev/null || echo "$CWD")
while [[ -n "$SEARCH_DIR" && "$SEARCH_DIR" != "/" ]]; do
    if uses_oxlint "$SEARCH_DIR"; then
        PROJECT_DIR="$SEARCH_DIR"
        break
    fi
    [[ "$SEARCH_DIR" == "$ROOT" ]] && break
    SEARCH_DIR=$(dirname "$SEARCH_DIR")
done

[[ -z "$PROJECT_DIR" ]] && exit 0

OXLINT="$PROJECT_DIR/node_modules/.bin/oxlint"
if [[ ! -x "$OXLINT" ]]; then
    OXLINT="$ROOT/node_modules/.bin/oxlint"
    [[ -x "$OXLINT" ]] || OXLINT=""
fi

echo "[Hook] Running oxlint --fix for $(basename "$FILE_PATH")" >&2
if [[ -n "$OXLINT" ]]; then
    OUTPUT=$(cd "$PROJECT_DIR" && "$OXLINT" --fix "$FILE_PATH" 2>&1)
else
    # 설치는 안 됐지만 선언은 되어 있는 경우 — 네트워크 설치는 하지 않는다(--no-install).
    OUTPUT=$(cd "$PROJECT_DIR" && npx --no-install oxlint --fix "$FILE_PATH" 2>&1) || {
        echo "[Hook] oxlint 실행 파일을 찾지 못해 건너뜁니다 (npm install 필요)" >&2
        exit 0
    }
fi

if [[ -n "$OUTPUT" ]]; then
    echo "$OUTPUT" | tail -20
else
    echo "[Hook] oxlint OK" >&2
fi
exit 0
