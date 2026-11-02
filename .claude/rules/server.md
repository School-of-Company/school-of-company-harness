---
paths:
  - "server/**"
---

# Server Conventions

## No Authentication (Publicly Reachable)

`POST /pr`, `GET /repos`, `GET /catalog` have no auth check, and the API is exposed to the public
internet. Both halves of that are a deliberate decision, not an oversight — it's a small internal tool
and a login flow wasn't worth the complexity.

What that means concretely, so nobody has to re-derive it:

- Anyone who knows the URL can list every repo the GitHub App is installed on (**including private repo
  names**) and open a PR on any of them.
- The blast radius is bounded by the App's own permissions: it can create branches and PRs, not merge
  them or push to protected branches. A stranger's PR is noise, not damage.
- `CORS_ORIGIN` restricts which browser origin can call the API from JS, but does **not** stop a direct
  call (curl, Postman, etc.). Don't treat CORS as access control.
- If this ever needs real access control, that's a deliberate follow-up decision — don't bolt on partial
  auth (e.g. a hardcoded shared secret) without discussing it first.

## Bulk Update Is a CLI, Not an Endpoint

`update/` opens PRs on many repos at once, so it is deliberately **not** reachable over HTTP: it has no
controller and isn't imported by `AppModule` (its own root is `update/update-cli.module.ts`, started by
`update-cli.ts`). With no auth on the API, a "update every repo" endpoint would let anyone who knows the
URL fan PRs out across all installed repos — the single-repo `POST /pr` bounds that to one repo per call,
and a bulk route would remove the bound.

- Don't add a controller or schedule for it without settling access control first (see "No Authentication").
- It defaults to dry-run; `--apply` is what writes.
- "In use" is inferred from paths in the target repo, so a hand-written skill that happens to share a
  catalog name is treated as in use. The PR body says to check the diff, and review is the safeguard.

## Binding & Exposure

The server listens on all interfaces (`*:3001`), and the host it runs on sits behind NAT, so reachability
is decided entirely by the port forwarding in front of it — not by anything in this codebase. Don't add
a bind-address config option to "fix" access problems; check the forwarding first.
