import { describe, expect, it, vi } from 'vitest';
import {
  detectTitleStyle,
  styleFromTitles,
  styleFromWorkflow,
} from './pr-title-style.js';

/** `Expo-Form-Server`·`Expo-User-Server`·`Expo-Attendance-Server`의 제목 검사 (필수 체크). */
const SCOPED_WORKFLOW = `
on:
  pull_request:
    types: [opened, edited, synchronize, reopened]
jobs:
  pr-title:
    steps:
      - name: PR 제목 형식 검증
        run: |
          if [[ "$BASE_REF" == "main" && "$TITLE" =~ ^v[0-9]+\\.[0-9]+\\.[0-9]+$ ]]; then
            exit 0
          fi
          if [[ ! "$TITLE" =~ ^\\[(form|survey|json|global|ci/cd)\\]\\ .+ ]]; then
            echo "PR 제목은 '[scope] description' 형식이어야 합니다." >&2
            exit 1
          fi
`;

/** `Expo-Notification-Server`의 제목 검사: 범위 접두어를 금지한다. */
const PLAIN_WORKFLOW = `
on:
  pull_request:
    types: [opened, edited, synchronize, reopened]
jobs:
  pr-title:
    steps:
      - name: Validate PR title
        env:
          TITLE: \${{ github.event.pull_request.title }}
        run: |
          const title = process.env.TITLE;
          if (!title.trim() || [...title].length > 50 ||
              /[\\p{Cc}\\p{Extended_Pictographic}\\p{Emoji_Presentation}]|\\u20e3|^\\[[^\\]]+\\]/u.test(title)) {
            console.error('PR title must be a description of at most 50 characters, without a scope prefix, emojis, or control characters.');
          }
`;

describe('styleFromWorkflow', () => {
  it('허용 범위에 global이 있는 필수 형식은 scoped로 읽는다', () => {
    expect(styleFromWorkflow(SCOPED_WORKFLOW)).toBe('scoped');
  });

  it('접두어를 금지한다고 밝힌 검사는 plain으로 읽는다', () => {
    expect(styleFromWorkflow(PLAIN_WORKFLOW)).toBe('plain');
  });

  it('허용 범위에 global이 없으면 어떤 접두어가 통과할지 알 수 없어 모른다고 한다', () => {
    const text = SCOPED_WORKFLOW.replace('|global', '');
    expect(styleFromWorkflow(text)).toBeUndefined();
  });

  it('제목과 무관한 워크플로는 모른다고 한다', () => {
    expect(
      styleFromWorkflow('on: [push]\njobs:\n  build:\n    steps: []'),
    ).toBeUndefined();
  });

  it('PR 트리거가 아닌 파일은 제목 문구가 있어도 읽지 않는다', () => {
    expect(
      styleFromWorkflow('on: [push]\n# title without a scope prefix'),
    ).toBeUndefined();
  });

  it('릴리즈 제목(vX.Y.Z)만 검사하는 워크플로는 모른다고 한다', () => {
    const text =
      'on:\n  pull_request:\nrun: |\n  if [[ "$TITLE" =~ ^v[0-9]+\\.[0-9]+ ]]; then exit 0; fi';
    expect(styleFromWorkflow(text)).toBeUndefined();
  });
});

describe('styleFromTitles', () => {
  const scoped = ['[a] 하나', '[b] 둘', '[c] 셋', '[a] 넷', '[d] 다섯'];
  const plain = ['feat :: 하나', 'fix :: 둘', 'merge to main', '셋', '넷'];

  it('대부분이 [scope]로 시작하면 scoped', () => {
    expect(styleFromTitles(scoped)).toBe('scoped');
  });

  it('대부분 접두어가 없으면 plain', () => {
    expect(styleFromTitles(plain)).toBe('plain');
  });

  it('하네스가 보낸 PR은 세지 않는다', () => {
    const own = ['하네스 동기화 — 훅 2', '[global] 하네스 동기화 — 스킬 1'];
    expect(styleFromTitles([...own, ...plain])).toBe('plain');
    // 하네스 PR만 있으면 표본이 없는 것과 같다
    expect(styleFromTitles([...own, ...own, ...own])).toBeUndefined();
  });

  it('표본이 적으면 짐작하지 않는다', () => {
    expect(styleFromTitles(['[a] 하나', '[b] 둘'])).toBeUndefined();
  });
});

