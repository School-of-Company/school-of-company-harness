import { describe, expect, it, vi } from 'vitest';
import type { CatalogItem } from '../catalog/catalog.types.js';
import type { PrPlan } from '../pr/pr.service.js';
import type { RegisteredRepo } from '../repos/repos.service.js';
import { UpdateService } from './update.service.js';

const skill: CatalogItem = {
  id: 'claude/skills/test',
  category: 'claude-skill',
  title: 'test',
  path: '.claude/skills/test/',
};
const hook: CatalogItem = {
  id: 'claude/hooks/secret-guard',
  category: 'claude-hook',
  title: 'secret-guard',
  path: '.claude/hooks/modules/secret-guard/',
};
const catalog = [skill, hook];

const repoOf = (name: string): RegisteredRepo => ({
  owner: 'School-of-Company',
  repo: name,
  installationId: 1,
  defaultBranch: 'main',
});

const treeOf = (...paths: string[]) => ({
  data: {
    truncated: false,
    tree: paths.map((path) => ({ type: 'blob', path })),
  },
});

const planOf = (overrides: Partial<PrPlan>): PrPlan =>
  ({
    files: [],
    changedItems: [],
    upToDateItems: [],
    sharedByItem: new Map(),
    ...overrides,
  }) as PrPlan;

/** 레포 이름 → 그 레포의 getTree 응답/오류. 나머지 의존성은 기본값으로 채운다. */
function setup(options: {
  repos: RegisteredRepo[];
  trees: Record<string, ReturnType<typeof treeOf> | Error>;
  openPrs?: Record<
    string,
    {
      head: { ref: string; repo: { full_name: string } };
      number: number;
      html_url: string;
    }[]
  >;
  plan?: PrPlan;
}) {
  const octokit = {
    rest: {
      git: {
        getTree: vi.fn(async ({ repo }: { repo: string }) => {
          const tree = options.trees[repo];
          if (tree instanceof Error) throw tree;
          return tree;
        }),
      },
      pulls: {
        list: vi.fn(async ({ repo }: { repo: string }) => ({
          data: options.openPrs?.[repo] ?? [],
        })),
      },
    },
  };
  const prService = {
    plan: vi.fn(async () => options.plan ?? planOf({})),
    open: vi.fn(async () => ({ url: 'https://github.com/org/x/pull/9' })),
  };
  const service = new UpdateService(
    {
      getOctokit: async () => octokit,
      getAppOctokit: async () => octokit,
    } as never,
    { listRepos: async () => options.repos } as never,
    { listItems: () => catalog } as never,
    prService as never,
  );
  return { service, prService, octokit };
}

