# school-of-company-harness

Pick the AI tool config a project needs, and send it there as a pull request.

Claude Code and Codex read their instructions from files in a repo — skills, agents, hooks. Keeping those
in sync across School-of-Company's repos by hand means copying directories around and forgetting which
project got what. This repo holds one catalog of those items and a small API that copies a chosen subset
into a target repo as a single PR.

**Dashboard:** [schoolofcompany.com/harness](https://www.schoolofcompany.com/harness) ·
**API:** `https://startup.https.gsmsv.site`

## How it works

1. **Install the GitHub App** on a repo. That is the whole registration step — no config file, no list to
   maintain. Installed repos show up in the dashboard, grouped by owner.
2. **Pick a repo.** The server reads its languages, build files, and `package.json` dependencies, and
   marks which catalog items fit. A Kotlin + Spring server gets `kotlin-spring-arch`; an Android app with
   no Spring does not. Warnings only — you can still select anything.
3. **Check what you want** (or use a preset) and click Create PR.
4. **A PR opens on that repo** containing only those files. Items the repo already has at the identical
   version are left out, so a second run shows just what changed.

Nothing is merged for you, and nothing is pushed to a protected branch. The PR is a normal PR.

## What's in the catalog

62 items, mirrored for both Claude Code and Codex:

| Kind       | Examples                                                                                                                                                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Skills** | `write-pr`, `git-commit`, `test`, `security-checklist`, `systematic-debugging`, `planning`, `resolve-reviews`, `api-design`, `docker`, `find-skill`, and per-stack architecture guides (`kotlin-spring-arch`, `java-spring-arch`, `nestjs-arch`) |
| **Agents** | `contradiction-finder`, `doc-polisher`, `prompt-polisher`, `web-researcher`, `frontend-convention-validator`, `kotlin-convention-validator`, `kotlin-test-fixer`                                                                                 |
| **Hooks**  | Formatters and linters that run on file edits (`ktlint`, `spotless`, `eslint`, `oxlint`, `prettier`, `ruff`, `ts-check`), test runners (`gradle-test`, `jest`), and guards (`secret-guard`, `command-guard`)                                     |

Items are written to work on any stack: a skill figures out the project's build tool and branch names at
runtime rather than assuming them. Hook modules are the exception by design — each one is named after its
tool and stays quiet in a project that doesn't use it.

Selecting a hook automatically brings its dispatcher and wiring (`settings.json` for Claude,
`hooks.json` for Codex). `settings.json` is **merged** into whatever the target repo already has, per
entry, so its own hooks and permissions survive.

## Adding to the catalog

Commit a file at the right path. There is no manifest to update.

```
.claude/skills/<name>/SKILL.md          Claude skill
.claude/agents/<name>.md                Claude agent
.claude/hooks/modules/<name>/postToolUse.sh   Claude hook module
.agents/skills/<name>/SKILL.md          Codex skill mirror
.codex/agents/<name>.toml               Codex agent
```

Source paths are deployment paths, so what you see here is what lands in the target repo. Conventions —
including how to adapt a Claude item for Codex, and what a new hook module must check — are in
[`.claude/rules/catalog.md`](.claude/rules/catalog.md).

Naming matters beyond tidiness: it is how the recommendation step knows where an item applies. Name a
hook module after its tool, and put a stack in a skill's name only when the skill truly requires it
(`kotlin-spring-arch` needs Kotlin _and_ Spring).

## API

| Endpoint                                                 | Purpose                                                                           |
| -------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `GET /repos`                                             | Repos the App is installed on, with default branch and installation id            |
| `GET /catalog`                                           | Catalog items (id, category, title, description, deploy path)                     |
| `GET /repos/:owner/:repo/recommendation?installationId=` | Detected stack, evidence, and a verdict per item                                  |
| `POST /pr`                                               | Create the PR. Body: `owner`, `repo`, `installationId`, `baseBranch`, `itemIds[]` |

Errors say what to do about them: a repo with no commits, a base branch that doesn't exist, or a
selection where everything is already up to date each come back with a message naming the fix.

> **No authentication, by design.** This is a small internal tool and the API is open. Anyone with the
> URL can list installed repos and open a PR on one. See
> [`.claude/rules/server.md`](.claude/rules/server.md) for what that does and doesn't expose.

## Development

```bash
cd server
cp .env.example .env    # GITHUB_APP_ID, GITHUB_PRIVATE_KEY_PATH, PORT, CORS_ORIGIN
npm ci
npm run start:dev       # port 3001
npm test
npm run lint
```

NestJS on Node 22, ESM throughout, vitest and oxlint instead of jest and eslint. The dashboard is a
separate repo (`School-of-Company/school-of-company-official`, route `/harness`) and reaches this API
through a same-origin proxy, so the site's CSP stays strict.

Deployment and VM details are in [CLAUDE.md](CLAUDE.md).
