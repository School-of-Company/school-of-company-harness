import { Injectable } from '@nestjs/common';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { CATALOG_ROOT } from './catalog-root.js';
import { extractField } from './frontmatter.js';
import type { CatalogCategory, CatalogItem } from './catalog.types.js';

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
    // entry point unreadable — fall back to id-derived title only
  }
  return { id, category, title: name, description, path: deployPath };
}

@Injectable()
export class CatalogService {
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

  private scanClaudeSkills(): CatalogItem[] {
    const base = '.claude/skills';
    return safeReaddir(join(CATALOG_ROOT, base))
      .filter((name) => isDirectory(join(CATALOG_ROOT, base, name)))
      .map((name) =>
        buildItem(
          `claude/skills/${name}`,
          'claude-skill',
          `${base}/${name}/`,
          join(CATALOG_ROOT, base, name, 'SKILL.md'),
        ),
      );
  }

  private scanClaudeAgents(): CatalogItem[] {
    const base = '.claude/agents';
    return safeReaddir(join(CATALOG_ROOT, base))
      .filter((name) => name.endsWith('.md'))
      .map((file) => {
        const name = file.replace(/\.md$/, '');
        return buildItem(
          `claude/agents/${name}`,
          'claude-agent',
          `${base}/${file}`,
          join(CATALOG_ROOT, base, file),
        );
      });
  }

  private scanCodexSkills(): CatalogItem[] {
    const base = '.agents/skills';
    return safeReaddir(join(CATALOG_ROOT, base))
      .filter((name) => isDirectory(join(CATALOG_ROOT, base, name)))
      .map((name) =>
        buildItem(
          `codex/skills/${name}`,
          'codex-skill',
          `${base}/${name}/`,
          join(CATALOG_ROOT, base, name, 'SKILL.md'),
        ),
      );
  }

  private scanCodexAgents(): CatalogItem[] {
    const base = '.codex/agents';
    return safeReaddir(join(CATALOG_ROOT, base))
      .filter((name) => name.endsWith('.toml'))
      .map((file) => {
        const name = file.replace(/\.toml$/, '');
        return buildItem(
          `codex/agents/${name}`,
          'codex-agent',
          `${base}/${file}`,
          join(CATALOG_ROOT, base, file),
        );
      });
  }

  private scanHookModules(
    idPrefix: string,
    base: string,
    category: CatalogCategory,
  ): CatalogItem[] {
    return safeReaddir(join(CATALOG_ROOT, base))
      .filter((name) => isDirectory(join(CATALOG_ROOT, base, name)))
      .map((name) => ({
        id: `${idPrefix}/${name}`,
        category,
        title: name,
        path: `${base}/${name}/`,
      }));
  }
}
