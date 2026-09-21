import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import {
  findSharedReferences,
  resolveSharedReferences,
} from './shared-references.js';

/** 테스트 파일이 `server/src/pr/`에 있으므로 세 단계 위가 카탈로그 루트다. */
const CATALOG_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
);

describe('findSharedReferences', () => {
  it('Claude와 Codex의 공용 문서 경로를 모두 찾는다', () => {
    const found = findSharedReferences([
      { path: 'a/SKILL.md', content: 'Read `.claude/shared/commit-conventions.md` first.' },
      { path: 'b/SKILL.md', content: 'Read `.agents/shared/commit-conventions.md` first.' },
    ]);
    expect([...found.keys()]).toEqual([
      '.claude/shared/commit-conventions.md',
      '.agents/shared/commit-conventions.md',
    ]);
  });

  it('같은 문서를 여러 항목이 참조해도 한 번만 — 중복 전송을 막는 지점', () => {
    const found = findSharedReferences([
      { path: 'git-commit/SKILL.md', content: '`.claude/shared/commit-conventions.md`' },
      { path: 'write-pr/SKILL.md', content: '`.claude/shared/commit-conventions.md`' },
    ]);
    expect(found.size).toBe(1);
    // 값은 처음 참조한 파일 — 에러 메시지에서 "어느 항목이 잘못 적었는지"를 가리키는 데 쓴다.
    expect(found.get('.claude/shared/commit-conventions.md')).toBe(
      'git-commit/SKILL.md',
    );
  });

  it('참조가 없으면 빈 결과', () => {
    expect(
      findSharedReferences([{ path: 'a.md', content: '.claude/skills/test/' }]).size,
    ).toBe(0);
  });
});

describe('resolveSharedReferences', () => {
  it('실제 카탈로그의 공용 문서를 읽어 전송 목록에 올린다', () => {
    const files = resolveSharedReferences(
      [{ path: 'x/SKILL.md', content: 'see `.claude/shared/commit-conventions.md`' }],
      CATALOG_ROOT,
    );
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('.claude/shared/commit-conventions.md');
    expect(files[0].content).toContain('Commit Message Format');
  });

  it('카탈로그에 없는 경로를 참조하면 어느 파일이 잘못됐는지 알리며 실패한다', () => {
    expect(() =>
      resolveSharedReferences(
        [{ path: 'broken/SKILL.md', content: '`.claude/shared/nope.md`' }],
        CATALOG_ROOT,
      ),
    ).toThrowError(/broken\/SKILL\.md.*\.claude\/shared\/nope\.md/s);
  });
});
