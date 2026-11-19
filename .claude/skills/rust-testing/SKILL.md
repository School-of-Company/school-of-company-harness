---
name: rust-testing
description: Write and run Rust tests — unit tests in a test module, integration tests in `tests/`, doc tests, async tests, table-driven and property tests, and what to fake. Use when adding or fixing tests in a Rust crate, or running cargo test, clippy and coverage.
allowed-tools: Bash, Read, Glob, Grep, Edit, Write
---

# Rust Testing

Language-neutral practice lives in `write-test` (what deserves a test, what to fake) and `tdd` (test-first);
this is the Rust-specific layer: where tests go, the idioms, and the commands. Condensed from
[affaan-m/ECC `rust-testing`](https://github.com/affaan-m/ECC) (MIT).

## Step 1 — Match the Crate

```bash
cat Cargo.toml                      # dev-dependencies: tokio, rstest, proptest, mockall … already chosen?
ls tests/ 2>/dev/null; grep -rl '#\[cfg(test)\]' src | head
```

Use the test crates the project already depends on. Don't add `proptest`, `mockall` or `rstest` to a crate
that has none unless the test truly needs it — a plain `#[test]` and a hand-written fake cover most cases.

## Step 2 — Put the Test in the Right Place

| Kind        | Where                                              | Sees                    |
| ----------- | -------------------------------------------------- | ----------------------- |
| Unit        | `#[cfg(test)] mod tests` at the bottom of the file | private items too       |
| Integration | `tests/<name>.rs`                                  | the public API only     |
| Doc         | ` ``` ` blocks in `///` comments                   | what a user would write |

Test behavior through the public interface; reach into private items only when the logic can't be observed
otherwise. Each `tests/*.rs` file is its own crate — share helpers through `tests/common/mod.rs`.

## Step 3 — Write It

- Name tests for the behavior: `rejects_empty_email`, not `test_validate_2`.
- Return `Result<(), Box<dyn std::error::Error>>` from a test to use `?` instead of `unwrap()`.
- Assert the specific error: `assert!(matches!(err, ConfigError::Parse(_)))`, not just `is_err()`.
- `#[should_panic(expected = "…")]` only for code that is meant to panic; include the message so it
  can't pass on an unrelated panic.
- Many inputs, one rule: loop over a table of `(input, expected)` pairs with a message naming the case, or
  use `rstest` if the crate has it.
- Property tests (`proptest`) fit parsers, round-trips and "never panics for any input" — state the
  property, don't re-implement the function in the assertion.
- Async: use the runtime's attribute the crate already uses (`#[tokio::test]` …). Don't `sleep` to wait —
  await the event, or drive time with the runtime's paused clock.
- Fakes: replace the network, clock, filesystem and randomness behind a trait or a function parameter; keep
  your own logic real. A hand-written fake struct is usually clearer than a mocking macro.
- Keep tests independent: use `tempfile` directories, never a fixed path, and never rely on test order.

## Step 4 — Run It

```bash
cargo test                          # everything, including doc tests
cargo test <name> -- --nocapture    # one test, with its output
cargo test --doc                    # doc tests only
cargo clippy --all-targets -- -D warnings
cargo llvm-cov --summary-only       # only if the project already uses cargo-llvm-cov
```

A new test must be **red before green**: run it against the code without the change and watch it fail for
the right reason. For slow or flaky suites, `cargo nextest run` if the project uses it.
