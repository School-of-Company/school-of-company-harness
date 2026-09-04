---
paths:
  - "server/**"
---

# Server Conventions

## No Authentication

`POST /pr`, `GET /repos`, `GET /catalog` have no auth check — this is a deliberate decision, not an
oversight. It's a small internal tool; adding a login flow wasn't worth the complexity.

- `CORS_ORIGIN` still restricts which browser origin can call the API (currently
  `School-of-Company/startup-official`'s domain) — this blocks random websites' JS from hitting it, but
  does **not** stop a direct call (curl, Postman, etc.). Don't treat CORS as real access control.
- If this ever needs real access control, that's a deliberate follow-up decision — don't bolt on partial
  auth (e.g. a hardcoded shared secret) without discussing it first.
