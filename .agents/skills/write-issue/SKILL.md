---
name: write-issue
description: Turn follow-up work, review findings, deferred scope, or a reported bug into a GitHub issue. Picks the repo's own issue template, checks for duplicates, writes the title and body, and creates it after the user confirms.
allowed-tools: Bash(git *:*), Bash(gh issue *:*), Bash(gh label *:*), Bash(bash *create-issue.sh:*), Bash(cat *:*), Bash(ls *:*), Bash(rm ISSUE_BODY*.md:*), Read, Write
---

## Step 1 — Gather Context

Read what the repo already has before writing anything:

```bash
ls .github/ISSUE_TEMPLATE/ 2>/dev/null
cat .github/ISSUE_TEMPLATE/*.md 2>/dev/null
gh issue list --state all --limit 100 --search "<keywords>"
gh label list --limit 100
```

- **Check the current code before writing.** Drop work that is already done; when only part of it remains,
  narrow the issue to that part. Verify every path, key, class, and endpoint you are going to mention.
- **Look for a duplicate.** When a matching issue exists, report it to the user instead of creating
  another one.
- An issue holds work to do. Leave out routine checks (re-running a deploy, eyeballing a dashboard)
  unless the user asks for them.

## Step 2 — Choose the Template

Match the template to the kind of work, using the names and headings you just read:

| The issue is… | Look for a template like… |
|---|---|
| An observed malfunction with a way to reproduce it | `Bug`, `bug_report`, `버그` |
| Planned work, a follow-up, a decision to make | `ToDo`, `task`, `feature`, `작업` |

If the repo has issue forms (`*.yml`), use the form's field labels as the body's headings, in order — `gh`
cannot submit a form, but the reader still expects that shape. If it has no templates, use three
headings: what is happening now, what should change, and how we will know it is done.

Pick **exactly one** label by meaning from the repo's own list. If nothing fits, attach none — a wrong
label is worse than no label. Never create a label, and never use ones that people assign by judgment
(`help wanted`, `good first issue`, `duplicate`, `wontfix`, `blocked`).

## Step 3 — Title

Read the repo's recent issue titles first and match their shape. When they follow no pattern, use
`[scope] description`, taking the scope from `.agents/shared/commit-conventions.md` — it holds the
commands for reading the repo's existing scope vocabulary and the fallback for deriving one. It ships with
this skill, so it is always present.

- One scope, never several joined together. When the work spans domains, use the repo's `global`-like
  scope.
- The description says what changes or what goes wrong, in plain words a reader understands without
  knowing the code. Use identifiers only when there is no plain word for them.
- Max 50 characters, no emojis.

## Step 4 — Body

Keep the chosen template's headings and order. Replace every guidance line under a heading with real
content, leave out the template's frontmatter, and do not add or rename sections.

- Open with the current state as a fact, then why that is not enough.
- Write tasks as `- [ ]` actions, followed by a completion condition stated as the resulting state
  ("the duplicate notification is no longer sent"), not as another action.
- Put the source (the PR, the review comment, the removed document), open decisions as an options table, and
  related issues under the template's "other" heading. Write that there are none when there are none.
- Backtick paths, config keys, endpoints, commands, and identifiers.
- Assert only what you verified. Mark the rest "not verified yet" in the body.
- Leave out secrets and personal data — an issue is visible to everyone who can see the repo.
- Write in the language the repo's existing issues use; Korean when there are none.

## Step 5 — Preview and Confirm

Write each body to `ISSUE_BODY.md` (numbered when there are several), then show:

```
## 이슈 미리보기
- 템플릿: <template>
- 제목: [scope] description
- 라벨: <label or none>

[body]
```

With several issues, show a table of titles first, then each body. Ask the user to confirm before
creating — creating an issue publishes it, and it may be cached or indexed even if deleted later.

## Step 6 — Create

```bash
bash ".agents/skills/write-issue/scripts/create-issue.sh" "<confirmed-title>" "ISSUE_BODY.md" "<label>"
```

The script drops the label and creates the issue unlabeled when the repo does not define it. Never create
the missing label or swap in a different one.

Show each issue URL, and say in one line if a label was dropped. Then remove the `ISSUE_BODY*.md` files.
