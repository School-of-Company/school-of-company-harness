import { describe, expect, it } from 'vitest';
import type { CatalogItem } from '../catalog/catalog.types.js';
import { recommendItems, requirementOf } from './item-matching.js';
import { detectStack } from './stack-detection.js';

function item(
  id: string,
  title: string,
  category: CatalogItem['category'],
): CatalogItem {
  return { id, category, title, path: id };
}

describe('requirementOf — 이름 규약에서 요구사항을 읽는다', () => {
  it('훅 이름은 도구 이름이다', () => {
    expect(
      requirementOf(item('claude/hooks/oxlint', 'oxlint', 'claude-hook')),
    ).toEqual({ tool: 'oxlint' });
    expect(
      requirementOf(item('claude/hooks/ktlint', 'ktlint', 'claude-hook')),
    ).toEqual({ tool: 'ktlint' });
  });

  it('*-guard 훅은 스택 무관이다', () => {
    expect(
      requirementOf(
        item('claude/hooks/secret-guard', 'secret-guard', 'claude-hook'),
      ),
    ).toEqual({});
    expect(
      requirementOf(
        item('claude/hooks/command-guard', 'command-guard', 'claude-hook'),
      ),
    ).toEqual({});
  });

  it('이름에 든 스택을 모두 요구한다 — Spring 아닌 Java 프로젝트를 걸러내기 위해', () => {
    expect(
      requirementOf(
        item('claude/skills/java-spring-arch', 'java-spring-arch', 'claude-skill'),
      ),
    ).toEqual({ stacks: ['java', 'spring'] });
  });

  it('<스택>- 접두어 스킬은 그 스택을 요구한다', () => {
    expect(
      requirementOf(
        item(
          'claude/skills/kotlin-spring-arch',
          'kotlin-spring-arch',
          'claude-skill',
        ),
      ),
    ).toEqual({ stacks: ['kotlin', 'spring'] });
    expect(
      requirementOf(
        item('claude/skills/nestjs-arch', 'nestjs-arch', 'claude-skill'),
      ),
    ).toEqual({ stacks: ['nestjs'] });
  });

  it('그 밖의 항목은 요구사항이 없다', () => {
    expect(
      requirementOf(item('claude/skills/write-pr', 'write-pr', 'claude-skill')),
    ).toEqual({});
    expect(
      requirementOf(item('claude/skills/test', 'test', 'claude-skill')),
    ).toEqual({});
    expect(
      requirementOf(
        item('claude/agents/doc-polisher', 'doc-polisher', 'claude-agent'),
      ),
    ).toEqual({});
  });
});

describe('recommendItems', () => {
  const catalog = [
    item('claude/skills/write-pr', 'write-pr', 'claude-skill'),
    item(
      'claude/skills/kotlin-spring-arch',
      'kotlin-spring-arch',
      'claude-skill',
    ),
    item('claude/skills/nestjs-arch', 'nestjs-arch', 'claude-skill'),
    item('claude/hooks/ktlint', 'ktlint', 'claude-hook'),
    item('claude/hooks/oxlint', 'oxlint', 'claude-hook'),
    item('claude/hooks/secret-guard', 'secret-guard', 'claude-hook'),
  ];

  it('Kotlin + Spring + ktlint 저장소', () => {
    const detected = detectStack({
      languages: ['Kotlin'],
      files: ['build.gradle.kts'],
      dependencies: [],
      buildScript: `
        id('org.jlleitschuh.gradle.ktlint')
        id('org.springframework.boot')
      `,
    });

    const byTitle = Object.fromEntries(
      recommendItems(catalog, detected).map((r) => [r.title, r.verdict]),
    );

    expect(byTitle).toEqual({
      'write-pr': 'recommended',
      'kotlin-spring-arch': 'recommended',
      'nestjs-arch': 'not-applicable',
      ktlint: 'recommended',
      oxlint: 'not-applicable',
      'secret-guard': 'recommended',
    });
  });

  it('NestJS + oxlint 저장소에서는 반대로 갈린다', () => {
    const detected = detectStack({
      languages: ['TypeScript'],
      files: ['package.json'],
      dependencies: ['@nestjs/core', 'oxlint'],
    });

    const byTitle = Object.fromEntries(
      recommendItems(catalog, detected).map((r) => [r.title, r.verdict]),
    );

    expect(byTitle['nestjs-arch']).toBe('recommended');
    expect(byTitle['kotlin-spring-arch']).toBe('not-applicable');
    expect(byTitle.oxlint).toBe('recommended');
    expect(byTitle.ktlint).toBe('not-applicable');
  });

  it('해당 없음에도 이유가 붙는다 — 화면에서 왜 빠졌는지 보여야 한다', () => {
    const detected = detectStack({
      languages: ['Java'],
      files: [],
      dependencies: [],
    });
    const oxlint = recommendItems(catalog, detected).find(
      (r) => r.title === 'oxlint',
    );
    expect(oxlint?.reason).toContain('oxlint');
  });
});
