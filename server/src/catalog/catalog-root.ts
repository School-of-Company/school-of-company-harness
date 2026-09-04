import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));

/** Repo root, containing .claude/, .agents/, .codex/ — three levels up from dist/catalog/. */
export const CATALOG_ROOT =
  process.env.CATALOG_ROOT ?? resolve(here, '..', '..', '..');
