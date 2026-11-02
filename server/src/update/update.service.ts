import { Inject, Injectable } from '@nestjs/common';
import type { Octokit } from '@octokit/rest';
import { CatalogService } from '../catalog/catalog.service.js';
import type { CatalogItem } from '../catalog/catalog.types.js';
import {
  INSTALLATION_TOKEN_MANAGER,
  type InstallationTokenManager,
} from '../installation-token/installation-token-manager.interface.js';
import { PrService } from '../pr/pr.service.js';
import { ReposService, type RegisteredRepo } from '../repos/repos.service.js';
import { findInstalledItems } from './installed-items.js';

export type UpdateStatus =
  /** 하네스 항목을 쓰고 있지 않은 레포 */
  | 'no-harness'
  /** 이미 열린 하네스 PR이 있어 건너뜀 */
  | 'open-pr'
  /** 쓰고 있는 항목이 모두 최신 */
  | 'up-to-date'
  /** (dry-run) 갱신할 내용이 있음 */
  | 'would-update'
  /** (--apply) PR을 만듦 */
  | 'created'
  /** 판단할 수 없어 건너뜀 (빈 레포, 파일 목록 잘림) */
  | 'skipped'
  | 'error';

export interface RepoUpdateResult {
  owner: string;
  repo: string;
  status: UpdateStatus;
  /** 건너뛴 이유, 오류 메시지, 열린 PR 번호 같은 부연. */
  detail?: string;
  /** 갱신 대상이 되는 항목 id. */
  items?: string[];
  fileCount?: number;
  url?: string;
}

export interface RunUpdateOptions {
  /** false면 아무것도 쓰지 않고 무엇이 바뀔지만 계산한다. */
  apply: boolean;
  /** `owner/repo` 목록. 주어지면 그 레포만 대상으로 한다. */
  only?: string[];
}

/**
 * 이미 하네스 항목을 쓰고 있는 레포들에 최신본을 PR로 보낸다.
 *
 * 새 상태나 새 저장소를 만들지 않는다. 레포 목록은 GitHub에서 읽고, "무엇을 쓰고 있는지"는 대상
 * 레포의 파일 목록에서 추론하고(`installed-items.ts`), "무엇이 바뀌는지"는 `POST /pr`과 같은
 * 변경 감지(`PrService.plan`)로 계산한다. 바뀐 것이 없는 레포에는 PR이 열리지 않는다.
 *
 * 이 서비스는 HTTP로 노출하지 않는다. 인증이 없는 공개 API에 "모든 레포에 한 번에 PR"을 열면
 * URL을 아는 누구나 전체 레포에 PR을 뿌릴 수 있어서, App 자격 증명이 있는 곳에서 사람이 CLI로만
 * 실행하게 했다 (`update-cli.ts`, `.claude/rules/server.md`).
 */
@Injectable()
export class UpdateService {
  constructor(
    @Inject(INSTALLATION_TOKEN_MANAGER)
    private readonly tokenManager: InstallationTokenManager,
    private readonly reposService: ReposService,
    private readonly catalogService: CatalogService,
    private readonly prService: PrService,
  ) {}

  /**
   * 레포 하나의 실패가 나머지를 막지 않도록 레포별로 결과를 모은다 — 수십 개를 도는 도중
   * 빈 레포 하나 때문에 전체가 멈추면 어디까지 처리됐는지 알 수 없어서다.
   * 순차로 도는 이유는 GitHub 요청 속도 제한과, 문제가 생겼을 때 로그를 따라가기 쉽게 하려는 것.
   */
  async run({ apply, only }: RunUpdateOptions): Promise<RepoUpdateResult[]> {
    const repos = (await this.reposService.listRepos()).filter(
      ({ owner, repo }) => !only || only.includes(`${owner}/${repo}`),
    );
    const catalog = this.catalogService.listItems();

    const results: RepoUpdateResult[] = [];
    for (const repo of repos) {
      results.push(
        await this.updateRepo(repo, catalog, apply).catch(
          (error: unknown): RepoUpdateResult => ({
            owner: repo.owner,
            repo: repo.repo,
            status: 'error',
            detail: error instanceof Error ? error.message : String(error),
          }),
        ),
      );
    }
    return results;
  }

