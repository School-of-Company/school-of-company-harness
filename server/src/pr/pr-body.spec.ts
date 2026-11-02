import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CatalogCategory, CatalogItem } from '../catalog/catalog.types.js';
import { buildPrTitle } from './pr-body.js';

const item = (category: CatalogCategory, title: string): CatalogItem => ({
  id: `${category}/${title}`,
  category,
  title,
  path: `${title}/`,
});

/** 대상 레포가 CI로 거는 PR 제목 검사와 같은 조건 (Expo 계열의 `pr-title`). */
const violatesStrictTitleRule = (title: string) =>
  !title.trim() ||
  [...title].length > 50 ||
  /[\p{Cc}\p{Extended_Pictographic}\p{Emoji_Presentation}]|⃣|^\[[^\]]+\]/u.test(
    title,
  );

describe('buildPrTitle', () => {
  it('항목이 하나면 이름을 쓴다', () => {
    expect(buildPrTitle([item('claude-skill', 'test')])).toBe(
      '하네스 동기화 — test 스킬',
    );
  });

  it('여러 개면 그룹별 개수로 줄이고, 같은 이름의 Claude·Codex 사본은 하나로 센다', () => {
    const title = buildPrTitle([
      item('claude-skill', 'a'),
      item('codex-skill', 'a'),
      item('claude-skill', 'b'),
      item('claude-agent', 'c'),
      item('claude-hook', 'd'),
    ]);
    expect(title).toBe('하네스 동기화 — 스킬 2 · 에이전트 1 · 훅 1');
  });

  it('`[global]` 같은 범위 접두어로 시작하지 않는다', () => {
    expect(buildPrTitle([item('claude-skill', 'test')])).not.toMatch(/^\[/);
  });

  it('카탈로그의 어떤 항목 하나만 골라도 제목 검사 규칙을 통과한다', () => {
    const root = fileURLToPath(new URL('../../../', import.meta.url));
    const names = [
      ...readdirSync(root + '.claude/skills').map((n) => ['claude-skill', n]),
      ...readdirSync(root + '.claude/agents').map((n) => [
        'claude-agent',
        n.replace(/\.md$/, ''),
      ]),
      ...readdirSync(root + '.claude/hooks/modules').map((n) => [
        'claude-hook',
        n,
      ]),
    ] as [CatalogCategory, string][];

    for (const [category, name] of names) {
      const title = buildPrTitle([item(category, name)]);
      expect(violatesStrictTitleRule(title), title).toBe(false);
    }
  });

  it('여러 그룹이 섞인 제목도 규칙을 통과한다', () => {
    const title = buildPrTitle([
      item('claude-skill', 'a'),
      item('claude-agent', 'b'),
      item('claude-hook', 'c'),
    ]);
    expect(violatesStrictTitleRule(title), title).toBe(false);
  });
});
