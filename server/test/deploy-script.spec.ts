import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * `server/scripts/deploy.sh` — VM에서 배포 키가 실행하는 스크립트.
 *
 * 배포 키는 이 스크립트 하나만 실행하도록 고정돼 있어서, "어떤 명령을 받아들이는가"가 곧 그 키로 할
 * 수 있는 일의 범위다. 그래서 허용 목록 밖의 명령이 거부되는지, 그리고 카탈로그 변경 때만 갱신 PR을
 * 여는지를 임시 저장소에서 실제로 실행해 확인한다. 실제 서비스(npm, systemctl, GitHub)는 건드리지 않는다:
 * 갱신 CLI는 인자를 출력하기만 하는 가짜 파일로 바꿔 둔다.
 */
const script = fileURLToPath(new URL('../scripts/deploy.sh', import.meta.url));

let repo: string;

const git = (...args: string[]) => {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
};

const commit = (path: string, message: string) => {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), message);
  git('add', '-A');
  git('commit', '-q', '-m', message);
  return git('rev-parse', 'HEAD');
};

function deploy(before: string, command?: string) {
  const env = { ...process.env };
  delete env.SSH_ORIGINAL_COMMAND;
  if (command !== undefined) env.SSH_ORIGINAL_COMMAND = command;
  const result = spawnSync(
    'bash',
    [join(repo, 'server/scripts/deploy.sh'), before],
    {
      cwd: repo,
      env,
      encoding: 'utf8',
    },
  );
  return {
    status: result.status,
    out: result.stdout + result.stderr,
  };
}

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'deploy-script-'));
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');
  mkdirSync(join(repo, 'server/scripts'), { recursive: true });
  copyFileSync(script, join(repo, 'server/scripts/deploy.sh'));
  // 갱신 CLI 대역: 받은 인자만 출력한다.
  mkdirSync(join(repo, 'server/dist'), { recursive: true });
  writeFileSync(
    join(repo, 'server/dist/update-cli.js'),
    "console.log('update-cli 호출:', process.argv.slice(2).join(' ') || '(인자 없음)');",
  );
  commit('README.md', 'init');
});

afterAll(() => rmSync(repo, { recursive: true, force: true }));

describe('deploy.sh', () => {
  it('허용 목록 밖의 명령은 아무것도 실행하지 않고 거부한다', () => {
    const before = git('rev-parse', 'HEAD');
    for (const command of [
      'rm -rf /',
      'deploy; id',
      'update-repos --apply --only evil/repo',
      'bash',
    ]) {
      const { status, out } = deploy(before, command);
      expect(status, command).toBe(2);
      expect(out, command).toContain('허용되지 않은 명령');
      expect(out, command).not.toContain('update-cli 호출');
    }
  });

  it('직전 커밋 SHA 없이는 실행되지 않는다', () => {
    const result = spawnSync('bash', [join(repo, 'server/scripts/deploy.sh')], {
      cwd: repo,
      encoding: 'utf8',
    });
    expect(result.status).not.toBe(0);
  });

  it('새 커밋이 없으면 배포도 갱신도 하지 않는다', () => {
    const { status, out } = deploy(git('rev-parse', 'HEAD'));
    expect(status).toBe(0);
    expect(out).toContain('새 커밋 없음');
    expect(out).not.toContain('update-cli 호출');
  });

  it('카탈로그가 바뀐 배포는 갱신 PR을 연다', () => {
    const before = git('rev-parse', 'HEAD');
    commit('.claude/skills/demo/SKILL.md', 'add skill');
    const { status, out } = deploy(before);
    expect(status).toBe(0);
    expect(out).toContain('카탈로그만 변경');
    expect(out).toContain('update-cli 호출: --apply');
  });

  it.each([
    ['.codex/agents/demo.toml'],
    ['.agents/shared/doc.md'],
    ['.claude/hooks/modules/x/preToolUse.sh'],
    ['.claude/templates/settings-hooks.json'],
  ])('%s 변경도 카탈로그 변경으로 본다', (path) => {
    const before = git('rev-parse', 'HEAD');
    commit(path, `change ${path}`);
    expect(deploy(before).out).toContain('update-cli 호출: --apply');
  });

  it('이 레포 자신을 위한 파일만 바뀌면 갱신 PR을 열지 않는다', () => {
    const before = git('rev-parse', 'HEAD');
    commit('.claude/rules/server.md', 'rules');
    commit('CLAUDE.md', 'docs');
    const { status, out } = deploy(before);
    expect(status).toBe(0);
    expect(out).toContain('카탈로그 변경 없음');
    expect(out).not.toContain('update-cli 호출');
  });

  it('여러 커밋에 걸친 변경도 직전 배포 지점부터 비교해 놓치지 않는다', () => {
    // 연속 머지로 중간 배포가 취소돼도, 마지막 배포는 "직전에 실제로 배포한 커밋"부터 본다.
    const before = git('rev-parse', 'HEAD');
    commit('.claude/skills/first/SKILL.md', 'catalog change');
    commit('CLAUDE.md', 'docs only');
    expect(deploy(before).out).toContain('update-cli 호출: --apply');
  });

  it('update-repos는 배포 없이 갱신만 한다', () => {
    const head = git('rev-parse', 'HEAD');
    const apply = deploy(head, 'update-repos');
    expect(apply.status).toBe(0);
    expect(apply.out).toContain('update-cli 호출: --apply');
    expect(apply.out).not.toContain('배포:');

    const dry = deploy(head, 'update-repos --dry-run');
    expect(dry.status).toBe(0);
    expect(dry.out).toContain('update-cli 호출: (인자 없음)');
  });
});
