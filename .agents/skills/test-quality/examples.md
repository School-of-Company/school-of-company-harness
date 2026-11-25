# Weak vs Strong — Examples

Read only the section for the rule you're unsure about. The examples come from a NestJS + vitest
project's real test audit; the shapes repeat in every stack (MockK/Mockito in Kotlin, mockall in Rust).

## Rule 2 — Everything mocked, only delegation checked

**Weak** — the whole service is a mock, so this passes even if the guard, the pipe or the service
logic is removed. It only proves the controller forwards its arguments:

```ts
beforeEach(() => {
  formService = { findOne: vi.fn(), update: vi.fn() };
  controller = new FormController(formService as unknown as FormService);
});

it('passes expoId and the query DTO to the service', async () => {
  await controller.findOne('expo-1', query);
  expect(formService.findOne).toHaveBeenCalledWith('expo-1', query);
});
```

**Strong** — a controller test earns its place by checking what the controller itself adds. Here, that
every route is protected:

```ts
it('protects the whole controller with the internal-token guard', () => {
  expect(new Reflector().get(GUARDS_METADATA, InternalFormController))
    .toEqual([InternalTokenGuard]);
});
```

Or go through HTTP (supertest / MockMvc / `testApplication`) so the guard, the pipe and the service all run.

## Rule 1 + 4 — SQL text on a mock, duplicated by a real-DB test

**Weak** — the database is faked, so the test asserts the _wording_ of the query. A query that is
wrong but contains the same substrings passes; a correct rewrite fails:

```ts
const sqls = manager.query.mock.calls.map(([sql]) => sql);
expect(sqls[0]).toContain('claimed_at IS NULL');
expect(sqls.some((sql) => sql.includes('FOR UPDATE'))).toBe(false);
```

**Strong** — the integration test already covers the same scenario against a real database, including
the concurrency the mock cannot show. With this in place, the mock version is a duplicate (rule 4):

```ts
it('confirms only once when the same token is confirmed concurrently', async () => {
  const token = await submit(survey.expoId);
  const responses = await Promise.all(
    Array.from({ length: 8 }, () => confirm(survey.expoId, token)),
  );
  expect(responses.every((r) => r.status === 200)).toBe(true);
  expect(new Set(responses.map((r) => r.body.claimedAt)).size).toBe(1);
});
```

## Mixed file — keep it

A file with one delegation-only `it` and one guard check is kept: the guard test is a core rule. Drop or
rewrite the weak `it` if you like, but the file stays.

## A test whose premise can't happen

**Weak** — the mock store returns `won: true`, and the test checks the service passes it through. The
real store never returns `won: true` in that situation, so the test describes a state that can't occur,
and its name suggests a guarantee nobody checks. Ask what the real collaborator returns before trusting
a mock's return value.

## Weakening to get green — don't

```diff
- expect(result).toEqual({ status: 'CLAIMED', claimedAt, alreadyClaimed: true });
+ expect(result).toBeDefined();
```

The test now passes on any return value. If the expectation was wrong, fix it to the right value; if the
code was wrong, fix the code.
