import { describe, expect, it } from 'vitest';
import type { CatalogItem } from '../catalog/catalog.types.js';
import { findInstalledItems } from './installed-items.js';

const item = (
  category: CatalogItem['category'],
  title: string,
  path: string,
): CatalogItem => ({ id: path, category, title, path });

const catalog = [
  item('claude-skill', 'test', '.claude/skills/test/'),
  item('claude-skill', 'test-fixer', '.claude/skills/test-fixer/'),
  item('claude-agent', 'doc-polisher', '.claude/agents/doc-polisher.md'),
  item('claude-hook', 'secret-guard', '.claude/hooks/modules/secret-guard/'),
  item('codex-skill', 'test', '.agents/skills/test/'),
];

const titles = (items: CatalogItem[]) => items.map((i) => i.id);

describe('findInstalledItems', () => {
  it('디렉터리 항목은 그 아래 파일이 하나라도 있으면 설치된 것으로 본다', () => {
    const installed = findInstalledItems(catalog, [
      '.claude/skills/test/references/runners.md',
      'README.md',
    ]);
    expect(titles(installed)).toEqual(['.claude/skills/test/']);
  });

  it('이름이 접두어로 겹치는 다른 항목을 잘못 잡지 않는다', () => {
    // `.claude/skills/test-fixer/`만 있는데 `test/`가 설치된 것으로 잡히면 안 된다
    const installed = findInstalledItems(catalog, [
      '.claude/skills/test-fixer/SKILL.md',
    ]);
    expect(titles(installed)).toEqual(['.claude/skills/test-fixer/']);
  });

  it('파일 항목은 경로가 정확히 같을 때만 설치된 것으로 본다', () => {
    expect(
      titles(findInstalledItems(catalog, ['.claude/agents/doc-polisher.md'])),
    ).toEqual(['.claude/agents/doc-polisher.md']);
    expect(
      findInstalledItems(catalog, ['.claude/agents/doc-polisher.md.bak']),
    ).toEqual([]);
  });

  it('Claude와 Codex 사본을 따로 판단한다', () => {
    const installed = findInstalledItems(catalog, [
      '.claude/skills/test/SKILL.md',
    ]);
    expect(titles(installed)).not.toContain('.agents/skills/test/');
  });

  it('카탈로그 경로가 하나도 없으면 빈 배열', () => {
    expect(
      findInstalledItems(catalog, ['src/main.ts', 'package.json']),
    ).toEqual([]);
    expect(findInstalledItems(catalog, [])).toEqual([]);
  });
});
