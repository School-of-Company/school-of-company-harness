import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import type { CatalogItem } from '../catalog/catalog.types.js';

export interface CollectedFile {
  /** 대상 레포에 쓰일 경로 (카탈로그 경로와 1:1 동일). */
  path: string;
  content: string;
}

/**
 * 카탈로그 항목 하나에 해당하는 모든 파일을 읽어, 대상 레포에 쓰일 경로와 함께 반환한다.
 *
 * 항목이 파일인지 디렉터리인지는 `item.path`의 **트레일링 슬래시 유무**로 구분한다
 * (`catalog.service.ts`가 그렇게 만들어둠):
 * - `.claude/agents/doc-polisher.md` → 파일 하나
 * - `.claude/skills/git-commit/` → 디렉터리 전체를 재귀 순회
 *
 * 스킬은 `SKILL.md` 외에 `references/`, `scripts/` 같은 하위 파일을 갖는 경우가 많아서
 * 재귀가 필요하다. 순회하면서 `deployPrefix`를 같이 넘겨, 카탈로그 내 상대 구조가 대상 레포에도
 * 그대로 유지되게 한다 (예: `.claude/skills/write-pr/references/labels.md`).
 *
 * 카탈로그 루트는 환경설정에서 오므로 인자로 받는다 — 이 모듈은 환경변수를 직접 읽지 않는다.
 *
 * 모든 카탈로그 파일이 텍스트(md/sh/json/toml)라는 전제로 utf-8로 읽는다 — 바이너리 파일이
 * 카탈로그에 들어올 일이 생기면 base64 처리가 필요해진다.
 */
export function collectFiles(
  item: CatalogItem,
  catalogRoot: string,
): CollectedFile[] {
  const absolutePath = join(catalogRoot, item.path);

  if (!item.path.endsWith('/')) {
    return [{ path: item.path, content: readFileSync(absolutePath, 'utf-8') }];
  }

  const files: CollectedFile[] = [];
  const walk = (dir: string, deployPrefix: string) => {
    for (const entry of readdirSync(dir)) {
      const entryAbsolute = join(dir, entry);
      const entryDeployPath = `${deployPrefix}${entry}`;
      if (statSync(entryAbsolute).isDirectory()) {
        walk(entryAbsolute, `${entryDeployPath}/`);
      } else {
        files.push({
          path: entryDeployPath,
          content: readFileSync(entryAbsolute, 'utf-8'),
        });
      }
    }
  };
  walk(absolutePath, item.path);
  return files;
}

/** 카탈로그 항목이 아닌 고정 파일(dispatcher 스크립트, settings 템플릿 등)을 직접 읽을 때 사용. */
export function readCatalogFile(
  relativePath: string,
  catalogRoot: string,
): string {
  return readFileSync(join(catalogRoot, relativePath), 'utf-8');
}
