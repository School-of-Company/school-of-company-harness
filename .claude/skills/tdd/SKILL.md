---
name: tdd
description: Build a feature or fix a bug test-first — agree the seams to test, then red → green one slice at a time. Use when the user asks for TDD or red-green-refactor, or wants the test written before the code.
allowed-tools: Bash, Read, Glob, Grep, Write, Edit, AskUserQuestion
---

# Test-Driven Development

TDD is a red → green loop. This skill is what makes the loop produce tests worth keeping. For the
mechanics of a single test (runner, file naming, fixtures, doubles) use `write-test`; to run the suite
use `test`. Adapted from [mattpocock/skills `tdd`](https://github.com/mattpocock/skills) (MIT).

## Step 1 — Agree the Seams First

A **seam** is the public boundary you test at: the interface where behavior is observable without
reaching inside. Tests live at seams, never against internals — code can change entirely and the tests
shouldn't.

Before writing any test, name the seams under test and confirm them with the user, each with one line on
what it catches and what it misses. You can't test everything; agreeing the seams up front is how effort
lands on critical paths and complex logic instead of every edge case. No test is written at an
unconfirmed seam.

A good test reads like a specification — "user can check out with a valid cart" — and survives a
refactor because it doesn't care about internal structure.

## Step 2 — Red → Green, One Slice at a Time

1. **Red.** Write one failing test at a confirmed seam. Run it and watch it fail **for the right
   reason** — the missing behavior, not a typo or an import error.
2. **Green.** Write only enough code to pass it. Don't anticipate the next test or add speculative
   features.
3. Repeat. Each test is a *tracer bullet* that responds to what the last cycle taught you.

**Don't write all the tests first and then all the code.** Bulk tests verify imagined behavior: they
test the *shape* of things, go insensitive to real changes, and commit you to a structure before you
understand the implementation. One test → one implementation → next.

Refactoring is not part of the loop. Do it afterwards, with the tests green (`refactor-safely`).

## Anti-Patterns

- **Implementation-coupled** — mocks internal collaborators, tests private methods, or verifies through a
  side channel (querying the database instead of using the interface). The tell: the test breaks on a
  refactor although behavior hasn't changed.
- **Tautological** — the assertion recomputes the expected value the way the code does
  (`expect(add(a, b)).toBe(a + b)`), so it passes by construction and can never disagree with the code.
  Expected values come from an independent source: a literal, a worked example, the spec.
- **Horizontal slicing** — see Step 2.