describe('detectTitleStyle', () => {
  /** 레포의 워크플로 파일(이름 → 내용)과 최근 PR 제목으로 octokit을 흉내 낸다. */
  function fakeOctokit(options: {
    workflows?: Record<string, string> | Error;
    titles?: string[] | Error;
  }) {
    const getContent = vi.fn(async ({ path }: { path: string }) => {
      const { workflows } = options;
      if (workflows instanceof Error) throw workflows;
      if (!workflows) {
        throw Object.assign(new Error('Not Found'), { status: 404 });
      }
      if (path === '.github/workflows') {
        return {
          data: Object.keys(workflows).map((name) => ({
            path: `.github/workflows/${name}`,
          })),
        };
      }
      const name = path.split('/').pop()!;
      return {
        data: {
          content: Buffer.from(workflows[name]).toString('base64'),
        },
      };
    });
    const list = vi.fn(async () => {
      if (options.titles instanceof Error) throw options.titles;
      return { data: (options.titles ?? []).map((title) => ({ title })) };
    });
    return {
      octokit: { rest: { repos: { getContent }, pulls: { list } } } as never,
      list,
    };
  }

  it('CI의 제목 검사를 최우선으로 따른다 — 최근 PR 제목이 반대여도', async () => {
    const { octokit, list } = fakeOctokit({
      workflows: { 'ci.yml': PLAIN_WORKFLOW },
      titles: ['[a] 1', '[a] 2', '[a] 3', '[a] 4', '[a] 5'],
    });
    expect(await detectTitleStyle(octokit, 'o', 'r')).toBe('plain');
    expect(list).not.toHaveBeenCalled();
  });

  it('필수 형식이 걸린 레포는 scoped', async () => {
    const { octokit } = fakeOctokit({
      workflows: { 'ci.yml': SCOPED_WORKFLOW, 'deploy.yml': 'on: [push]' },
    });
    expect(await detectTitleStyle(octokit, 'o', 'r')).toBe('scoped');
  });

  it('검사가 서로 어긋나면 정할 수 없어 최근 PR 제목으로 넘어간다', async () => {
    const { octokit } = fakeOctokit({
      workflows: { 'a.yml': SCOPED_WORKFLOW, 'b.yml': PLAIN_WORKFLOW },
      titles: ['x 1', 'x 2', 'x 3', 'x 4', 'x 5'],
    });
    expect(await detectTitleStyle(octokit, 'o', 'r')).toBe('plain');
  });

  it('검사가 없는 레포는 최근 PR 제목의 관례를 따른다', async () => {
    const { octokit } = fakeOctokit({
      workflows: { 'build.yml': 'on: [push]' },
      titles: ['feat :: 1', 'fix :: 2', '3', '4', '5'],
    });
    expect(await detectTitleStyle(octokit, 'o', 'r')).toBe('plain');
  });

  it('워크플로 디렉터리가 없는 레포도 최근 PR 제목으로 판단한다', async () => {
    const { octokit } = fakeOctokit({
      titles: ['[a] 1', '[b] 2', '[a] 3', '[c] 4', '[a] 5'],
    });
    expect(await detectTitleStyle(octokit, 'o', 'r')).toBe('scoped');
  });

  it('단서가 전혀 없으면 기본값 scoped', async () => {
    const { octokit } = fakeOctokit({ titles: [] });
    expect(await detectTitleStyle(octokit, 'o', 'r')).toBe('scoped');
  });

  it('읽다가 실패해도 던지지 않고 기본값을 돌려준다 (PR 생성을 막지 않는다)', async () => {
    const { octokit } = fakeOctokit({
      workflows: Object.assign(new Error('rate limited'), { status: 403 }),
    });
    expect(await detectTitleStyle(octokit, 'o', 'r')).toBe('scoped');
  });
});
