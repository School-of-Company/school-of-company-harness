---
name: rust-patterns
description: Idiomatic Rust conventions for writing or reviewing code — ownership and borrowing, error handling without panics, enums for state, traits and generics, async and shared-state concurrency, and a small public surface. Use when writing, reviewing or refactoring Rust, or when ownership, errors, traits or concurrency are in question.
allowed-tools: Bash, Read, Glob, Grep, Edit, Write
---

# Rust Patterns

Match the crate you are in first: read `Cargo.toml` (edition, dependencies, workspace members) and a
neighbouring module before applying anything below. If the project already picked an error crate, an async
runtime or a lint config, use it — don't introduce a second one. Condensed from
[affaan-m/ECC `rust-patterns`](https://github.com/affaan-m/ECC) (MIT).

## Ownership and Borrowing

- Take `&T` / `&[T]` / `&str` when you only read; take ownership only to store or consume. Accept the
  broadest borrowed form (`&str` not `&String`, `&[T]` not `&Vec<T>`).
- A `.clone()` added to quiet the borrow checker is a smell — restructure the borrow or shorten the scope
  first. Clone on purpose, where the cost is understood.
- `Cow<'_, str>` when a function usually returns its input unchanged and only sometimes allocates.
- Return owned values from constructors and iterators from functions that produce many; let the caller
  `collect`.

## Error Handling

- **No `unwrap()` / `expect()` on a path that can fail at runtime** — input, I/O, parsing, a lock you did not
  create. Propagate with `?`. `expect("why this cannot fail")` is acceptable for a true invariant, with the reason.
- Library crates return typed errors (an `enum` implementing `std::error::Error`, usually via `thiserror`);
  binaries may use a catch-all (`anyhow`) and add context at each boundary (`.with_context(|| ...)`).
- Preserve the cause: wrap with `#[from]` / `source`, never flatten to a `String` and lose the chain.
- Don't swallow a `Result`: `let _ = ...` on a fallible call needs a comment saying why it is safe to ignore.
- Prefer `Option` combinators (`map`, `and_then`, `ok_or`, `unwrap_or_default`) over nested `match` when the
  shape is linear.

## Enums and Matching

- Model states as enums with data so illegal combinations cannot be built, not as a struct of `Option`s and
  booleans.
- Match exhaustively; avoid a `_ =>` arm on your own enums so adding a variant is a compile error, not a
  silent fall-through.
- Newtypes (`struct UserId(u64)`) for values that must not be mixed up.

## Traits and Generics

- Static dispatch (`impl Trait`, generics) by default; `dyn Trait` when you need heterogeneous collections
  or to cut compile time at a boundary.
- Keep trait bounds on the function that needs them, not on the struct. Use `where` clauses past two bounds.
- Implement standard traits (`Debug`, `Display`, `From`, `Default`, `FromStr`) instead of ad-hoc
  `to_x()` helpers; derive what you can.
- Don't add a trait with one implementor "for testing" — a plain function or a concrete type is enough
  until a second implementation exists.

## Concurrency and Async

- Share state with `Arc<Mutex<T>>` / `Arc<RwLock<T>>` only when a channel or ownership transfer won't do;
  prefer message passing for pipelines.
- **Never hold a `std::sync` lock guard across an `.await`** — scope it in a block, or use the runtime's
  async lock if you truly must.
- Don't block inside async code (`std::fs`, `thread::sleep`, heavy CPU): use the async equivalent or
  `spawn_blocking`.
- A spawned task's `JoinHandle` result is a `Result` — await it or log it, or the failure is silent.
- `Send + 'static` bounds on spawned work are the compiler telling you about a real lifetime problem; fix
  the ownership instead of reaching for `Arc` everywhere.

## Modules and Visibility

- Start private; `pub(crate)` before `pub`. A public item is a promise to every caller.
- Group by domain, not by kind (`user/`, `billing/`, not `models/`, `services/`); re-export the intended API
  from the module root.
- `unsafe` stays in the smallest possible block with a `// SAFETY:` comment stating the invariant it relies on.

## Before You Finish

```bash
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
```

Run what the project's CI runs; if it has a different lint level or a `rust-toolchain` pin, follow that.
Fix clippy findings instead of adding `#[allow]`, and when an `allow` is justified say why next to it.
