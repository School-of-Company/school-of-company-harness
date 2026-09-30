---
paths:
  - "**/*"
---

# Commit & PR Conventions

## Commit Message Format

```
type(scope): description
```

- **Type**: `feat` / `fix` / `update` / `refactor` / `docs` / `chore` / `test` / `add`
  - `update`와 `add`는 문서가 아니라 히스토리에서 온 것이다 — 이 레포가 실제로 쓰고 있어서
    목록에 넣었다. 배포되는 스킬은 이 목록이 아니라 대상 레포의 히스토리를 읽는다
    (`.claude/shared/commit-conventions.md`)
- **Scope**: `server` / `catalog` (the dashboard UI lives in `School-of-Company/startup-official`, so it
  follows that repo's convention, not this one)
- **Description**: Korean, noun-ending, no period
- Subject line only (no body) — except for breaking changes, which get a `BREAKING CHANGE: <description>` body
- Never add an AI co-author
- One commit = one logical change

## PR Title Format

```
[scope] description
```

- Scope uses the same vocabulary as commits, lowercase in brackets: `[server]`, `[catalog]`
- Use `[global]` for changes spanning both scopes