  private async updateRepo(
    target: RegisteredRepo,
    catalog: CatalogItem[],
    apply: boolean,
  ): Promise<RepoUpdateResult> {
    const { owner, repo, installationId, defaultBranch } = target;
    const base = { owner, repo };
    const octokit = await this.tokenManager.getOctokit(installationId);

    const tree = await this.readTreePaths(octokit, target);
    if (tree.kind === 'empty') {
      return { ...base, status: 'skipped', detail: '커밋이 없는 빈 저장소' };
    }
    if (tree.kind === 'truncated') {
      // 잘린 목록으로 "설치된 항목 없음"이라고 판단하면 갱신이 필요한 레포를 조용히 놓친다.
      return {
        ...base,
        status: 'skipped',
        detail: '파일 목록이 너무 커서 사용 중인 항목을 판별할 수 없음',
      };
    }

    const installed = findInstalledItems(catalog, tree.paths);
    if (installed.length === 0) return { ...base, status: 'no-harness' };

    // 열린 하네스 PR이 있는데 또 열면 레포마다 PR이 쌓인다. 머지하거나 닫은 뒤 다시 실행한다.
    const openPr = await this.findOpenHarnessPr(octokit, target);
    if (openPr) {
      return {
        ...base,
        status: 'open-pr',
        detail: `#${openPr.number}`,
        url: openPr.url,
      };
    }

    const plan = await this.prService.plan({
      owner,
      repo,
      installationId,
      baseBranch: defaultBranch,
      itemIds: installed.map((item) => item.id),
    });
    if (plan.files.length === 0) return { ...base, status: 'up-to-date' };

    // dispatcher·settings.json처럼 훅이 끌고 오는 파일만 바뀐 경우, 바뀐 "항목"은 없는데 올릴
    // 파일은 있다. 그대로 열면 PR 제목이 비므로 그 변경을 일으킨 훅 항목을 갱신 대상으로 본다.
    const hooks = installed.filter((item) => item.category.endsWith('-hook'));
    const effective =
      plan.changedItems.length > 0
        ? plan
        : {
            ...plan,
            changedItems: hooks,
            upToDateItems: plan.upToDateItems.filter(
              (item) => !hooks.includes(item),
            ),
          };

    const summary = {
      ...base,
      items: effective.changedItems.map((item) => item.id),
      fileCount: plan.files.length,
    };
    if (!apply) return { ...summary, status: 'would-update' };

    const { url } = await this.prService.open(effective, { update: true });
    return { ...summary, status: 'created', url };
  }

  /**
   * 기본 브랜치의 파일 경로 목록. `getTree`는 브랜치 이름을 그대로 받아서 한 번의 호출로 끝난다.
   * 409는 커밋이 없는 레포다.
   */
  private async readTreePaths(
    octokit: Octokit,
    { owner, repo, defaultBranch }: RegisteredRepo,
  ): Promise<
    { kind: 'ok'; paths: string[] } | { kind: 'empty' } | { kind: 'truncated' }
  > {
    try {
      const tree = await octokit.rest.git.getTree({
        owner,
        repo,
        tree_sha: defaultBranch,
        recursive: 'true',
      });
      if (tree.data.truncated) return { kind: 'truncated' };
      return {
        kind: 'ok',
        paths: tree.data.tree
          .filter((entry) => entry.type === 'blob' && entry.path)
          .map((entry) => entry.path!),
      };
    } catch (error) {
      if ((error as { status?: number }).status === 409) {
        return { kind: 'empty' };
      }
      throw error;
    }
  }

  /** 최근 100개의 열린 PR 중 하네스가 만든 브랜치(`harness/*`)에서 온 것. */
  private async findOpenHarnessPr(
    octokit: Octokit,
    { owner, repo }: RegisteredRepo,
  ): Promise<{ number: number; url: string } | undefined> {
    const prs = await octokit.rest.pulls.list({
      owner,
      repo,
      state: 'open',
      per_page: 100,
    });
    const found = prs.data.find(
      (pr) =>
        pr.head.ref.startsWith('harness/') &&
        pr.head.repo?.full_name === `${owner}/${repo}`,
    );
    return found && { number: found.number, url: found.html_url };
  }
}
