import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Claude와 Codex 미러가 서로 어긋나지 않았는지.
 *
 * 카탈로그는 항목마다 두 플랫폼의 사본을 갖는데, 사본을 맞추는 일은 사람이 기억해서 하고 있었다.
 * 한쪽만 추가되거나, Codex가 풀지 못하는 `${CLAUDE_SKILL_DIR}`이 그대로 남는 실수는 머지 전에
 * 여기서 잡는다. 내용이 같아야 한다는 게 아니라(플랫폼 적응으로 달라지는 부분이 있다) 짝이 있고,
 * 이름이 같고, Codex가 못 쓰는 표기가 없어야 한다는 검사다 (`.claude/rules/catalog.md`).
 */
const root = fileURLToPath(new URL('../../', import.meta.url));
const at = (...parts: string[]) => join(root, ...parts);

const dirs = (path: string) =>
  readdirSync(at(path)).filter((name) =>
    statSync(at(path, name)).isDirectory(),
  );

function files(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(dir.length + 1))
    .sort();
}

function frontmatter(path: string): Record<string, string> {
  const match = readFileSync(path, 'utf8').match(/^---\n([\s\S]*?)\n---/);
  const fields: Record<string, string> = {};
  for (const line of (match?.[1] ?? '').split('\n')) {
    const field = line.match(/^([A-Za-z-]+):\s*(.*)$/);
    if (field) fields[field[1]] = field[2].replace(/^["']|["']$/g, '').trim();
  }
  return fields;
}

const claudeSkills = dirs('.claude/skills');
const codexSkills = dirs('.agents/skills');

describe('skills', () => {
  it('Claude 스킬마다 Codex 미러가 있고 그 반대도 마찬가지다', () => {
    expect(codexSkills).toEqual(claudeSkills);
  });

  describe.each(claudeSkills)('%s', (name) => {
    const claude = at('.claude/skills', name);
    const codex = at('.agents/skills', name);

    it('name이 같고 둘 다 description이 있다', () => {
      const a = frontmatter(join(claude, 'SKILL.md'));
      const b = frontmatter(join(codex, 'SKILL.md'));
      expect(b.name).toBe(a.name);
      // description까지 같아야 하는 건 아니다 — 서브에이전트로 나누는 스킬은 Claude본이 "병렬로
      // 나눈다"고 쓰고 Codex본은 순차 패스라고 쓴다. 다만 비어 있으면 호출 조건을 잃는다.
      expect(a.description).not.toBe('');
      expect(b.description).not.toBe('');
    });

    it('scripts·references 등 딸린 파일의 구성이 같다', () => {
      expect(files(codex)).toEqual(files(claude));
    });

    it('Codex 미러가 Codex에 없는 도구와 변수를 쓰지 않는다', () => {
      const text = readFileSync(join(codex, 'SKILL.md'), 'utf8');
      const tools = frontmatter(join(codex, 'SKILL.md'))['allowed-tools'] ?? '';
      // Codex에는 서브에이전트도 질문 도구도 없다
      expect(tools).not.toMatch(/\b(Agent|AskUserQuestion)\b/);
      expect(text).not.toMatch(/^disable-model-invocation:/m);
      // `${CLAUDE_SKILL_DIR}`은 Codex가 풀지 않는다. 설명 문장에서 언급하는 것은 괜찮고,
      // 실제로 실행되는 코드 블록 안에 남아 있으면 안 된다.
      const blocks = [...text.matchAll(/```[\s\S]*?```/g)].map((m) => m[0]);
      for (const block of blocks) {
        expect(block).not.toContain('CLAUDE_SKILL_DIR');
      }
    });
  });
});

describe('agents', () => {
  const claude = readdirSync(at('.claude/agents'))
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''))
    .sort();
  const codex = readdirSync(at('.codex/agents'))
    .filter((f) => f.endsWith('.toml'))
    .map((f) => f.replace(/\.toml$/, ''))
    .sort();

  it('Claude 에이전트마다 Codex 미러가 있고 그 반대도 마찬가지다', () => {
    expect(codex).toEqual(claude);
  });

  it.each(claude)('%s의 name이 파일명과 같다', (name) => {
    expect(frontmatter(at('.claude/agents', `${name}.md`)).name).toBe(name);
    const toml = readFileSync(at('.codex/agents', `${name}.toml`), 'utf8');
    expect(toml.match(/^name\s*=\s*"([^"]*)"/m)?.[1]).toBe(name);
  });
});

describe('hook modules', () => {
  const claude = dirs('.claude/hooks/modules');
  const codex = dirs('.codex/hooks/modules');

  it('Claude 훅 모듈마다 Codex 모듈이 있고 그 반대도 마찬가지다', () => {
    expect(codex).toEqual(claude);
  });

  it.each(claude)('%s는 같은 시점에 동작하는 스크립트를 갖는다', (name) => {
    // 파일명만 다르다: preToolUse.sh ↔ pre-tool-use.sh
    const kebab = (file: string) =>
      file.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
    const expected = readdirSync(at('.claude/hooks/modules', name))
      .map(kebab)
      .sort();
    expect(readdirSync(at('.codex/hooks/modules', name)).sort()).toEqual(
      expected,
    );
    for (const file of expected) {
      expect(existsSync(at('.codex/hooks/modules', name, file))).toBe(true);
    }
  });
});
