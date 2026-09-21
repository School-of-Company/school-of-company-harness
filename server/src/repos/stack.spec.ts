import { describe, expect, it } from 'vitest';
import type { CatalogItem } from '../catalog/catalog.types.js';
import { detectStack, recommendItems, requirementOf } from './stack.js';

function item(
  id: string,
  title: string,
  category: CatalogItem['category'],
): CatalogItem {
  return { id, category, title, path: id };
}

describe('detectStack', () => {
  it('Gradle + Java 저장소 (Gwangju-talent-festival-Server-V2 형태)', () => {
    const detected = detectStack({
      languages: ['Java', 'Shell', 'HCL'],
      files: ['build.gradle', 'gradlew', 'settings.gradle'],
      dependencies: [],
      buildScript: `plugins {
        id 'org.springframework.boot' version '3.2.0'
        id 'com.diffplug.spotless' version '6.25.0'
      }`,
    });

    expect(detected.stacks).toContain('java');
    expect(detected.stacks).toContain('spring');
    expect(detected.tools).toContain('gradle');
    expect(detected.tools).toContain('spotless');
    // gradle 프로젝트면 테스트 훅이 의미를 가진다
    expect(detected.tools).toContain('gradle-test');
    expect(detected.stacks).not.toContain('typescript');
  });

  it('Next.js + TypeScript 저장소 (school-of-company-official 형태)', () => {
    const detected = detectStack({
      languages: ['TypeScript', 'JavaScript'],
      files: [
        'package.json',
        'tsconfig.json',
        'eslint.config.mjs',
        'next.config.mjs',
      ],
      dependencies: ['next', 'react', 'eslint', 'typescript'],
    });

    expect(detected.stacks).toEqual(
      expect.arrayContaining(['typescript', 'nextjs', 'react', 'node']),
    );
    expect(detected.tools).toEqual(
      expect.arrayContaining(['eslint', 'ts-check']),
    );
    expect(detected.tools).not.toContain('oxlint');
    expect(detected.tools).not.toContain('gradle');
  });

  it('설정 파일이 없어도 package.json 의존성으로 도구를 알아낸다', () => {
    // 하네스 server 자신: oxlint를 쓰지만 루트에 .oxlintrc 대신 oxlint.json 이 있고,
    // vitest 는 설정 파일과 의존성 양쪽으로 드러난다.
    const detected = detectStack({
      languages: ['TypeScript'],
      files: ['package.json', 'tsconfig.json'],
      dependencies: ['@nestjs/core', 'oxlint', 'vitest', 'typescript'],
    });

    expect(detected.stacks).toContain('nestjs');
    expect(detected.tools).toContain('oxlint');
    expect(detected.tools).toContain('vitest');
    expect(detected.tools).not.toContain('eslint');
  });

  it('모노레포에서 하위 디렉터리의 설정도 찾는다', () => {
    // 하네스 저장소 자신: 루트에는 카탈로그만 있고 package.json·oxlint.json은 server/ 아래에 있다.
    // 루트만 스캔하던 시절에는 oxlint를 못 찾아 훅이 "해당 없음"으로 나왔다.
    const detected = detectStack({
      languages: ['TypeScript'],
      files: ['README.md', 'server/package.json', 'server/oxlint.json', 'server/tsconfig.json'],
      dependencies: ['oxlint', 'vitest'],
    });

    expect(detected.tools).toContain('oxlint');
    expect(detected.stacks).toContain('node');
    expect(detected.evidence).toContain('파일: server/oxlint.json');
  });

  it('Maven + Spring 도 감지한다', () => {
    const detected = detectStack({
      languages: ['Java'],
      files: ['pom.xml', 'src/main/resources/application.yml'],
      dependencies: [],
      buildScript: '<artifactId>spring-boot-starter-web</artifactId>',
    });

    expect(detected.stacks).toEqual(expect.arrayContaining(['java', 'spring']));
    expect(detected.tools).toContain('maven');
  });

  it('application.yml 만으로도 Spring 으로 본다', () => {
    const detected = detectStack({
      languages: ['Kotlin'],
      files: ['build.gradle.kts', 'src/main/resources/application.yaml'],
      dependencies: [],
    });
    expect(detected.stacks).toContain('spring');
  });

  it('근거를 함께 돌려준다', () => {
    const detected = detectStack({
      languages: ['Kotlin'],
      files: ['build.gradle.kts'],
      dependencies: [],
    });
    expect(detected.evidence).toContain('언어: Kotlin');
    expect(detected.evidence).toContain('파일: build.gradle.kts');
  });
});

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
