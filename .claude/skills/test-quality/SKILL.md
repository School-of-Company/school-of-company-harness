---
name: test-quality
description: Judge whether tests actually catch bugs — find weak tests (mock-delegation checks, implementation-detail assertions, logic-free targets, duplicates), decide keep or delete, and check a test before calling it done. Use when reviewing or auditing a test suite, when a test looks like it only proves its mocks, or before finishing a test you just wrote. For writing tests from scratch use `write-test`; for test-first work use `tdd`.
allowed-tools: Bash, Read, Glob, Grep, Edit
---

# Test Quality

**Purpose:** stop tests that pass no matter how the production code breaks. The usual shape is a test
that mocks every collaborator and then checks that the mock was called — it proves the wiring of the
test, not the behaviour of the code.

The question for every test is the same: _what change to the production code would make this fail?_
If the honest answer is "none that matters", the test is weak.

## Step 1 — Learn the Project's Conventions

Detect them; don't assume. Tests in this catalog's target repos use different runners and layouts.

```bash
git ls-files | grep -iE '(test|spec)' | sed -E 's|.*/||; s|^[^.]*||' | sort | uniq -c | sort -rn | head
ls vitest.config* jest.config* gradlew pom.xml Cargo.toml pyproject.toml go.mod 2>/dev/null
node -e "console.log(require('./package.json').scripts)" 2>/dev/null
```

From that, settle three things before judging anything:

- **Tool** — the runner and its mocking API (`vi.fn`, `jest.fn`, MockK, Mockito, …)
- **Location** — how unit tests and integration tests are told apart. Often a suffix and its own config,
  e.g. `*.spec.ts` for unit and `*.integration-spec.ts` run by `vitest.config.integration.ts`
- **Command** — the script that runs each kind (`test`, `test:integration`, `./gradlew test`, …)

An integration test is what makes a unit test redundant (rule 4 below), so find both kinds first.

## Step 2 — Judge Each Test

A test is **weak** only when one of these clearly applies:

1. **Implementation details only.** It asserts mock call counts, internal call order, or the text of a
   generated query — not an outcome. Exception: when the call _is_ the observable behaviour (publishing
   an event or message, sending mail), asserting the call is correct.
2. **Everything mocked.** Every collaborator (repository, client, service) is a double, so the real logic
   can break and the test still passes. Typical: a controller test with the whole service mocked that only
   checks the arguments were forwarded; a service test that checks it returns what the mock repository gave.
3. **No logic under test.** Getters/setters, a field-for-field DTO copy, a scaffolded "should be defined".
4. **Duplicate.** Another test already verifies the same behaviour, usually at a higher level against the
   real dependency. Name the other test — a duplicate claim without the overlapping file is not a finding.

A test is **kept regardless** when any of these holds:

- It checks a core rule: authorization (guards), authentication, duplicate-submission prevention, data
  integrity, transactions
- It goes through a real database or a real HTTP request
- It checks input validation through the real validation pipe/validator
- It looks like a regression test for a past bug
- You are not sure

A single weak `it` inside an otherwise useful file is not a reason to drop the file. Weigh the file by its
strongest test.

For each weak verdict, write down the evidence (`file:line`) and one sentence on **how the production code
could break while the test still passes**. If you can't write that sentence, the verdict is keep.

Bad/good pairs for each rule are in `${CLAUDE_SKILL_DIR}/examples.md` — read it when a case is unclear,
not up front.

## Step 3 — Fix or Remove

- Weak by rule 1 or 2: rewrite it to assert an outcome through a real seam (the real collaborator, an
  in-memory fake, or the HTTP layer), or delete it if an integration test already covers the outcome
- Weak by rule 3: delete it
- Weak by rule 4: delete the weaker copy, and say in the commit which test still covers the behaviour
- Never delete a test without naming what covers its behaviour afterwards, or stating that nothing does

## Step 4 — Check Before Calling It Done

- [ ] **The name matches the assertion.** "rejects a duplicate submission" must fail when duplicates are
      accepted, not when a mock wasn't called
- [ ] **It fails on broken code.** Break the line under test and run it once. A test that still passes is
      not finished
- [ ] **No overlap.** Search for another test of the same class, method and scenario before adding one
- [ ] **Doubles only at the edges.** Only what is slow, external or nondeterministic is faked
- [ ] For a larger change, run mutation testing on the touched file if the project has a tool for it:
      `bash "${CLAUDE_SKILL_DIR}/scripts/run-mutation.sh" <path>`. It uses the project's own tool
      (Stryker, PIT, cargo-mutants) and exits non-zero naming the options when there is none — adding one
      is a dependency decision for the user, not this skill

## Don't

- Weaken an assertion to make a test pass (`toEqual` → `toBeDefined`, exact value → `any()`, removing the
  failing `expect`). A failing test is information; fix the code or the expectation it got wrong
- Delete or `skip` a failing test to get green
- Mock the class under test, or the logic the test is about
- Add `sleep`, retries or longer timeouts to hide a flaky test — find the race
- Assert on log output or private state when a public outcome exists
- Delete tests in bulk on pattern alone — every deletion carries its own evidence
