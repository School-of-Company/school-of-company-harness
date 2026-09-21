**한국어로 응답하고 작업해주세요 (Please respond and work in Korean).**

## Overview

Internal tool for distributing AI tool config (skills / agents / hooks) to School-of-Company repos.
A web dashboard lists every repo the GitHub App is installed on; you check the items you want and click
"Create PR", and a PR opens on that repo immediately.

There is no automatic sync, no scheduled job, no default group, and no database. Every distribution is a
manual selection followed by one API call. The server holds no state — the catalog is read from this
repo's own files on each request, and the repo list comes live from GitHub.

## Repository Layout

Most of this repo is hidden directories, because **the catalog's source paths are its deployment paths**:

```
.claude/            catalog — Claude Code items, and the rules for this repo
  rules/*.md        conventions, scoped by `paths:` frontmatter (imported below)
  skills/<name>/    SKILL.md (+ references/, scripts/)
  agents/<name>.md
  hooks/            preToolUse.sh + postToolUse.sh dispatchers
    modules/<name>/ one hook module per tool
  templates/        settings-base.json, settings-hooks.json → merged into the target's settings.json
.agents/skills/     catalog — Codex skill mirrors
.codex/             catalog — Codex agents (.toml) and hook modules (kebab-case filenames)
server/             NestJS API (this is the only code in the repo)
```

A file committed at the right path _is_ a catalog entry — there is no manifest to register it in. The
web UI lives in a different repo (`School-of-Company/school-of-company-official`, route `/harness`); it
only calls this server's API and never touches GitHub App credentials.

## How a PR Gets Made

1. Web calls `GET /repos` → every repo the App is installed on (App JWT → installation token → list)
2. Web calls `GET /catalog` → 62 items, scanned from the paths above
3. Web calls `GET /repos/:owner/:repo/recommendation` → which items fit that repo, with reasons
4. User checks items, clicks Create PR → `POST /pr`
5. Server collects the selected files, resolves hook dependencies, **drops files the target already has
   identical**, then builds one commit via the git data API (blob → tree on `base_tree` → commit → ref)
   and opens the PR

## Server Architecture

| Module                | Responsibility                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------- |
| `catalog/`            | Scan `.claude/`, `.agents/`, `.codex/` into `CatalogItem[]`. Path conventions only — no manifest    |
| `installation-token/` | GitHub App auth. Delegates token caching to `@octokit/auth-app` via `authStrategy`                  |
| `repos/`              | `GET /repos` — live list of installed repos                                                         |
| `recommendation/`     | Detect the target repo's stack and decide which items apply. Advisory only                          |
| `pr/`                 | `POST /pr` — file collection, hook dependencies, settings.json merge, change detection, PR creation |

Pure logic is split into its own files so it can be tested without network or filesystem:
`pr/settings-merge.ts`, `pr/tree-diff.ts`, `recommendation/stack-detection.ts`,
`recommendation/item-matching.ts`. Each has a `.spec.ts` beside it (28 tests).

Three behaviours are load-bearing and were each a bug once — don't simplify them away:

- **`settings.json` is merged per hook entry, never replaced.** Replacing the `hooks` key silently
  deleted hook entries the target repo had added itself (`pr/settings-merge.ts`).
- **Only files that actually differ are committed.** Otherwise a second run re-commits everything and the
  PR diff hides the real change (`pr/tree-diff.ts`). Hook scripts also need mode `100755`, or
  `settings.json` can't execute them.
- **Recommendations never block.** `POST /pr` does not consult them; the web shows them as warnings. The
  stack detection is inference and can be wrong, so the decision stays with the person.

## Rules

Detailed conventions live in `.claude/rules/*.md`, each scoped to the paths it applies to (see the
`paths:` frontmatter in each file). They're imported below so they're always in context, not just when
`resolve-reviews`/`doc-polisher` explicitly `find .claude/rules -name "*.md"`:

