import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { resolveCatalogRoot } from './catalog-root.js';
import { extractField } from './frontmatter.js';
import type { CatalogCategory, CatalogItem } from './catalog.types.js';

/** 디렉터리가 없으면 빈 배열 — 아직 만들지 않은 카테고리(예: `.gemini/`)에서 터지지 않게 한다. */
function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * 항목 하나를 조립한다. 제목은 경로 마지막 세그먼트(폴더/파일명)를 그대로 쓰고, 설명은
 * 진입점 파일(`SKILL.md`, `<agent>.md`, `<agent>.toml`)의 frontmatter에서 뽑는다.
 */
function buildItem(
  id: string,
  category: CatalogCategory,
  deployPath: string,
  entryPointAbsolutePath: string,
): CatalogItem {
  const name = id.split('/').pop() ?? id;
  let description: string | undefined;
  try {
    const content = readFileSync(entryPointAbsolutePath, 'utf-8');
    description = extractField(content, 'description');
  } catch {
    // 진입점을 못 읽으면 설명 없이 제목만 — 카탈로그에서 항목이 사라지는 것보다 낫다.
  }
  return { id, category, title: name, description, path: deployPath };
}

/**
 * 카탈로그는 별도의 매니페스트 파일(예: `sync-manifest.yml`)을 두지 않고,
 * **디렉터리 구조 자체를 메타데이터로 취급**한다.
 *
 * 이유: 매니페스트를 두면 "스킬 파일 추가 + 매니페스트에 등록"이라는 두 단계가 되고, 후자를
 * 깜빡하면 조용히 카탈로그에서 빠지는 버그가 생긴다. 경로 컨벤션으로 스캔하면 파일을 맞는
 * 위치에 커밋하는 것만으로 자동 인식된다 (`.claude/rules/catalog.md` 참고).
 *
 * 경로 → 항목 변환 규칙:
 * - `.claude/skills/<name>/`  → `claude/skills/<name>` (진입점 `SKILL.md`)
 * - `.claude/agents/<name>.md` → `claude/agents/<name>`
 * - `.claude/hooks/modules/<name>/` → `claude/hooks/<name>`
 * - `.agents/skills/<name>/`  → `codex/skills/<name>`  (Codex는 스킬 경로만 다름)
 * - `.codex/agents/<name>.toml` → `codex/agents/<name>`
 * - `.codex/hooks/modules/<name>/` → `codex/hooks/<name>`
 *
 * `path` 필드는 카탈로그 내 경로이면서 **동시에 대상 레포에 배포될 경로**다 (1:1 대응이라
 * 별도 매핑 테이블이 필요 없음 — `catalog/` 같은 래퍼 디렉터리를 두지 않은 이유).
 */
@Injectable()
export class CatalogService {
  private readonly catalogRoot: string;

  constructor(config: ConfigService) {
    this.catalogRoot = resolveCatalogRoot(config);
  }

  /** PR 생성 시 파일을 읽어야 하는 쪽에서도 같은 루트를 쓰도록 노출한다. */
  getCatalogRoot(): string {
    return this.catalogRoot;
  }

  listItems(): CatalogItem[] {
    return [
      ...this.scanClaudeSkills(),
      ...this.scanClaudeAgents(),
      ...this.scanHookModules(
        'claude/hooks',
        '.claude/hooks/modules',
        'claude-hook',
      ),
      ...this.scanCodexSkills(),
      ...this.scanCodexAgents(),
      ...this.scanHookModules(
        'codex/hooks',
        '.codex/hooks/modules',
        'codex-hook',
      ),
    ];
  }

  /** 스킬은 디렉터리 단위 — 하위에 `references/`, `scripts/` 등이 딸려올 수 있어서 폴더 전체가 한 항목이다. */
  private scanClaudeSkills(): CatalogItem[] {
    const base = '.claude/skills';
    return safeReaddir(join(this.catalogRoot, base))
      .filter((name) => isDirectory(join(this.catalogRoot, base, name)))
      .map((name) =>
        buildItem(
          `claude/skills/${name}`,
          'claude-skill',
          `${base}/${name}/`,
          join(this.catalogRoot, base, name, 'SKILL.md'),
        ),
      );
  }

  /** 에이전트는 파일 하나 — 그래서 `path`에 트레일링 슬래시가 없다(파일 vs 디렉터리 구분 신호). */
  private scanClaudeAgents(): CatalogItem[] {
    const base = '.claude/agents';
    return safeReaddir(join(this.catalogRoot, base))
      .filter((name) => name.endsWith('.md'))
      .map((file) => {
        const name = file.replace(/\.md$/, '');
        return buildItem(
          `claude/agents/${name}`,
          'claude-agent',
          `${base}/${file}`,
          join(this.catalogRoot, base, file),
        );
      });
  }

  private scanCodexSkills(): CatalogItem[] {
    const base = '.agents/skills';
    return safeReaddir(join(this.catalogRoot, base))
      .filter((name) => isDirectory(join(this.catalogRoot, base, name)))
      .map((name) =>
        buildItem(
          `codex/skills/${name}`,
          'codex-skill',
          `${base}/${name}/`,
          join(this.catalogRoot, base, name, 'SKILL.md'),
        ),
      );
  }

  private scanCodexAgents(): CatalogItem[] {
    const base = '.codex/agents';
    return safeReaddir(join(this.catalogRoot, base))
      .filter((name) => name.endsWith('.toml'))
      .map((file) => {
        const name = file.replace(/\.toml$/, '');
        return buildItem(
          `codex/agents/${name}`,
          'codex-agent',
          `${base}/${file}`,
          join(this.catalogRoot, base, file),
        );
      });
  }

  /**
   * 훅 모듈은 Claude/Codex가 디렉터리 위치와 파일명 규칙만 다르고 구조가 같아서 한 함수로 처리한다.
   * 설명(frontmatter)이 없는 셸 스크립트라 `buildItem`을 쓰지 않고 직접 조립한다.
   */
  private scanHookModules(
    idPrefix: string,
    base: string,
    category: CatalogCategory,
  ): CatalogItem[] {
    return safeReaddir(join(this.catalogRoot, base))
      .filter((name) => isDirectory(join(this.catalogRoot, base, name)))
      .map((name) => ({
        id: `${idPrefix}/${name}`,
        category,
        title: name,
        path: `${base}/${name}/`,
      }));
  }
}
