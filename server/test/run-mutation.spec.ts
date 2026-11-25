import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * `test-quality` 스킬의 run-mutation.sh가 대상 레포의 도구를 고르는지 확인한다.
 * 실제 도구 대신 받은 인자를 출력하는 가짜 실행 파일을 PATH 앞에 둔다.
 */
const root = fileURLToPath(new URL('../../', import.meta.url));
const scripts = [
  '.claude/skills/test-quality/scripts/run-mutation.sh',
  '.agents/skills/test-quality/scripts/run-mutation.sh',
];

function fake(dir: string, name: string) {
  const path = join(dir, name);
  writeFileSync(path, `#!/usr/bin/env bash\necho "${name} $*"\n`);
  chmodSync(path, 0o755);
}

function run(
  script: string,
  files: Record<string, string>,
  args: string[] = [],
) {
  const repo = mkdtempSync(join(tmpdir(), 'mutation-'));
  const bin = mkdtempSync(join(tmpdir(), 'bin-'));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(repo, name), content);
  }
  if ('gradlew' in files) chmodSync(join(repo, 'gradlew'), 0o755);
  fake(bin, 'pnpm');
  fake(bin, 'npx');
  return spawnSync('bash', [root + script, ...args], {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
  });
}

describe.each(scripts)('%s', (script) => {
  it('도구가 없으면 아무것도 설치하지 않고 3으로 끝나며 선택지를 알려준다', () => {
    const result = run(script, { 'package.json': '{}' });

    expect(result.status).toBe(3);
    expect(result.stderr).toContain('@stryker-mutator/core');
  });

  it('Stryker가 있으면 레포의 패키지 매니저로 대상 파일만 돌린다', () => {
    const result = run(
      script,
      {
        'package.json': '{"devDependencies":{"@stryker-mutator/core":"9"}}',
        'pnpm-lock.yaml': '',
      },
      ['src/a.ts'],
    );

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(
      'pnpm exec stryker run --mutate src/a.ts',
    );
  });

  it('Gradle pitest는 대상을 무시한다고 알리고 빌드 파일 설정으로 돌린다', () => {
    const result = run(
      script,
      {
        'build.gradle.kts': 'plugins { id("info.solidsoft.pitest") }',
        gradlew: '#!/usr/bin/env bash\necho "gradlew $*"\n',
      },
      ['com.example.Foo'],
    );

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('gradlew pitest');
    expect(result.stderr).toContain("ignores 'com.example.Foo'");
  });
});
