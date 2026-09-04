import type { CatalogItem } from '../catalog/catalog.types.js';

/**
 * 내부 카테고리(플랫폼별로 6종)를 사용자에게 보여줄 3개 그룹으로 접는다.
 * PR을 읽는 사람에겐 "이게 Claude용인지 Codex용인지"는 항목 id에 이미 드러나므로,
 * 그룹은 기능 종류(스킬/에이전트/훅)로만 나누는 게 읽기 쉽다.
 */
const GROUP_LABELS: Record<string, string> = {
  'claude-skill': '스킬',
  'codex-skill': '스킬',
  'claude-agent': '에이전트',
  'codex-agent': '에이전트',
  'claude-hook': '훅',
  'codex-hook': '훅',
};

/** 출력 순서를 고정해, 선택 순서와 무관하게 PR 본문 형태가 항상 일정하도록 한다. */
const GROUP_ORDER = ['스킬', '에이전트', '훅'];

/**
 * 훅 항목에는 자동으로 딸려간 파일을 괄호로 덧붙인다. 사용자는 체크하지 않았는데 PR diff에
 * dispatcher와 설정 파일이 들어 있으면 혼란스러우므로, 왜 들어왔는지 본문에서 설명하는 것.
 */
function formatItemLine(item: CatalogItem): string {
  if (item.category === 'claude-hook') {
    return `- ${item.id} (\`dispatcher\`, \`settings.json\` 자동 포함)`;
  }
  if (item.category === 'codex-hook') {
    return `- ${item.id} (\`dispatcher\`, \`hooks.json\` 자동 포함)`;
  }
  return `- ${item.id}`;
}

/**
 * PR 본문을 만든다 (`.claude/rules/catalog.md` "PR Body Content").
 *
 * 넘어오는 건 **사용자가 실제로 체크한 항목만**이다 — 자동으로 딸려간 dispatcher/settings.json은
 * 별도 항목으로 나열하지 않고, 위 `formatItemLine`처럼 해당 훅 옆의 주석으로만 표시한다.
 * 그래야 "내가 고른 것"과 "시스템이 채운 것"이 본문에서 구분된다.
 */
export function buildPrBody(selectedItems: CatalogItem[]): string {
  const byGroup = new Map<string, CatalogItem[]>();
  for (const item of selectedItems) {
    const group = GROUP_LABELS[item.category];
    byGroup.set(group, [...(byGroup.get(group) ?? []), item]);
  }

  // 비어 있는 그룹 헤더(예: 에이전트를 하나도 안 골랐을 때)는 아예 출력하지 않는다.
  const sections = GROUP_ORDER.filter((group) => byGroup.has(group)).map(
    (group) =>
      `### ${group}\n\n${byGroup.get(group)!.map(formatItemLine).join('\n')}`,
  );

  return `## 포함된 항목\n\n${sections.join('\n\n')}\n`;
}
