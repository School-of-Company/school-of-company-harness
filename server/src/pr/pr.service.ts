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
import type { CreatePrRequest, CreatePrResponse } from './pr.dto.js';

@Injectable()
export class PrService {
  constructor(
    @Inject(INSTALLATION_TOKEN_MANAGER)
    private readonly tokenManager: InstallationTokenManager,
    private readonly catalogService: CatalogService,
  ) {}

  async createPr(request: CreatePrRequest): Promise<CreatePrResponse> {
    const { owner, repo, installationId, baseBranch, itemIds } = request;

    const catalog = this.catalogService.listItems();
    const selectedItems = itemIds.map((id) => {
      const item = catalog.find((candidate) => candidate.id === id);
      if (!item) throw new Error(`Unknown catalog item: ${id}`);
      return item;
    });

    const octokit = await this.tokenManager.getOctokit(installationId);

    const files: CollectedFile[] = [
      ...selectedItems.flatMap((item) => collectFiles(item)),
      ...(await resolveHookDependencies(octokit, owner, repo, selectedItems)),
    ];

    const baseRef = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${baseBranch}`,
    });
    const baseCommit = await octokit.rest.git.getCommit({
      owner,
      repo,
      commit_sha: baseRef.data.object.sha,
    });

    const newTree = await octokit.rest.git.createTree({
      owner,
      repo,
      base_tree: baseCommit.data.tree.sha,
      tree: files.map((file) => ({
        path: file.path,
        mode: '100644' as const,
        type: 'blob' as const,
        content: file.content,
      })),
    });

    const newCommit = await octokit.rest.git.createCommit({
      owner,
      repo,
      message: buildCommitMessage(selectedItems),
      tree: newTree.data.sha,
      parents: [baseRef.data.object.sha],
    });

    const branchName = `harness/${Date.now()}`;
    await octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branchName}`,
      sha: newCommit.data.sha,
    });

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

function buildPrTitle(items: CatalogItem[]): string {
  return `[HARNESS] ${items.length}개 항목 추가`;
}
