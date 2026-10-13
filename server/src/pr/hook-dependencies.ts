import { BadGatewayException, ConflictException } from '@nestjs/common';
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
        content: readCatalogFile(
          '.codex/hooks/dispatcher/pre-tool-use.sh',
          catalogRoot,
        ),
      },
      {
        path: '.codex/hooks/dispatcher/post-tool-use.sh',
        content: readCatalogFile(
          '.codex/hooks/dispatcher/post-tool-use.sh',
          catalogRoot,
        ),
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
export async function buildClaudeSettings(
  octokit: Octokit,
  owner: string,
  repo: string,
  catalogRoot: string,
): Promise<CollectedFile> {
  const existing = await fetchExistingSettings(octokit, owner, repo);
  const base: Record<string, unknown> =
    existing ??
    JSON.parse(
      readCatalogFile('.claude/templates/settings-base.json', catalogRoot),
    );

  const hooksFragment = JSON.parse(
    readCatalogFile('.claude/templates/settings-hooks.json', catalogRoot),
  ) as { hooks?: unknown };

  const merged = mergeClaudeSettings(base, hooksFragment);
  return {
    path: '.claude/settings.json',
    content: JSON.stringify(merged, null, 2),
  };
}

/**
 * 대상 레포의 `.claude/settings.json`을 읽는다. 없으면(404) `undefined` — 호출자가 템플릿으로 시작한다.
 *
 * **404만 "없음"으로 취급한다.** 예전에는 모든 에러를 템플릿 폴백으로 처리했는데, 403·429·타임아웃이나
 * 깨진 JSON에서도 템플릿이 base가 되어 대상 레포의 기존 `permissions` 등이 PR에서 조용히 덮어써졌다.
 * 읽지 못한 것과 없는 것은 다르므로, 읽지 못했다면 PR을 만들지 않고 사유를 알린다.
 */
async function fetchExistingSettings(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<Record<string, unknown> | undefined> {
  const path = '.claude/settings.json';
  let data: Awaited<ReturnType<Octokit['rest']['repos']['getContent']>>['data'];
  try {
    ({ data } = await octokit.rest.repos.getContent({ owner, repo, path }));
  } catch (error: unknown) {
    if ((error as { status?: number }).status === 404) return undefined;
    throw new BadGatewayException(
      `${owner}/${repo}의 ${path}를 읽지 못했습니다. 기존 설정을 덮어쓸 수 있어 PR을 만들지 않았습니다. 잠시 후 다시 시도하세요.`,
    );
  }

  // 디렉터리(배열 응답)·심볼릭 링크 등 일반 파일이 아니면 병합할 대상이 없다.
  if (Array.isArray(data) || !('content' in data)) {
    throw new ConflictException(
      `${owner}/${repo}의 ${path}가 일반 파일이 아닙니다. 확인 후 다시 시도하세요.`,
    );
  }

  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(data.content, 'base64').toString('utf-8'),
    );
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      throw new Error('not an object');
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new ConflictException(
      `${owner}/${repo}의 ${path}가 올바른 JSON 객체가 아닙니다. 병합하면 기존 설정이 사라질 수 있어 PR을 만들지 않았습니다. 파일을 고친 뒤 다시 시도하세요.`,
    );
  }
}
