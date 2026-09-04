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
- **Scope**: `web` / `server` / `catalog`
- **Description**: Korean, noun-ending, no period
- Subject line only (no body) — except for breaking changes, which get a `BREAKING CHANGE: <description>` body
- Never add an AI co-author
- One commit = one logical change

## PR Title Format

```
[SCOPE] description
```

- Scope uses the same vocabulary as commits, uppercase in brackets: `[WEB]`, `[SERVER]`, `[CATALOG]`
- Use `[GLOBAL]` for changes spanning multiple scopes
