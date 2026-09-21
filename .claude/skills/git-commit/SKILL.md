---
name: git-commit
description: Create Git commits following this project's Conventional Commits style. Splits changes into logical units and writes concise Korean-description commit messages.
allowed-tools: Bash
---

## Step 1 — Read the Conventions

Read `.claude/shared/commit-conventions.md` in full before writing any message. It holds the message
format, how to choose the scope from what the repo already uses, and the rule that the target repo's own
`CLAUDE.md` wins over all of it. It ships with this skill, so it is always present.

## Step 2 — Find the Integration Branch

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
