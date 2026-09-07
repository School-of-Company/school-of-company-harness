import type { Octokit } from '@octokit/rest';
import type { CatalogItem } from '../catalog/catalog.types.js';
import { readCatalogFile, type CollectedFile } from './file-collector.js';
import { mergeClaudeSettings } from './settings-merge.js';

/**
 * 훅 모듈은 혼자서는 동작하지 않는다 — 세 조각이 다 있어야 한다:
 *
 * 1. **모듈** (`.claude/hooks/modules/eslint/postToolUse.sh`) — 실제로 할 일
 * 2. **dispatcher** (`.claude/hooks/preToolUse.sh`, `postToolUse.sh`) — `modules/*` 를 순회 실행하는 라우터
 * 3. **wiring** (`.claude/settings.json`의 `hooks` 키) — Claude Code에게 "도구 호출 시 dispatcher를
 *    실행하라"고 알려주는 설정
 *
 * 사용자는 1번(기능)만 체크하면 되고, 2·3번은 여기서 자동으로 채워 넣는다. 웹 UI에 dispatcher와
 * settings.json을 체크박스로 노출하지 않는 이유도 이것 (`.claude/rules/catalog.md` 참고).
 *
 * Claude와 Codex는 훅 시스템이 완전히 독립적이다 — 파일 경로, 파일명 규칙(camelCase vs
 * kebab-case), wiring 파일(`settings.json` vs `hooks.json`)이 모두 다르므로 각각 따로 처리한다.
 */
export async function resolveHookDependencies(
  octokit: Octokit,
  owner: string,
  repo: string,
  selectedItems: CatalogItem[],
  catalogRoot: string,
): Promise<CollectedFile[]> {
  const files: CollectedFile[] = [];

  const hasClaudeHook = selectedItems.some(
    (item) => item.category === 'claude-hook',
  );
  if (hasClaudeHook) {
    files.push(
      {
        path: '.claude/hooks/preToolUse.sh',
        content: readCatalogFile('.claude/hooks/preToolUse.sh', catalogRoot),
      },
      {
        path: '.claude/hooks/postToolUse.sh',
        content: readCatalogFile('.claude/hooks/postToolUse.sh', catalogRoot),
      },
      await buildClaudeSettings(octokit, owner, repo, catalogRoot),
    );
  }

  const hasCodexHook = selectedItems.some(
    (item) => item.category === 'codex-hook',
  );
  if (hasCodexHook) {
    files.push(
      {
        path: '.codex/hooks/dispatcher/pre-tool-use.sh',
        content: readCatalogFile('.codex/hooks/dispatcher/pre-tool-use.sh', catalogRoot),
      },
      {
        path: '.codex/hooks/dispatcher/post-tool-use.sh',
        content: readCatalogFile('.codex/hooks/dispatcher/post-tool-use.sh', catalogRoot),
      },
      // Codex의 wiring 파일은 프로젝트별로 달라질 부분이 없는 고정 내용이라 그대로 복사한다.
      {
        path: '.codex/hooks.json',
        content: readCatalogFile('.codex/hooks.json', catalogRoot),
      },
    );
  }

  return files;
}

/**
 * `.claude/settings.json`은 다른 항목처럼 통째로 복사하면 **안 되는** 유일한 파일이다.
 *
 * 대상 레포가 이미 자기만의 `permissions`, `enabledPlugins` 같은 설정을 갖고 있을 수 있는데,
 * 우리 템플릿으로 덮어쓰면 그게 전부 날아간다. 그래서:
 *
 * 1. 대상 레포의 기존 `.claude/settings.json`을 먼저 읽어 base로 삼는다
 *    (`getContent`는 파일 내용을 base64로 주기 때문에 디코딩이 필요하다)
 * 2. 파일이 없으면(404) 우리 `settings-base.json` 템플릿을 base로 쓴다
 * 3. base의 `hooks`에 우리 `settings-hooks.json` 조각을 **항목 단위로 더한다**
 *    (`mergeClaudeSettings` — 교체가 아니라 append + 중복 제거)
 *
 * 3번이 얕은 병합이면 안 되는 이유는 `settings-merge.ts`에 적어 두었다: `hooks` 키를 통째로
 * 갈아끼우면 대상 레포가 직접 넣은 훅 항목이 조용히 사라진다.
 */
async function buildClaudeSettings(
  octokit: Octokit,
  owner: string,
  repo: string,
  catalogRoot: string,
): Promise<CollectedFile> {
  let base: Record<string, unknown>;
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: '.claude/settings.json',
    });
    // 경로가 디렉터리면 `content`가 없다 — 그 경우도 템플릿 폴백으로 넘긴다.
    if (!('content' in data)) throw new Error('not a file');
    base = JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8'));
  } catch {
    base = JSON.parse(readCatalogFile('.claude/templates/settings-base.json', catalogRoot));
  }

  const hooksFragment = JSON.parse(
    readCatalogFile('.claude/templates/settings-hooks.json', catalogRoot),
  ) as { hooks?: unknown };

  const merged = mergeClaudeSettings(base, hooksFragment);
  return {
    path: '.claude/settings.json',
    content: JSON.stringify(merged, null, 2),
  };
}
