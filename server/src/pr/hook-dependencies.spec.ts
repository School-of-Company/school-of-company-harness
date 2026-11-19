import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CatalogItem } from '../catalog/catalog.types.js';
import { hasPostToolUseModule } from './hook-dependencies.js';

describe('hasPostToolUseModule', () => {
  let root: string;

  const hook = (name: string, files: string[]): CatalogItem => {
    const dir = `.claude/hooks/modules/${name}`;
    mkdirSync(join(root, dir), { recursive: true });
    for (const file of files)
      writeFileSync(join(root, dir, file), '#!/bin/bash');
    return {
      id: `claude/hooks/${name}`,
      category: 'claude-hook',
      title: name,
      path: `${dir}/`,
    };
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'hook-deps-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('PreToolUse 전용 훅만 고르면 false — PostToolUse 를 걸어도 돌릴 모듈이 없다', () => {
    const items = [
      hook('secret-guard', ['preToolUse.sh']),
      hook('command-guard', ['preToolUse.sh']),
    ];
    expect(hasPostToolUseModule(items, root)).toBe(false);
  });

  it('postToolUse.sh 를 가진 모듈이 하나라도 있으면 true', () => {
    const items = [
      hook('secret-guard', ['preToolUse.sh']),
      hook('eslint', ['postToolUse.sh']),
    ];
    expect(hasPostToolUseModule(items, root)).toBe(true);
  });

  it('Codex 훅은 Claude wiring 과 무관하므로 세지 않는다', () => {
    const codex: CatalogItem = {
      id: 'codex/hooks/eslint',
      category: 'codex-hook',
      title: 'eslint',
      path: '.codex/hooks/modules/eslint/',
    };
    expect(hasPostToolUseModule([codex], root)).toBe(false);
  });
});
