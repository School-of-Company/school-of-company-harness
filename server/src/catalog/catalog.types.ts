export type CatalogCategory =
  | 'claude-skill'
  | 'claude-agent'
  | 'claude-hook'
  | 'codex-skill'
  | 'codex-agent'
  | 'codex-hook';

export interface CatalogItem {
  id: string;
  category: CatalogCategory;
  title: string;
  description?: string;
  /** Path relative to the catalog root — also the deploy path in the target repo. */
  path: string;
}