describe('UpdateService.run', () => {
  it('하네스 항목이 없는 레포는 plan을 부르지 않고 건너뛴다', async () => {
    const { service, prService } = setup({
      repos: [repoOf('a')],
      trees: { a: treeOf('src/main.ts') },
    });
    const [result] = await service.run({ apply: true });
    expect(result.status).toBe('no-harness');
    expect(prService.plan).not.toHaveBeenCalled();
  });

  it('열린 하네스 PR이 있으면 새 PR을 만들지 않는다', async () => {
    const { service, prService } = setup({
      repos: [repoOf('a')],
      trees: { a: treeOf('.claude/skills/test/SKILL.md') },
      openPrs: {
        a: [
          {
            number: 7,
            html_url: 'https://github.com/org/a/pull/7',
            head: {
              ref: 'harness/123',
              repo: { full_name: 'School-of-Company/a' },
            },
          },
        ],
      },
    });
    const [result] = await service.run({ apply: true });
    expect(result).toMatchObject({ status: 'open-pr', detail: '#7' });
    expect(prService.open).not.toHaveBeenCalled();
  });

  it('사람이 만든 열린 PR은 하네스 PR로 보지 않는다', async () => {
    const { service, prService } = setup({
      repos: [repoOf('a')],
      trees: { a: treeOf('.claude/skills/test/SKILL.md') },
      openPrs: {
        a: [
          {
            number: 3,
            html_url: 'https://github.com/org/a/pull/3',
            head: {
              ref: 'feat/login',
              repo: { full_name: 'School-of-Company/a' },
            },
          },
        ],
      },
    });
    await service.run({ apply: false });
    expect(prService.plan).toHaveBeenCalled();
  });

  it('올릴 파일이 없으면 최신으로 보고 PR을 만들지 않는다', async () => {
    const { service, prService } = setup({
      repos: [repoOf('a')],
      trees: { a: treeOf('.claude/skills/test/SKILL.md') },
      plan: planOf({ files: [] }),
    });
    const [result] = await service.run({ apply: true });
    expect(result.status).toBe('up-to-date');
    expect(prService.open).not.toHaveBeenCalled();
  });

  it('dry-run은 갱신 대상만 알려주고 PR을 만들지 않는다', async () => {
    const { service, prService } = setup({
      repos: [repoOf('a')],
      trees: { a: treeOf('.claude/skills/test/SKILL.md') },
      plan: planOf({
        files: [{ path: '.claude/skills/test/SKILL.md', content: 'x' }],
        changedItems: [skill],
      }),
    });
    const [result] = await service.run({ apply: false });
    expect(result).toMatchObject({
      status: 'would-update',
      items: ['claude/skills/test'],
      fileCount: 1,
    });
    expect(prService.open).not.toHaveBeenCalled();
  });

  it('--apply면 update 옵션으로 PR을 만들고 URL을 돌려준다', async () => {
    const { service, prService } = setup({
      repos: [repoOf('a')],
      trees: { a: treeOf('.claude/skills/test/SKILL.md') },
      plan: planOf({
        files: [{ path: '.claude/skills/test/SKILL.md', content: 'x' }],
        changedItems: [skill],
      }),
    });
    const [result] = await service.run({ apply: true });
    expect(result).toMatchObject({
      status: 'created',
      url: 'https://github.com/org/x/pull/9',
    });
    expect(prService.open).toHaveBeenCalledWith(expect.anything(), {
      update: true,
    });
  });

  it('훅의 dispatcher만 바뀐 경우 설치된 훅을 갱신 대상으로 삼는다', async () => {
    const { service, prService } = setup({
      repos: [repoOf('a')],
      trees: {
        a: treeOf('.claude/hooks/modules/secret-guard/preToolUse.sh'),
      },
      plan: planOf({
        files: [{ path: '.claude/hooks/preToolUse.sh', content: 'x' }],
        changedItems: [],
        upToDateItems: [hook],
      }),
    });
    const [result] = await service.run({ apply: true });
    expect(result.items).toEqual(['claude/hooks/secret-guard']);
    // 제목·본문이 비지 않도록 open에는 훅이 changedItems로 들어가고, "이미 최신" 목록에선 빠진다
    expect(prService.open).toHaveBeenCalledWith(
      expect.objectContaining({ changedItems: [hook], upToDateItems: [] }),
      { update: true },
    );
  });

  it('빈 저장소는 오류가 아니라 건너뜀으로 보고한다', async () => {
    const empty = Object.assign(new Error('Git Repository is empty.'), {
      status: 409,
    });
    const { service } = setup({
      repos: [repoOf('a')],
      trees: { a: empty },
    });
    const [result] = await service.run({ apply: true });
    expect(result).toMatchObject({ status: 'skipped' });
  });

  it('파일 목록이 잘리면 "미사용"이 아니라 건너뜀으로 보고한다', async () => {
    const { service } = setup({
      repos: [repoOf('a')],
      trees: { a: { data: { truncated: true, tree: [] } } },
    });
    const [result] = await service.run({ apply: true });
    expect(result.status).toBe('skipped');
  });

  it('한 레포가 실패해도 나머지 레포를 계속 처리한다', async () => {
    const { service } = setup({
      repos: [repoOf('broken'), repoOf('fine')],
      trees: {
        broken: new Error('boom'),
        fine: treeOf('src/main.ts'),
      },
    });
    const results = await service.run({ apply: true });
    expect(results.map((r) => [r.repo, r.status])).toEqual([
      ['broken', 'error'],
      ['fine', 'no-harness'],
    ]);
    expect(results[0].detail).toBe('boom');
  });

  it('--only로 지정한 레포만 처리한다', async () => {
    const { service, octokit } = setup({
      repos: [repoOf('a'), repoOf('b')],
      trees: { a: treeOf('x'), b: treeOf('x') },
    });
    const results = await service.run({
      apply: false,
      only: ['School-of-Company/b'],
    });
    expect(results.map((r) => r.repo)).toEqual(['b']);
    expect(octokit.rest.git.getTree).toHaveBeenCalledTimes(1);
  });

  it('카탈로그 원본 레포는 --only로 지정해도 대상에서 뺀다', async () => {
    const source: RegisteredRepo = {
      ...repoOf('school-of-company-harness'),
      owner: 'School-of-Company',
    };
    const { service, octokit } = setup({
      repos: [source],
      trees: {
        'school-of-company-harness': treeOf('.claude/skills/test/SKILL.md'),
      },
    });
    const results = await service.run({
      apply: true,
      only: ['School-of-Company/school-of-company-harness'],
    });
    expect(results).toEqual([]);
    expect(octokit.rest.git.getTree).not.toHaveBeenCalled();
  });

  describe('다른 계정의 레포', () => {
    const personal: RegisteredRepo = { ...repoOf('mine'), owner: 'someone' };

    it('--only가 없으면 원본 레포와 같은 계정의 레포만 대상으로 한다', async () => {
      const { service, octokit } = setup({
        repos: [repoOf('a'), personal],
        trees: { a: treeOf('x'), mine: treeOf('x') },
      });
      const results = await service.run({ apply: true });
      expect(results.map((r) => `${r.owner}/${r.repo}`)).toEqual([
        'School-of-Company/a',
      ]);
      expect(octokit.rest.git.getTree).toHaveBeenCalledTimes(1);
    });

    it('사람이 --only로 이름을 적으면 그대로 처리한다', async () => {
      const { service } = setup({
        repos: [repoOf('a'), personal],
        trees: { a: treeOf('x'), mine: treeOf('x') },
      });
      const results = await service.run({
        apply: false,
        only: ['someone/mine'],
      });
      expect(results.map((r) => `${r.owner}/${r.repo}`)).toEqual([
        'someone/mine',
      ]);
    });
  });
});
