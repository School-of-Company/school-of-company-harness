#!/bin/bash
set -e

TITLE="${1:?Error: issue title is required. Usage: create-issue.sh <title> <body-file> [label]}"
BODY_FILE="${2:?Error: Body file is required. Usage: create-issue.sh <title> <body-file> [label]}"
LABEL="${3:-}"

if [ ! -f "$BODY_FILE" ]; then
  echo "ERROR: Body file not found: $BODY_FILE" >&2
  exit 1
fi

ARGS=(gh issue create --title "$TITLE" --body-file "$BODY_FILE")

# Label — only pass one this repo actually defines. `gh issue create` fails outright on an unknown label,
# which would throw away a finished title and body over a naming difference between repos.
APPLIED=""
if [ -n "$LABEL" ]; then
  EXISTING=$(gh label list --limit 200 --json name -q '.[].name' 2>/dev/null || true)
  trimmed=$(echo "$LABEL" | xargs)
  if [ -n "$trimmed" ]; then
    if printf '%s\n' "$EXISTING" | grep -Fxq "$trimmed"; then
      ARGS+=(--label "$trimmed")
      APPLIED="$trimmed"
    else
      echo "  (label '$trimmed' not defined in this repo — skipped)" >&2
    fi
  fi
fi

echo "Creating issue..."
echo "  Title : $TITLE"
[ -n "$APPLIED" ] && echo "  Label : $APPLIED"
echo ""

"${ARGS[@]}"
