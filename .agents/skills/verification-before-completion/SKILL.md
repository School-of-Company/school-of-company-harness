---
name: verification-before-completion
description: Before claiming work is done, fixed, or passing — and before committing or opening a PR — run the command that proves it and read the output. Evidence before assertions. Use whenever about to report success, hand work back, or trust a subagent's "done".
allowed-tools: Bash, Read, Glob, Grep
---

# Verification Before Completion

**No completion claim without fresh verification evidence.** If you haven't run the proving command in
this turn, you cannot say it passes. Adapted from
[obra/superpowers `verification-before-completion`](https://github.com/obra/superpowers) (MIT).

## The Gate

Before saying anything that implies success — "done", "fixed", "passes", "should work now":

1. **Identify** the command that proves the claim.
2. **Run** it fresh and in full — not a cached result, not a narrower scope than the claim.
3. **Read** the whole output: exit code, failure count, warnings.
4. **Decide** whether the output confirms the claim. If not, report the real status with the output.
5. Only then make the claim, and show the evidence with it.

## What Counts as Evidence

| Claim                  | Needs                                                      | Not enough                          |
| ---------------------- | ---------------------------------------------------------- | ----------------------------------- |
| Tests pass             | The test command's output: 0 failures                      | An earlier run, "should pass"       |
| Linter clean           | The linter's output: 0 errors                              | A partial check, extrapolation      |
| Build succeeds         | The build command: exit 0                                  | The linter passing, readable logs   |
| Bug fixed              | The original symptom no longer reproduces                  | "I changed the code"                |
| Regression test works  | Red → green: it **fails** with the fix reverted, then passes | It passed once                      |
| Subagent finished      | `git diff` shows the change you expected                   | The agent reporting "success"       |
| Requirements met       | A line-by-line check against the request                   | Tests passing                       |

The project's own commands come from the repo (`package.json` scripts, `Makefile`, `gradlew`, CI config)
— look them up instead of assuming one. The `test` skill runs the suite.

## Stop Signs

Stop and run the check if you are about to:

- write "should", "probably", "seems to", or express satisfaction ("Done!", "Perfect!") before checking
- commit, push or open a PR on the strength of an earlier run
- accept a subagent's report without looking at what it changed
- skip the check because it is slow, or because you are confident

Confidence is not evidence, and a linter passing says nothing about whether the build does.

## When You Can't Verify

Some things can't be run here (a deploy, a UI, a service you have no access to). Say exactly what you did
check, what you did not, and what the user would need to run — never let "not checked" read as "passed".
