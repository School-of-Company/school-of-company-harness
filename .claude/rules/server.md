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

## Binding & Exposure

The server listens on all interfaces (`*:3001`), and the host it runs on sits behind NAT, so reachability
is decided entirely by the port forwarding in front of it — not by anything in this codebase. Don't add
a bind-address config option to "fix" access problems; check the forwarding first.
