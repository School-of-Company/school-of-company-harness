import type { CatalogItem } from '../catalog/catalog.types.js';

const GROUP_LABELS: Record<string, string> = {
  'claude-skill': '스킬',
  'codex-skill': '스킬',
  'claude-agent': '에이전트',
  'codex-agent': '에이전트',
  'claude-hook': '훅',
  'codex-hook': '훅',
};

const GROUP_ORDER = ['스킬', '에이전트', '훅'];

function formatItemLine(item: CatalogItem): string {
  if (item.category === 'claude-hook') {
    return `- ${item.id} (\`dispatcher\`, \`settings.json\` 자동 포함)`;
  }
  if (item.category === 'codex-hook') {
    return `- ${item.id} (\`dispatcher\`, \`hooks.json\` 자동 포함)`;
  }
  return `- ${item.id}`;
}

/** See .claude/rules/catalog.md "PR Body Content" — must list exactly what was selected, grouped. */
export function buildPrBody(selectedItems: CatalogItem[]): string {
  const byGroup = new Map<string, CatalogItem[]>();
  for (const item of selectedItems) {
    const group = GROUP_LABELS[item.category];
    byGroup.set(group, [...(byGroup.get(group) ?? []), item]);
  }

  const sections = GROUP_ORDER.filter((group) => byGroup.has(group)).map(
    (group) =>
      `### ${group}\n\n${byGroup.get(group)!.map(formatItemLine).join('\n')}`,
  );

  return `## 포함된 항목\n\n${sections.join('\n\n')}\n`;
}
