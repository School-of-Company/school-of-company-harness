import type { Octokit } from '@octokit/rest';
import type { CatalogItem } from '../catalog/catalog.types.js';
import { readCatalogFile, type CollectedFile } from './file-collector.js';

/**
 * Selecting any Claude/Codex hook module auto-pulls in that platform's dispatcher and
 * settings/hooks-wiring file. See .claude/rules/catalog.md "Catalog Item Dependency Rule".
 */
export async function resolveHookDependencies(
  octokit: Octokit,
  owner: string,
  repo: string,
  selectedItems: CatalogItem[],
): Promise<CollectedFile[]> {
  const files: CollectedFile[] = [];

  const hasClaudeHook = selectedItems.some(
    (item) => item.category === 'claude-hook',
  );
  if (hasClaudeHook) {
    files.push(
      {
        path: '.claude/hooks/preToolUse.sh',
        content: readCatalogFile('.claude/hooks/preToolUse.sh'),
      },
      {
        path: '.claude/hooks/postToolUse.sh',
        content: readCatalogFile('.claude/hooks/postToolUse.sh'),
      },
      await buildClaudeSettings(octokit, owner, repo),
    );
  }

  const hasCodexHook = selectedItems.some(
    (item) => item.category === 'codex-hook',
  );
  if (hasCodexHook) {
    files.push(
      {
        path: '.codex/hooks/dispatcher/pre-tool-use.sh',
        content: readCatalogFile('.codex/hooks/dispatcher/pre-tool-use.sh'),
      },
      {
        path: '.codex/hooks/dispatcher/post-tool-use.sh',
        content: readCatalogFile('.codex/hooks/dispatcher/post-tool-use.sh'),
      },
      {
        path: '.codex/hooks.json',
        content: readCatalogFile('.codex/hooks.json'),
      },
    );
  }

  return files;
}

async function buildClaudeSettings(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<CollectedFile> {
  let base: Record<string, unknown>;
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: '.claude/settings.json',
    });
    if (!('content' in data)) throw new Error('not a file');
    base = JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8'));
  } catch {
    base = JSON.parse(readCatalogFile('.claude/templates/settings-base.json'));
  }

  const hooksFragment = JSON.parse(
    readCatalogFile('.claude/templates/settings-hooks.json'),
  ) as { hooks: unknown };

  const merged = { ...base, hooks: hooksFragment.hooks };
  return {
    path: '.claude/settings.json',
    content: JSON.stringify(merged, null, 2),
  };
}
