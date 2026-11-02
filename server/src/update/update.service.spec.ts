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
  /** 레포 이름 → 그 레포에 있는 (기본 브랜치 외의) 브랜치. `getBranch` 응답을 정한다. */
  branches?: Record<string, string[] | Error>;
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
      repos: {
        getBranch: vi.fn(
          async ({ repo, branch }: { repo: string; branch: string }) => {
            const found = options.branches?.[repo];
            if (found instanceof Error) throw found;
            if (found?.includes(branch)) return { data: { name: branch } };
            throw Object.assign(new Error('Branch not found'), { status: 404 });
          },
        ),
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

  describe('--base', () => {
    const withTree = (extra: object = {}) => ({
      repos: [repoOf('a')],
      trees: { a: treeOf('.claude/skills/test/SKILL.md') },
      plan: planOf({ files: [{ path: 'x', content: 'y' }] as never }),
      ...extra,
    });

    it('그 브랜치가 있는 레포는 그것을 읽고 그것을 향해 PR을 만든다', async () => {
      const { service, octokit, prService } = setup(
        withTree({ branches: { a: ['develop'] } }),
      );
      const [result] = await service.run({ apply: true, base: 'develop' });
      expect(result.status).toBe('created');
      expect(result.baseBranch).toBe('develop');
      expect(octokit.rest.git.getTree).toHaveBeenCalledWith(
        expect.objectContaining({ tree_sha: 'develop' }),
      );
      expect(prService.plan).toHaveBeenCalledWith(
        expect.objectContaining({ baseBranch: 'develop' }),
      );
    });

    it('그 브랜치가 없는 레포는 기본 브랜치로 되돌아가지 않고 건너뛴다', async () => {
      const { service, octokit, prService } = setup(withTree());
      const [result] = await service.run({ apply: true, base: 'develop' });
      expect(result.status).toBe('skipped');
      expect(result.detail).toBe('develop 브랜치가 없음');
      // 기본 브랜치(대개 배포 브랜치)로 PR이 열리거나 그 트리를 읽는 일이 없어야 한다
      expect(octokit.rest.git.getTree).not.toHaveBeenCalled();
      expect(prService.plan).not.toHaveBeenCalled();
      expect(prService.open).not.toHaveBeenCalled();
    });

    it('기본 브랜치와 같은 이름을 지정하면 조회 없이 그대로 쓴다', async () => {
      const { service, octokit } = setup(withTree());
      const [result] = await service.run({ apply: false, base: 'main' });
      expect(result.baseBranch).toBe('main');
      expect(octokit.rest.repos.getBranch).not.toHaveBeenCalled();
    });

    it('404가 아닌 오류는 기본 브랜치로 넘기지 않고 오류로 보고한다', async () => {
      const { service, prService } = setup(
        withTree({
          branches: {
            a: Object.assign(new Error('rate limited'), { status: 403 }),
          },
        }),
      );
      const [result] = await service.run({ apply: true, base: 'develop' });
      expect(result.status).toBe('error');
      expect(result.detail).toBe('rate limited');
      expect(prService.open).not.toHaveBeenCalled();
    });

    it('지정하지 않으면 브랜치를 조회하지 않고 기본 브랜치를 쓴다', async () => {
      const { service, octokit } = setup(withTree());
      const [result] = await service.run({ apply: false });
      expect(result.baseBranch).toBe('main');
      expect(octokit.rest.repos.getBranch).not.toHaveBeenCalled();
    });
  });
});
