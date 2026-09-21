import { describe, expect, it } from 'vitest';
import { detectStack } from './stack-detection.js';

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
