#!/usr/bin/env bash
# Run the project's own mutation-testing tool, optionally on one target. Never installs anything:
# adding a tool is the user's dependency decision.
#   usage: run-mutation.sh [path-or-class]
set -euo pipefail
target="${1:-}"

if [ -f package.json ] && grep -q '"@stryker-mutator/core"' package.json; then
  if [ -f pnpm-lock.yaml ]; then run=(pnpm exec); elif [ -f yarn.lock ]; then run=(yarn); else run=(npx); fi
  exec "${run[@]}" stryker run ${target:+--mutate "$target"}
fi

if [ -f Cargo.toml ] && cargo mutants --version >/dev/null 2>&1; then
  exec cargo mutants ${target:+--file "$target"}
fi

if [ -f pom.xml ] && grep -q 'pitest-maven' pom.xml; then
  exec mvn -q org.pitest:pitest-maven:mutationCoverage ${target:+-DtargetClasses="$target"}
fi

if [ -x gradlew ] && grep -qs 'pitest' build.gradle build.gradle.kts; then
  # The Gradle plugin reads its targets from the build file; a CLI target is not supported.
  [ -n "$target" ] && echo "note: Gradle pitest ignores '$target'; set targetClasses in the build file" >&2
  exec ./gradlew pitest
fi

cat >&2 <<'EOF'
No mutation-testing tool is configured in this project. Options, if the user wants one:
  JS/TS        @stryker-mutator/core (+ the runner plugin, e.g. @stryker-mutator/vitest-runner)
  Kotlin/Java  info.solidsoft.pitest (Gradle) or pitest-maven, plus pitest-kotlin for Kotlin
  Rust         cargo install cargo-mutants
EOF
exit 3
