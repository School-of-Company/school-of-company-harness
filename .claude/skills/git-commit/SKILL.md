---
name: git-commit
description: Create Git commits following this project's Conventional Commits style. Splits changes into logical units and writes concise Korean-description commit messages.
allowed-tools: Bash
---

## Step 0 — Read the Project's Own Rules First

If this repo states its own commit format, that wins over everything below. Read it before writing a
message:

```bash
ls CLAUDE.md AGENTS.md CONTRIBUTING.md 2>/dev/null
find .claude/rules -name "*.md" 2>/dev/null
```

Read whatever exists. Use the rules below only where the repo is silent.

## Step 1 — Find the Integration Branch

Don't assume `develop` or `main` — projects here use both. Ask the repo:

```bash
git branch --show-current
gh repo view --json defaultBranchRef -q .defaultBranchRef.name 2>/dev/null
git ls-remote --heads origin develop development dev | sed 's#.*refs/heads/##'
```

`BASE` is the integration branch if the remote has one, otherwise the default branch.

**If the current branch is `BASE`**, work doesn't get committed there — it arrives through a branch.
Create one first:

1. Analyze all changes with `git status` and `git diff`
2. Infer the name from the changes: `<type>/<kebab-case-description>`, using the same type as the
   planned commit — `feat/repo-select-dropdown`, `fix/base-branch-check`
3. `git checkout -b <type>/<inferred-name>`

**If the current branch is not `BASE`:** go straight to the commit flow.

## Step 2 — Learn the Project's Scope Vocabulary

The scope is this project's own domain vocabulary, not a fixed list. Read what the repo already uses:

```bash
git log --pretty=%s -200 | grep -oE '^[a-z]+\(([^)]+)\)' | sed -E 's/.*\((.*)\)/\1/' | sort | uniq -c | sort -rn
```

**If the history shows a vocabulary, reuse it verbatim** — matching the project beats a more accurate
word of your own, and a one-off scope makes the history unsearchable.

If it has none (new repo, or no convention yet), derive it from the paths you're touching:

| Layout          | Path                                    | Scope          |
| --------------- | --------------------------------------- | -------------- |
| Domain package  | `src/main/kotlin/.../domain/member/...`  | `member`       |
| Feature module  | `src/expo/form/...`, `modules/expo/...`  | `expo`         |
| Monorepo app    | `apps/web/...`, `packages/ui/...`        | `web`, `ui`    |
| Flat project    | `src/services/payment.ts`                | `payment`      |

Prefer the domain over the layer — `member` tells a reviewer more than `service` or `controller`. If the
change spans several scopes, use `global`; for build/CI-only changes, `ci`.

## Commit Message Rules

Format: `type(scope): description`

- **Type**: `feat` / `fix` / `refactor` / `docs` / `chore` / `test`
- **Scope**: from Step 2
- **Description**: 한글, 명사형 종결, 마침표 없음
  - Good: `레포 선택 드롭다운 구현`, `PR 생성 시 base branch 조회 실패 처리`
- Subject line only (no body) — breaking change일 때만 예외적으로 본문에 `BREAKING CHANGE: <설명>` 추가
- Do NOT add AI as co-author

## Commit Flow

1. Inspect changes: `git status`, `git diff`
2. Group changed files by logical unit of change:
   - Same feature or bug fix → one commit
   - Related files that must change together → one commit
   - Unrelated changes → separate commits
3. For each logical group:
   - Stage the relevant files: `git add <file1> <file2> ...`
   - Write a commit message: `type(scope): description`
   - `git commit -m "message"`
4. Verify with `git log --oneline -n <count>`

> **Rule**: One logical change = One commit. Files that must change together belong in the same commit.
> Unrelated changes must be split.
