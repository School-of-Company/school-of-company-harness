---
name: review-diff
description: Review the local diff for real defects — bugs, security holes, missing tests, performance traps. Not a style checker; formatters and linters own that. Run before opening a PR, or when asked to review uncommitted work.
allowed-tools: Bash(git *:*), Bash(grep *:*), Bash(ls *:*), Read, Glob, Grep
---

# Review the Local Diff

## Step 1 — See What Changed

```bash
git branch --show-current
git diff --stat                    # uncommitted
git diff --stat "origin/$BASE...HEAD"   # the whole branch, if reviewing before a PR
git diff
```

Read the changed files, not only the diff. A hunk that looks fine can be wrong because of what sits
above it — a missing `await` reads as correct until you see the caller.

## Step 2 — Learn This Project's Rules First

Generic review finds generic bugs. The findings that matter most are violations of rules this project
already wrote down, so read them before reviewing:

```bash
ls CLAUDE.md AGENTS.md CONTRIBUTING.md 2>/dev/null
find .claude/rules -name "*.md" 2>/dev/null
```

Turn each rule that makes a claim about code into something you can check in the diff (error contract,
layering, where config may be read, what must never be logged). A finding that cites the project's own
rule is actionable; "I would have written this differently" is not.

## Step 3 — Review

**Correctness**

- Async: a promise created but not awaited; an `await` inside a loop that should be concurrent; a
  rejection with no handler
- Errors: a failure path that returns success, an exception swallowed into a generic 500, a status code
  that contradicts the documented contract
- Boundaries: off-by-one, empty collection, `null`/`undefined`, the first and last iteration
- State: a value read before it is set, a mutation that outlives the request

**Security**

- Input that reaches a filesystem path, a URL path, a query, or a shell command without validation
- Secrets or tokens in source, in logs, or in an error message that reaches a client
- An endpoint that changed shape but not its authorization check
- Ownership: can changing an id in the request reach someone else's data?

**Tests**

- New behavior with no test, and failure paths with no test (the happy path alone is not coverage)
- A test that would pass even if the code were wrong. The classic: asserting "X wins over Y" with
  fixtures that don't collide — that proves union, not precedence
- A test that depends on another test having run first

**Performance** — only where it's real

- Blocking I/O on an async path
- A network or filesystem call inside a loop that could be batched
- A query added without an index behind it, or an N+1

## Step 4 — Report

```
[HIGH] path/to/file.ts:42 — what breaks, and when
[MED]  path/to/file.ts:88 — …
[LOW]  path/to/file.ts:13 — …

근거 없는 항목: <검증하지 못해 확인이 필요한 것>
누락된 테스트: 있음 / 없음
```

Three rules for the report:

- **Severity by consequence, not by ease of fixing.** HIGH is "this is wrong in production"; LOW is
  "this will bite someone later".
- **State what breaks.** "Handle the error" is not a finding; "a Vault timeout here returns 200 with an
  empty body, and the caller caches it" is.
- **Skip style.** Formatting, import order, and naming-by-preference belong to the formatter and linter.
  Repeating them here buries the findings that matter.

Say so plainly when the diff looks fine. A review that invents findings to look thorough trains people
to ignore reviews.
