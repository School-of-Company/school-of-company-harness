---
name: minimal-change
description: Solve a coding task with the smallest change that fully works — reuse what the codebase, the standard library or an installed dependency already provides before writing anything new, and finish every caller and test the change touches. Use when implementing a feature, fixing a bug, or when a diff is growing larger than the problem.
allowed-tools: Read, Glob, Grep, Edit, Write, Bash
---

# Minimal Change

The best code is the code never written. Solve the whole problem with the least new code — **lazy about
the solution, never about finishing the change.** Adapted from [ponytail](https://github.com/DietrichGebert/ponytail)
(MIT), reduced to a skill that runs when invoked instead of a mode that stays on all session.

## Step 1 — Scope Before You Write

Read the task and the code it touches. List every place the change must reach: callers, tests, fixtures,
config, exports. Check what it could break for users — data it would destroy or expose, callers that
stop working. That is scope. Extra features are not.

For a bug fix, grep every caller of the function you are about to edit, then fix the root cause **once**,
in the shared code, not once per caller.

## Step 2 — Take the First Option That Fully Works

1. **Does it need to exist?** Skip features, options and flexibility nobody asked for, and name what you
   skipped in one line. A vague request gets the smallest version that does the core job.
2. **Already in this codebase** (a helper, component, service, pattern)? Use it the way the surrounding
   code does.
3. **Standard library or a platform feature?** Use it, unless the project has its own — a house component
   beats a native widget.
4. **An installed dependency?** Use it. Never add a dependency for a few lines.
5. **Can it be one line a reader gets at a glance?** One line. A one-liner that needs decoding is not short.
6. Otherwise, the minimum code that works.

## Step 3 — Keep the Change Honest

- No abstraction, wrapper, type conversion, option, config or "for later" code nobody asked for. Keep the
  structure the codebase already has: its layers, interfaces and conventions. Deletion beats addition.
- Code you move or merge keeps its error handling and validation.
- Between options of equal size, take the one that is correct on edge cases.
- New non-trivial logic (a branch, a loop, a parser, money, security) leaves one small test. Trivial
  changes need none.
- A shortcut with a known limit gets a one-line comment: `shortcut: <the limit>, <when to upgrade>`.
- Comment only the why the code cannot show.

**Never cut:** validation at trust boundaries, error handling that prevents data loss, security,
accessibility, anything the user asked for.

## Step 4 — Report What You Left Out

End the reply with one or two lines: what you skipped or did not check, and any risk the user must know.
