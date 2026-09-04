import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { CATALOG_ROOT } from '../catalog/catalog-root.js';
import type { CatalogItem } from '../catalog/catalog.types.js';

export interface CollectedFile {
  path: string;
  content: string;
}

/**
 * Reads every file under a catalog item's path and returns it with the exact path it should be
 * written to in the target repo. Catalog paths are 1:1 with target deploy paths, so no remapping.
 */
export function collectFiles(item: CatalogItem): CollectedFile[] {
  const absolutePath = join(CATALOG_ROOT, item.path);

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

export function readCatalogFile(relativePath: string): string {
  return readFileSync(join(CATALOG_ROOT, relativePath), 'utf-8');
}
