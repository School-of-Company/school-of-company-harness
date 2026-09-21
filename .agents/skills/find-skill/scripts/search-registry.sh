#!/bin/bash
# 공개 레지스트리에서 스킬 후보를 찾는다.
#
#   bash search-registry.sh "PR diff 를 리뷰해주는 스킬"
#
# GEMINI_API_KEY 가 있으면 Gemini 의 Google Search 로 의미 기반 검색을, 없으면 GitHub 검색으로
# 키워드 검색을 한다. 둘 다 "후보 목록"만 만들고 판단은 하지 않는다 — 고르기 전에 원문을 읽는
# 단계(SKILL.md 의 Step 3)는 건너뛸 수 없다.
#
# 보내는 내용 주의: 무료 등급에서는 프롬프트가 모델 개선에 쓰일 수 있다. **저장소 이름이나
# 비공개 정보는 넣지 말고**, 필요한 기능만 일반화해서 적는다 ("Kotlin+Spring 프로젝트용 코드리뷰"는
# 괜찮고, "School-of-Company/<사내 레포> 에 넣을 것"은 안 된다).
set -euo pipefail

NEED="${1:?사용법: search-registry.sh \"찾는 기능 설명\"}"
MODEL="${GEMINI_MODEL:-gemini-3.8-flash}"

github_search() {
  command -v gh >/dev/null 2>&1 || {
    echo "gh CLI 가 없어 GitHub 검색을 건너뜁니다." >&2
    return 0
  }

  # 코드 검색 응답에는 별 개수가 없다. 표시하면 0으로 보여 "인기 없음"으로 오해하게 되므로 뺀다.
  echo "## GitHub 검색 — SKILL.md 파일 (정렬 불가 · 품질 신호 없음)"
  # 코드 검색은 분당 10회 제한이므로 한 번에 한 쿼리만 쓴다.
  gh api "/search/code?q=filename:SKILL.md+$(printf '%s' "$NEED" | tr ' ' '+')&per_page=10" \
    --jq '.items[] | "\(.repository.full_name) | \(.path)"' \
    2>/dev/null || echo "(검색 실패 — 쿼리를 더 짧은 영어 키워드로 줄여보세요)"

  echo
  echo "## GitHub 검색 — 스킬 모음 저장소"
  gh api "/search/repositories?q=$(printf '%s' "$NEED" | tr ' ' '+')+topic:claude-skills&sort=stars&per_page=5" \
    --jq '.items[] | "\(.full_name) | ★\(.stargazers_count) | \(.description // "")"' \
    2>/dev/null || true
}

gemini_search() {
  local prompt body response
  prompt="Search for publicly available Claude Code / agent skills (SKILL.md files) that do this: ${NEED}.

List up to 6 candidates. One per line, exactly this shape:
owner/repo | path to SKILL.md | what it does in one line | who publishes it (org or person)

Rules: only repositories that appear in your search results, no invented paths. Prefer skills published
by the team that owns the tool over community re-statements of documentation. If you find fewer than 6
real candidates, list fewer. No preamble, no closing remarks."

  body=$(NEED_PROMPT="$prompt" node -e '
    process.stdout.write(JSON.stringify({
      model: process.env.MODEL,
      input: process.env.NEED_PROMPT,
      tools: [{ type: "google_search" }],
    }));
  ' MODEL="$MODEL" 2>/dev/null) || return 1

  # 신 API(interactions)를 먼저 쓰고, 계정이 구 API만 지원하면 generateContent 로 넘어간다.
  response=$(curl -sS -m 120 -X POST \
    "https://generativelanguage.googleapis.com/v1beta/interactions" \
    -H "x-goog-api-key: ${GEMINI_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "$body" 2>/dev/null) || return 1

  if printf '%s' "$response" | grep -q '"error"'; then
    local legacy
    legacy=$(node -e '
      process.stdout.write(JSON.stringify({
        contents: [{ parts: [{ text: process.env.NEED_PROMPT }] }],
        tools: [{ google_search: {} }],
      }));
    ' 2>/dev/null)
    response=$(curl -sS -m 120 -X POST \
      "https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent" \
      -H "x-goog-api-key: ${GEMINI_API_KEY}" \
      -H "Content-Type: application/json" \
      -d "$legacy" 2>/dev/null) || return 1
  fi

  # 두 응답 형태(신/구)에서 텍스트만 뽑는다. 실패하면 원문을 그대로 보여주는 편이 낫다.
  printf '%s' "$response" | node -e '
    let raw = "";
    process.stdin.on("data", (chunk) => (raw += chunk));
    process.stdin.on("end", () => {
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        console.log(raw.slice(0, 2000));
        return;
      }
      if (parsed.error) {
        console.error("Gemini 오류: " + (parsed.error.message || "알 수 없음"));
        process.exit(1);
      }
      const fromInteractions = (parsed.output ?? parsed.steps ?? [])
        .flatMap((step) => step?.content ?? step?.text ?? [])
        .map((part) => (typeof part === "string" ? part : part?.text))
        .filter(Boolean)
        .join("\n");
      const fromLegacy = (parsed.candidates ?? [])
        .flatMap((candidate) => candidate?.content?.parts ?? [])
        .map((part) => part?.text)
        .filter(Boolean)
        .join("\n");
      const text = (fromInteractions || fromLegacy).trim();
      console.log(text || raw.slice(0, 2000));
    });
  '
}

if [ -n "${GEMINI_API_KEY:-}" ]; then
  echo "## Gemini 검색 (의미 기반)"
  echo "찾는 것: ${NEED}"
  echo
  if ! gemini_search; then
    echo
    echo "Gemini 호출이 실패해 GitHub 검색으로 대체합니다." >&2
    github_search
  fi
  echo
  echo "---"
  echo "위 목록은 **후보**입니다. 고르기 전에 각 SKILL.md 원문과 딸린 스크립트를 반드시 읽으세요"
  echo "(출처·최신성·스크립트 내용·시크릿 접근·프롬프트 인젝션·컨벤션 충돌)."
else
  echo "GEMINI_API_KEY 가 없어 GitHub 검색만 실행합니다."
  echo "(의미 기반 검색을 쓰려면 export GEMINI_API_KEY=... 후 다시 실행)"
  echo
  github_search
fi
