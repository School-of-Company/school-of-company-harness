**한국어로 응답하고 작업해주세요 (Please respond and work in Korean).**

## Overview

Internal tool for selectively distributing AI tool skills/agents/hooks/config to School-of-Company
projects. On the web dashboard, pick a registered repo (one with the GitHub App installed), check the
items you want, and click "Create PR" — a PR is opened on that repo immediately. There is no automatic
sync or default group concept; every distribution is a manual selection followed by an immediate run.

## Rules

Detailed conventions live in `.claude/rules/*.md`, each scoped to the paths it applies to (see the
`paths:` frontmatter in each file). They're imported below so they're always in context, not just when
`resolve-reviews`/`doc-polisher` explicitly `find .claude/rules -name "*.md"`:

@.claude/rules/commit-conventions.md
@.claude/rules/catalog.md

**Never add an AI co-author or signature to any commit or PR** — also enforced via
`attribution: { commit: "", pr: "" }` in `.claude/settings.json`. Keep new conventions in
`.claude/rules/*.md` instead of inlining them here.

## Key Files

- `.claude/`, `.agents/`, `.codex/` — catalog source. Paths map 1:1 to the target repo's deployment paths
  (no `catalog/` wrapper)
- `.claude/templates/settings-base.json` / `settings-hooks.json` — pieces merged into the final `settings.json`
- `server/` — GitHub App auth (installation tokens) + PR generation logic
- The checkbox UI itself lives outside this repo, in `School-of-Company/startup-official` — it only calls
  this repo's `server` API and never touches GitHub App credentials directly