@.claude/rules/commit-conventions.md
@.claude/rules/catalog.md
@.claude/rules/server.md

**Never add an AI co-author or signature to any commit or PR** — also enforced via
`attribution: { commit: "", pr: "" }` in `.claude/settings.json`. Keep new conventions in
`.claude/rules/*.md` instead of inlining them here.

## Catalog Items Must Not Assume a Stack

Items land in other people's repos, so an item that hardcodes one stack is either useless or actively
misleading there. Two rules follow from that:

- A skill determines the project's language, build tool, and branch names **at runtime** instead of
  hardcoding them. A canned `--include="*.kt"` or `origin/develop` is a bug in this catalog.
- Item **names carry their requirements**, which is how `recommendation/` decides what applies without a
  metadata field to forget: a hook module is named after its tool (`ktlint`, `oxlint`), `*-guard` hooks
  are stack-agnostic, and a skill name's stack tokens are all required (`kotlin-spring-arch` needs both
  kotlin and spring). Everything else is treated as stack-neutral.

A linter hook exits 0 when its tool is absent, which is safe but hides the opposite case: a project using
`oxlint` with only the `eslint` module installed gets silence that reads like a passing lint. Add a module
per tool rather than widening an existing one.

## Commands

```bash
cd server
npm run build          # nest build
npm test               # vitest run
npm run lint           # oxlint src/ test/
npm run start:dev      # watch mode, port 3001
```

ESM project (`"type": "module"`, `moduleResolution: nodenext`): relative imports need the `.js`
extension, and there is no `__dirname` — use `import.meta.url`.

DTOs must be **classes** and must not be imported with `import type`. `ValidationPipe` and
`class-validator` need the runtime type; `import type` erases it and validation silently stops running.

## Deployment

The server runs on a school VM behind NAT, reachable at `https://startup.https.gsmsv.site` through a
reverse proxy the infra team operates.

```bash
ssh -p 21107 ubuntu@ssh.gsmsv.site
cd ~/harness && git pull && cd server && npm run build && sudo systemctl restart harness
systemctl status harness && journalctl -u harness -n 50
```

- `harness.service` (systemd, `Restart=always`, enabled) runs `node dist/main.js` on `*:3001`
- Config in `~/harness/server/.env`: `GITHUB_APP_ID` (4825250), `GITHUB_PRIVATE_KEY_PATH`, `PORT`,
  `CORS_ORIGIN`
- The private key is a file, not an env value — systemd's `EnvironmentFile` doesn't restore `\n`
  escapes, and GitHub hands out PKCS#1 while `@octokit/auth-app` wants PKCS#8 (converted in
  `installation-token/private-key.ts`)
- A catalog-only change needs `git pull` on the VM but no restart — items are read per request
- Health check: `GET /catalog` returning 62 items. There is no dedicated health endpoint.

**The API has no authentication, deliberately, and it is publicly reachable.** Anyone with the URL can
list every installed repo (including private repo _names_) and open a PR on one. The blast radius is
bounded by the App's permissions — branches and PRs, not merges. See `.claude/rules/server.md`.

## Unfinished Work

- **Wire the recommendation API into the web UI.** The endpoint is deployed but nothing calls it. The
  plan: on repo selection, auto-check recommended items, show the detected stack and evidence, and mark
  `not-applicable` items with a warning that does not prevent selecting them.
- **Generate presets from recommendations.** `school-of-company-official` currently hardcodes 7 presets as
  name arrays in `src/entities/harness/presets.ts`, so adding a catalog item means editing the web repo
  too.
- Hook items have no `description` in `GET /catalog` (hook modules are shell scripts with no frontmatter),
  so the web falls back to its own hardcoded Korean descriptions.
- Test PRs #13–#22 on `JoyCenter-Server-Jongyun` are still open.
- `Gwangju-talent-festival-Server-V2` PR #255 predates the `settings.json` merge fix — closing and
  regenerating it produces a correct diff.
