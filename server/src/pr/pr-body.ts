import type { CatalogItem } from '../catalog/catalog.types.js';

const SOURCE_REPO_URL =
  'https://github.com/School-of-Company/school-of-company-harness';

/**
 * 내부 카테고리(플랫폼별로 6종)를 사용자에게 보여줄 3개 그룹으로 접는다.
 * PR을 읽는 사람에겐 "이게 Claude용인지 Codex용인지"는 배지로 따로 표시하므로,
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

/** 출력 순서를 고정해, 선택 순서와 무관하게 PR 형태가 항상 일정하도록 한다. */
const GROUP_ORDER = ['스킬', '에이전트', '훅'];

function platformOf(item: CatalogItem): 'Claude' | 'Codex' {
  return item.category.startsWith('claude') ? 'Claude' : 'Codex';
}

/**
 * 같은 이름이 Claude·Codex 양쪽으로 들어오는 경우가 대부분이라, 이름 기준으로 묶는다.
 * 리뷰어가 궁금한 건 "무엇이 추가됐나"이고 플랫폼은 그 다음이다.
 */
interface GroupedItem {
  name: string;
  platforms: string[];
  hasHookDependency: boolean;
  hookWiringFile?: string;
}

function groupItems(items: CatalogItem[]): Map<string, GroupedItem[]> {
  const byGroup = new Map<string, Map<string, GroupedItem>>();

  for (const item of items) {
    const group = GROUP_LABELS[item.category];
    if (!byGroup.has(group)) byGroup.set(group, new Map());
    const bucket = byGroup.get(group)!;

    const existing = bucket.get(item.title);
    const platform = platformOf(item);
    const isHook =
      item.category === 'claude-hook' || item.category === 'codex-hook';

    if (existing) {
      existing.platforms.push(platform);
      if (isHook) existing.hasHookDependency = true;
    } else {
      bucket.set(item.title, {
        name: item.title,
        platforms: [platform],
        hasHookDependency: isHook,
        hookWiringFile: isHook
          ? item.category === 'claude-hook'
            ? 'settings.json'
            : 'hooks.json'
          : undefined,
      });
    }
  }

  const result = new Map<string, GroupedItem[]>();
  for (const group of GROUP_ORDER) {
    const bucket = byGroup.get(group);
    if (bucket) result.set(group, [...bucket.values()]);
  }
  return result;
}

/**
 * 대상 레포용 PR 제목 (`.claude/rules/catalog.md` 참고).
 *
 * 예전에는 `[global] 3개 항목 추가`처럼 개수만 적었는데, PR 목록에서 제목만 보고는 무엇이
 * 들어왔는지 알 수 없었다. 항목이 하나면 이름을 쓰고, 여러 개면 그룹별 개수로 요약한다.
 */
export function buildPrTitle(selectedItems: CatalogItem[]): string {
  const grouped = groupItems(selectedItems);
  const entries = [...grouped.entries()];
  const totalNames = entries.reduce((sum, [, list]) => sum + list.length, 0);

  if (totalNames === 1) {
    const [group, list] = entries[0];
    return `[global] ${list[0].name} ${group} 추가`;
  }

  const summary = entries
    .map(([group, list]) => `${group} ${list.length}개`)
    .join('·');
  return `[global] ${summary} 추가`;
}

/** 커밋 메시지도 제목과 같은 요약을 쓴다 — squash 머지 시 제목이 그대로 커밋이 되기 때문. */
export function buildCommitMessage(selectedItems: CatalogItem[]): string {
  return `chore(harness): ${buildPrTitle(selectedItems).replace('[global] ', '')}`;
}

/**
 * PR 본문을 만든다 (`.claude/rules/catalog.md` "PR Body Content").
 *
 * 이 PR을 받는 사람은 하네스를 모를 수 있으므로 출처와 성격을 먼저 밝히고, 그다음 무엇이
 * 들어왔는지 나열한다. 나열되는 건 **사용자가 실제로 체크한 항목만**이고, 훅 때문에 자동으로
 * 딸려간 dispatcher·설정 파일은 별도 항목이 아니라 해당 훅의 하위 설명으로 표시한다 —
 * "내가 고른 것"과 "시스템이 채운 것"이 구분돼야 리뷰가 쉽다.
 */
export function buildPrBody(selectedItems: CatalogItem[]): string {
  const grouped = groupItems(selectedItems);
  const hasHook = [...grouped.values()]
    .flat()
    .some((item) => item.hasHookDependency);

  const sections = [...grouped.entries()].map(([group, list]) => {
    const lines = list.map((item) => {
      const platforms = item.platforms.map((p) => `\`${p}\``).join(', ');
      const head = `- **${item.name}** (${platforms})`;
      if (!item.hasHookDependency) return head;
      return `${head}\n  - 훅은 단독으로 동작하지 않아 \`dispatcher\`와 \`${item.hookWiringFile}\`이 함께 포함됩니다`;
    });
    return `### ${group}\n\n${lines.join('\n')}`;
  });

  const notes = [
    '- 위에 적힌 경로의 파일만 추가·갱신되며, 그 밖의 파일은 건드리지 않습니다.',
  ];
  if (hasHook) {
    notes.push(
      '- `.claude/settings.json`은 덮어쓰지 않고 기존 내용에 훅 설정만 병합합니다.',
    );
  }
  notes.push('- 머지하면 다음 세션부터 적용됩니다.');

  return [
    `[school-of-company-harness](${SOURCE_REPO_URL})에서 이 저장소에 필요한 AI 도구 설정만 골라 보낸 PR입니다.`,
    '',
    '## 포함된 항목',
    '',
    sections.join('\n\n'),
    '',
    '## 참고',
    '',
    notes.join('\n'),
    '',
  ].join('\n');
}
