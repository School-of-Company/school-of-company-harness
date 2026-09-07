import { Inject, Injectable } from '@nestjs/common';
import {
  INSTALLATION_TOKEN_MANAGER,
  type InstallationTokenManager,
} from '../installation-token/installation-token-manager.interface.js';
import { CatalogService } from '../catalog/catalog.service.js';
import type { CatalogItem } from '../catalog/catalog.types.js';
import { collectFiles, type CollectedFile } from './file-collector.js';
import { resolveHookDependencies } from './hook-dependencies.js';
import { buildPrBody } from './pr-body.js';
import { CreatePrRequestDto, CreatePrResponseDto } from './pr.dto.js';

@Injectable()
export class PrService {
  constructor(
    @Inject(INSTALLATION_TOKEN_MANAGER)
    private readonly tokenManager: InstallationTokenManager,
    private readonly catalogService: CatalogService,
  ) {}

  /**
   * 선택된 카탈로그 항목들을 대상 레포에 PR로 올린다.
   *
   * ## git의 내부 데이터 모델
   *
   * git은 커밋을 "파일 목록의 스냅샷"으로 저장한다. 구성 요소는 네 가지다:
   * - **blob**: 파일 하나의 내용 (파일명은 모름, 내용만)
   * - **tree**: 디렉터리 하나 — "이름 → blob/tree" 매핑 목록
   * - **commit**: tree 하나(전체 스냅샷) + 부모 커밋 + 메시지
   * - **ref**: 브랜치 — 특정 커밋을 가리키는 이름표(`refs/heads/main`)
   *
   * 그래서 "브랜치에 파일 여러 개를 한 커밋으로 올리기"는 아래 순서가 된다:
   *
   * 1. `getRef`로 base 브랜치가 가리키는 커밋 SHA를 얻는다
   * 2. `getCommit`으로 그 커밋의 tree SHA(= 현재 전체 파일 스냅샷)를 얻는다
   * 3. `createTree`에 `base_tree`로 그 SHA를 주고, 바꾸려는 파일만 나열한다
   *    → git이 "기존 스냅샷 + 이 파일들만 교체"된 새 tree를 만들어준다.
   *    **이게 "선택한 파일만 건드린다"는 규칙이 자동으로 지켜지는 이유다** — 나열하지 않은
   *    파일은 base_tree에서 그대로 상속되므로 손댈 방법 자체가 없다.
   * 4. `createCommit`으로 새 tree를 가리키는 커밋을 만든다 (부모 = 1번의 SHA)
   * 5. `createRef`로 그 커밋을 가리키는 새 브랜치를 만든다
   * 6. `pulls.create`로 그 브랜치 → base 브랜치 PR을 연다
   *
   * `createTree`에 `content`를 직접 넘기면 blob 생성(3-1단계)을 GitHub이 알아서 처리해주기 때문에,
   * 파일마다 `createBlob`을 따로 호출할 필요가 없다.
   *
   * 참고: 파일 하나만 올릴 거라면 `repos.createOrUpdateFileContents` 한 번으로 끝나지만,
   * 그건 호출당 커밋 하나가 생긴다. 여기선 여러 파일을 **한 커밋**으로 묶어야 해서 저수준
   * git data API를 쓴다.
   */
  async createPr(dto: CreatePrRequestDto): Promise<CreatePrResponseDto> {
    const { owner, repo, installationId, baseBranch, itemIds } = dto;

    // 웹에서 넘어온 id를 실제 카탈로그 항목으로 해석한다. 모르는 id는 그냥 throw
    // (`.claude/rules/server.md` — 방어 로직 없이 예외를 던지는 정책).
    const catalogRoot = this.catalogService.getCatalogRoot();
    const catalog = this.catalogService.listItems();
    const selectedItems = itemIds.map((id) => {
      const item = catalog.find((candidate) => candidate.id === id);
      if (!item) throw new Error(`Unknown catalog item: ${id}`);
      return item;
    });

    const octokit = await this.tokenManager.getOctokit(installationId);

    // 사용자가 고른 항목의 파일들 + 훅을 골랐을 때 자동으로 딸려오는 dispatcher/settings.json
    const files: CollectedFile[] = [
      ...selectedItems.flatMap((item) => collectFiles(item, catalogRoot)),
      ...(await resolveHookDependencies(
        octokit,
        owner,
        repo,
        selectedItems,
        catalogRoot,
      )),
    ];

    // 1) base 브랜치가 가리키는 커밋 SHA
    const baseRef = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${baseBranch}`,
    });
    // 2) 그 커밋의 tree SHA — 현재 레포 전체 파일 스냅샷
    const baseCommit = await octokit.rest.git.getCommit({
      owner,
      repo,
      commit_sha: baseRef.data.object.sha,
    });

    // 3) 기존 스냅샷 위에 우리 파일만 얹은 새 tree
    const newTree = await octokit.rest.git.createTree({
      owner,
      repo,
      base_tree: baseCommit.data.tree.sha,
      tree: files.map((file) => ({
        path: file.path,
        mode: '100644' as const, // 일반 파일 (실행 권한이 필요하면 '100755')
        type: 'blob' as const,
        content: file.content, // 내용을 직접 주면 blob 생성은 GitHub이 대신 처리
      })),
    });

    // 4) 새 tree를 가리키는 커밋 (부모는 base 브랜치의 마지막 커밋)
    const newCommit = await octokit.rest.git.createCommit({
      owner,
      repo,
      message: buildCommitMessage(selectedItems),
      tree: newTree.data.sha,
      parents: [baseRef.data.object.sha],
    });

    // 5) 그 커밋을 가리키는 새 브랜치. 타임스탬프를 붙여 실행마다 유일한 이름을 만들어,
    //    같은 레포에 여러 번 실행해도 브랜치 이름이 충돌하지 않는다.
    const branchName = `harness/${Date.now()}`;
    await octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branchName}`,
      sha: newCommit.data.sha,
    });

    // 6) PR 오픈
    const pr = await octokit.rest.pulls.create({
      owner,
      repo,
      title: buildPrTitle(selectedItems),
      head: branchName,
      base: baseBranch,
      body: buildPrBody(selectedItems),
    });

    return { url: pr.data.html_url };
  }
}

function buildCommitMessage(items: CatalogItem[]): string {
  return `chore(harness): ${items.length}개 항목 추가`;
}

/** 대상 레포용 PR 제목 — 고정 스코프 `[GLOBAL]` (`.claude/rules/catalog.md` 참고). */
function buildPrTitle(items: CatalogItem[]): string {
  return `[GLOBAL] ${items.length}개 항목 추가`;
}
