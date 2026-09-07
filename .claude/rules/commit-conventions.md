---
paths:
  - "**/*"
---

# Commit & PR Conventions

## Commit Message Format

```
type(scope): description
```

- **Type**: `feat` / `fix` / `refactor` / `docs` / `chore` / `test`
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
