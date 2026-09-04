---
paths:
  - ".claude/**"
  - ".agents/**"
  - ".codex/**"
---

# Catalog Conventions

No manifest registration is needed. The path convention under `.claude/` and `.agents/`/`.codex/` itself
is the catalog metadata — commit a file to the right location and the web app picks it up on its next read.

## Adding a New Item

- **Claude skill**: `.claude/skills/<name>/SKILL.md`
- **Claude agent**: `.claude/agents/<name>.md`
- **Claude hook module**: `.claude/hooks/modules/<name>/preToolUse.sh` or `postToolUse.sh`
  - `exit 2` = block the tool call, `exit 0` = pass through
  - Hooks never work standalone — see "Catalog Item Dependency Rule" below

Every item is mirrored for Codex unless it's genuinely Claude-only:

- **Codex skill**: `.agents/skills/<name>/SKILL.md` — mirror of the Claude skill, adapted per the rules below
- **Codex agent**: `.codex/agents/<name>.toml` — see "Claude → Codex Agent Conversion" below
- **Codex hook module**: `.codex/hooks/modules/<name>/pre-tool-use.sh` or `post-tool-use.sh` (kebab-case
  filenames, unlike Claude's camelCase)

## Claude → Codex Skill Adaptation

Codex skills are not a byte-for-byte copy — apply these mechanical changes when mirroring:

- Replace `${CLAUDE_SKILL_DIR}` with the literal path (`.agents/skills/<name>/...`) — Codex doesn't expand
  that variable
- Drop frontmatter fields Codex doesn't support: `disable-model-invocation`
- Codex has no `AskUserQuestion` tool — replace "Use AskUserQuestion to ask..." with a plain "Ask the
  user..." instruction, and drop it from `allowed-tools`
- Keep our own conventions (commit/PR format, label count, etc.) identical between Claude and Codex
  versions — only adapt genuine platform incompatibilities, don't inherit unrelated wording drift from
  upstream sources

## Claude → Codex Agent Conversion

Claude and Codex use different agent formats — same intent, different header:

- Claude: `.claude/agents/<name>.md` — YAML frontmatter (`name`, `description` required; `tools`, `model`,
  `color` optional) + prompt body
- Codex: `.codex/agents/<name>.toml` — `name`, `description`, `developer_instructions` required
  - `developer_instructions` must be a TOML **literal string** (`'''…'''`) — backslashes in prompt text
    (e.g. grep patterns) collide with basic-string escaping
  - Claude's `tools:` allowlist has no 1:1 Codex equivalent → map read-only agents to
    `sandbox_mode = "read-only"`, editing agents to `"workspace-write"`
  - Omit Codex's `model` field (avoid invalid IDs) and use `model_reasoning_effort`
    (`low`/`medium`/`high`) to size the task instead

## Catalog Item Dependency Rule

Most checkboxes are independent, but **hook-related items are an exception**. Claude and Codex hooks are
fully independent systems — enabling one does not enable the other.

- Selecting any Claude hook module (`secret-guard`, `eslint`, `ktlint`, etc.) automatically pulls in
  `dispatcher` (`preToolUse.sh`/`postToolUse.sh`) and `settings.json`.
- Selecting any Codex hook module automatically pulls in `.codex/hooks/dispatcher/` and `.codex/hooks.json`.
- The web UI never shows `dispatcher`/`settings.json`/`hooks.json` as their own checkboxes — they're derived
  automatically from whichever hook modules are checked.
- `settings.json` (Claude) is never a plain file copy — it's **merged at PR-generation time**:
  1. If zero Claude hook modules are selected, no `settings.json`-related file is included in the PR.
  2. If one or more are selected:
     - Fetch the target repo's existing `.claude/settings.json` first (fall back to
       `.claude/templates/settings-base.json` if it doesn't have one)
     - Merge in the `hooks` key from `.claude/templates/settings-hooks.json`
     - Add the resulting `settings.json` plus the dispatcher scripts to the file list automatically
  - Always start from the target repo's existing file so we never clobber its custom settings (e.g. custom
    `permissions`).
  - `.codex/hooks.json` is a fixed dispatcher-wiring file (no per-project custom keys observed so far) — copy
    it as-is alongside `.codex/hooks/dispatcher/` when any Codex hook module is selected.

## PR Diff Scope

The PR's file changes must be **strictly limited to the selected items plus their auto-included
dependencies** (see "Catalog Item Dependency Rule") — nothing else in the target repo may be touched.

- Build the commit tree from the target repo's current base tree, adding/replacing only the blobs for
  selected paths. Never clone-and-overwrite the whole repo, and never delete or modify a file that wasn't
  explicitly selected (or a resolved dependency of one).
- `settings.json` is the one exception with special handling (merge, not replace) — see the dependency rule
  above. Every other selected item is a straight file/directory copy at its catalog path.
- If the target repo already has a file at that path with different content, it is fine to overwrite it —
  that's the update the user asked for. What's not fine is touching a path the user never selected.

## PR Title & Base Branch

- Title reuses the same bracket convention as our own repo's PRs: `[HARNESS] description` (fixed scope,
  since these PRs land on other repos and have nothing to do with our `web`/`server`/`catalog` scopes).
- No labels are attached to these PRs.
- The base branch is **not** auto-detected — `POST /pr` takes it as an explicit `baseBranch` field, set from
  the web UI (pre-fill it with the target repo's default branch as a convenience, but let the caller override
  it). There's no per-repo config file to read an override from anymore.
- Handling a second "Create PR" run against the same repo/selection (new branch vs. reusing an open PR) is
  left to the server implementation — not a fixed policy here.

## Error Handling

`POST /pr` does not defend against bad input — an uninstalled repo, an unknown `itemId`, etc. just throw.
No fallback, no partial success, no silent skip.

## PR Body Content

`POST /pr` must never open a PR with a generic "files synced" message — the body has to list exactly what
was included, grouped by category, so a reviewer can tell what changed without opening the diff:

```markdown
## 포함된 항목

### 스킬

- claude/skills/git-commit
- codex/skills/git-commit

### 에이전트

- claude/agents/doc-polisher

### 훅

- claude/hooks/eslint (`dispatcher`, `settings.json` 자동 포함)
```

- List the exact catalog item IDs the user checked (not the auto-included dependencies as if they were
  chosen) — dependency-pulled files (`dispatcher`, `settings.json`/`hooks.json`) get a `자동 포함` note next
  to the hook module that pulled them in, not their own bullet.
- Group headers are only the categories actually present in the PR (omit an empty "에이전트" section, etc.).
