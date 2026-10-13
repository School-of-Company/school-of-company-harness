import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Octokit } from '@octokit/rest';
import { describe, expect, it } from 'vitest';
import { buildClaudeSettings } from './hook-dependencies.js';

function catalogRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'catalog-'));
  mkdirSync(join(root, '.claude/templates'), { recursive: true });
  writeFileSync(
    join(root, '.claude/templates/settings-base.json'),
    JSON.stringify({ permissions: { allow: ['template'] } }),
  );
  writeFileSync(
    join(root, '.claude/templates/settings-hooks.json'),
    JSON.stringify({ hooks: {} }),
  );
  return root;
}

function octokitWith(getContent: () => Promise<unknown>): Octokit {
  return { rest: { repos: { getContent } } } as unknown as Octokit;
}

const encode = (value: string) => ({
  data: { content: Buffer.from(value).toString('base64') },
});

describe('buildClaudeSettings', () => {
  it('대상 레포의 기존 설정을 base로 유지한다', async () => {
    const octokit = octokitWith(async () =>
      encode(JSON.stringify({ permissions: { allow: ['mine'] } })),
    );
    const file = await buildClaudeSettings(octokit, 'o', 'r', catalogRoot());
    expect(JSON.parse(file.content).permissions.allow).toEqual(['mine']);
  });

  it('404면 템플릿으로 시작한다', async () => {
    const octokit = octokitWith(async () => {
      throw Object.assign(new Error('Not Found'), { status: 404 });
    });
    const file = await buildClaudeSettings(octokit, 'o', 'r', catalogRoot());
    expect(JSON.parse(file.content).permissions.allow).toEqual(['template']);
  });

  it.each([403, 429, 500, undefined])(
    '읽기 실패(status=%s)는 템플릿으로 덮지 않고 던진다',
    async (status) => {
      const octokit = octokitWith(async () => {
        throw Object.assign(new Error('boom'), { status });
      });
      await expect(
        buildClaudeSettings(octokit, 'o', 'r', catalogRoot()),
      ).rejects.toThrow('PR을 만들지 않았습니다');
    },
  );

  it('깨진 JSON은 템플릿으로 덮지 않고 던진다', async () => {
    const octokit = octokitWith(async () => encode('{ not json'));
    await expect(
      buildClaudeSettings(octokit, 'o', 'r', catalogRoot()),
    ).rejects.toThrow('올바른 JSON 객체가 아닙니다');
  });

  it('디렉터리(배열 응답)면 던진다', async () => {
    const octokit = octokitWith(async () => ({ data: [] }));
    await expect(
      buildClaudeSettings(octokit, 'o', 'r', catalogRoot()),
    ).rejects.toThrow('일반 파일이 아닙니다');
  });
});
