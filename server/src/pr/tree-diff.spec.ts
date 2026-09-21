import { execFileSync } from 'child_process';
import { describe, expect, it } from 'vitest';
import { classifyFiles, gitBlobSha, modeFor } from './tree-diff.js';

describe('gitBlobSha', () => {
  it('git 이 계산하는 blob SHA와 일치한다', () => {
    // 우리 계산이 GitHub의 tree SHA와 비교 가능하다는 것을 git 자신으로 검증한다.
    // (`git hash-object`는 로컬 저장소가 없어도 --stdin 으로 동작한다)
    for (const content of ['hello\n', '', '한글과 emoji 🙂\n{"a":1}']) {
      const fromGit = execFileSync('git', ['hash-object', '--stdin'], {
        input: content,
        encoding: 'utf-8',
      }).trim();
      expect(gitBlobSha(content)).toBe(fromGit);
    }
  });
});

describe('modeFor', () => {
  it('셸 스크립트는 실행 권한으로, 나머지는 일반 파일로', () => {
    expect(modeFor('.claude/hooks/preToolUse.sh')).toBe('100755');
    expect(modeFor('.claude/settings.json')).toBe('100644');
    expect(modeFor('.claude/skills/test/SKILL.md')).toBe('100644');
  });
});

describe('classifyFiles', () => {
  const file = { path: '.claude/skills/test/SKILL.md', content: 'hello\n' };

  it('대상에 없는 파일은 added', () => {
    expect(classifyFiles([file], [])).toEqual([{ file, kind: 'added' }]);
  });

  it('내용이 같으면 unchanged — 이게 PR diff를 실제 변경분만 남기는 핵심', () => {
    const entries = [
      {
        path: file.path,
        sha: gitBlobSha(file.content),
        mode: '100644',
        type: 'blob',
      },
    ];
    expect(classifyFiles([file], entries)).toEqual([
      { file, kind: 'unchanged' },
    ]);
  });

  it('내용이 다르면 updated', () => {
    const entries = [
      {
        path: file.path,
        sha: gitBlobSha('something else\n'),
        mode: '100644',
        type: 'blob',
      },
    ];
    expect(classifyFiles([file], entries)).toEqual([{ file, kind: 'updated' }]);
  });

  it('내용이 같아도 실행 권한이 빠져 있으면 updated', () => {
    // 예전 방식으로 올라간 훅 스크립트(100644)를 고쳐 보내야 하는 경우.
    const hook = {
      path: '.claude/hooks/preToolUse.sh',
      content: '#!/bin/bash\nexit 0\n',
    };
    const entries = [
      {
        path: hook.path,
        sha: gitBlobSha(hook.content),
        mode: '100644',
        type: 'blob',
      },
    ];
    expect(classifyFiles([hook], entries)).toEqual([
      { file: hook, kind: 'updated' },
    ]);

    const correct = [
      {
        path: hook.path,
        sha: gitBlobSha(hook.content),
        mode: '100755',
        type: 'blob',
      },
    ];
    expect(classifyFiles([hook], correct)).toEqual([
      { file: hook, kind: 'unchanged' },
    ]);
  });

  it('같은 경로의 디렉터리 항목은 비교 대상이 아니다', () => {
    const entries = [
      { path: file.path, sha: 'whatever', mode: '040000', type: 'tree' },
    ];
    expect(classifyFiles([file], entries)).toEqual([{ file, kind: 'added' }]);
  });
});
