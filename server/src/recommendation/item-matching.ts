import type { CatalogItem } from '../catalog/catalog.types.js';
import type { DetectedStack } from './stack-detection.js';

/**
 * 항목 이름에서 그 항목이 요구하는 스택·도구를 읽는다.
 *
 * **별도 메타데이터 필드를 두지 않는 이유**: 항목마다 `stacks:` 같은 필드를 직접 적게 하면,
 * 새 항목에서 빠뜨렸을 때 조용히 추천에서 누락된다 — 우리가 매니페스트 파일을 피한 것과 똑같은
 * 실패 모드다. 대신 이미 지키고 있는 이름 규약을 그대로 읽는다:
 *
 * - 훅 모듈 이름은 그 도구의 이름이다 (`ktlint`, `oxlint`, `jest` …) → 그 도구를 쓰는지 본다
 * - `*-guard` 훅은 도구가 아니라 안전장치다 (`secret-guard`, `command-guard`) → 스택 무관
 * - 스킬 이름에 들어간 **모든** 스택 토큰을 요구한다 (`kotlin-spring-arch` → kotlin 그리고 spring).
 *   접두어 하나만 보면 Spring을 쓰지 않는 순수 Java 프로젝트에도 `java-spring-arch`가 추천된다
 * - 그 밖의 항목은 스택 중립이라 어느 저장소에나 들어간다
 *
 * 규약으로 판단할 수 없는 항목이 생기면 그때 그 파일에 한 줄 적는 쪽으로 열어 둔다(옵트인).
 */
const KNOWN_STACKS = [
  'kotlin',
  'java',
  'nestjs',
  'nextjs',
  'react',
  'node',
  'python',
  'go',
  'rust',
  'spring',
  'typescript',
];

export interface ItemRequirement {
  /** 이 항목이 필요로 하는 도구 (훅) */
  tool?: string;
  /** 이 항목이 필요로 하는 스택들 — 전부 충족해야 한다 (아키텍처 스킬) */
  stacks?: string[];
}

export function requirementOf(item: CatalogItem): ItemRequirement {
  const isHook = item.category.endsWith('-hook');

  if (isHook) {
    // `*-guard`는 어떤 스택에서도 의미가 있다.
    if (item.title.endsWith('-guard')) return {};
    return { tool: item.title };
  }

  // 이름을 토큰으로 쪼개 알려진 스택만 골라낸다: `kotlin-spring-arch` → ['kotlin', 'spring']
  const required = item.title
    .split('-')
    .filter((token) => KNOWN_STACKS.includes(token));
  return required.length > 0 ? { stacks: required } : {};
}

export type Verdict = 'recommended' | 'not-applicable';

export interface ItemRecommendation {
  id: string;
  title: string;
  category: string;
  verdict: Verdict;
  /** 왜 추천했는지 / 왜 해당 없음인지 */
  reason: string;
}

/** 감지된 스택에 비추어 카탈로그 항목마다 추천 여부를 정한다. */
export function recommendItems(
  catalog: CatalogItem[],
  detected: DetectedStack,
): ItemRecommendation[] {
  const stacks = new Set(detected.stacks);
  const tools = new Set(detected.tools);

  return catalog.map((item) => {
    const requirement = requirementOf(item);
    const base = { id: item.id, title: item.title, category: item.category };

    if (requirement.tool) {
      return tools.has(requirement.tool)
        ? {
            ...base,
            verdict: 'recommended' as const,
            reason: `${requirement.tool}을 사용하는 저장소입니다`,
          }
        : {
            ...base,
            verdict: 'not-applicable' as const,
            reason: `${requirement.tool}을 쓰는 흔적이 없습니다`,
          };
    }

    if (requirement.stacks) {
      const missing = requirement.stacks.filter((name) => !stacks.has(name));
      return missing.length === 0
        ? {
            ...base,
            verdict: 'recommended' as const,
            reason: `${requirement.stacks.join(' + ')} 프로젝트입니다`,
          }
        : {
            ...base,
            verdict: 'not-applicable' as const,
            reason: `${missing.join(', ')}을 쓰는 흔적이 없습니다`,
          };
    }

    return {
      ...base,
      verdict: 'recommended' as const,
      reason: '스택과 무관하게 쓸 수 있습니다',
    };
  });
}
