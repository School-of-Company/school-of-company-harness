import type { CatalogItem } from '../catalog/catalog.types.js';

/**
 * "이 저장소가 무엇으로 만들어졌는지"를 정규화한 형태.
 *
 * `stacks`는 언어·프레임워크(kotlin, java, typescript, nestjs, nextjs …),
 * `tools`는 빌드·린트·테스트 도구(gradle, ktlint, eslint, oxlint, jest …)다.
 * 둘을 나눈 이유는 카탈로그 항목이 둘 중 다른 쪽에 붙기 때문이다 — 아키텍처 스킬은 스택에,
 * 훅 모듈은 도구에 대응한다.
 */
export interface DetectedStack {
  stacks: string[];
  tools: string[];
  /** 판단 근거 — 어떤 파일/의존성을 보고 그렇게 결론했는지 사용자에게 보여준다. */
  evidence: string[];
}

/** 루트 파일명 → 그 파일이 증명하는 스택·도구. */
const FILE_SIGNALS: { pattern: RegExp; stacks?: string[]; tools?: string[] }[] =
  [
    { pattern: /^build\.gradle(\.kts)?$/, tools: ['gradle'] },
    { pattern: /^settings\.gradle(\.kts)?$/, tools: ['gradle'] },
    { pattern: /^pom\.xml$/, tools: ['maven'] },
    { pattern: /^package\.json$/, stacks: ['node'] },
    {
      pattern: /^pyproject\.toml$|^requirements\.txt$|^pytest\.ini$/,
      stacks: ['python'],
    },
    { pattern: /^go\.mod$/, stacks: ['go'] },
    { pattern: /^Cargo\.toml$/, stacks: ['rust'] },
    {
      pattern: /^tsconfig(\..+)?\.json$/,
      stacks: ['typescript'],
      tools: ['ts-check'],
    },
    { pattern: /^\.eslintrc|^eslint\.config\./, tools: ['eslint'] },
    { pattern: /^\.oxlintrc|^oxlint\.json$/, tools: ['oxlint'] },
    { pattern: /^\.prettierrc|^prettier\.config\./, tools: ['prettier'] },
    { pattern: /^jest\.config\./, tools: ['jest'] },
    { pattern: /^vitest\.config\./, tools: ['vitest'] },
    { pattern: /^\.ruff\.toml$|^ruff\.toml$/, tools: ['ruff'] },
    { pattern: /^next\.config\./, stacks: ['nextjs'] },
    { pattern: /^nest-cli\.json$/, stacks: ['nestjs'] },
    // Spring Boot는 설정 파일 이름이 고정이라 그 자체가 강한 신호다.
    {
      pattern: /^application(-[\w]+)?\.(yml|yaml|properties)$/,
      stacks: ['spring'],
    },
    { pattern: /^\.editorconfig$/ },
  ];

/** package.json 의존성 이름 → 스택·도구. 설정 파일이 없어도 의존성으로 드러난다. */
const DEPENDENCY_SIGNALS: {
  name: string;
  stacks?: string[];
  tools?: string[];
}[] = [
  { name: 'next', stacks: ['nextjs'] },
  { name: 'react', stacks: ['react'] },
  { name: '@nestjs/core', stacks: ['nestjs'] },
  { name: 'typescript', stacks: ['typescript'] },
  { name: 'eslint', tools: ['eslint'] },
  { name: 'oxlint', tools: ['oxlint'] },
  { name: 'prettier', tools: ['prettier'] },
  { name: 'jest', tools: ['jest'] },
  { name: 'vitest', tools: ['vitest'] },
];

/**
 * 빌드 스크립트(Gradle·Maven) 본문에서 드러나는 것들 — 플러그인이나 의존성으로만 선언되는 경우가
 * 많아서, 파일 이름만으로는 알 수 없다.
 */
const BUILD_SCRIPT_SIGNALS: {
  pattern: RegExp;
  stacks?: string[];
  tools?: string[];
}[] = [
  { pattern: /org\.jlleitschuh\.gradle\.ktlint|ktlint/, tools: ['ktlint'] },
  { pattern: /com\.diffplug\.spotless|spotless/, tools: ['spotless'] },
  {
    pattern: /org\.springframework\.boot|spring-boot-starter|spring-webmvc|spring-context/,
    stacks: ['spring'],
  },
  { pattern: /<artifactId>spring-boot/, stacks: ['spring'] },
  { pattern: /io\.spring\.dependency-management/, stacks: ['spring'] },
  {
    pattern: /kotlin\(["']jvm["']\)|org\.jetbrains\.kotlin/,
    stacks: ['kotlin'],
  },
];

/** GitHub `/languages` 응답의 언어명 → 우리 스택 이름. */
const LANGUAGE_MAP: Record<string, string> = {
  Kotlin: 'kotlin',
  Java: 'java',
  TypeScript: 'typescript',
  JavaScript: 'javascript',
  Python: 'python',
  Go: 'go',
  Rust: 'rust',
};

export interface StackSignals {
  /** GitHub `/languages` 키 목록 (바이트 수 내림차순) */
  languages: string[];
  /**
   * 저장소의 파일 경로 목록. 루트만 보면 모노레포를 놓친다 — 하네스 자신도 `server/package.json`
   * 이라 루트 스캔으로는 oxlint를 감지하지 못했다. 신호 판별은 경로의 파일명으로 한다.
   */
  files: string[];
  /** package.json 의존성 이름 (dependencies + devDependencies) */
  dependencies: string[];
  /** 빌드 스크립트 본문 — `build.gradle(.kts)` 또는 `pom.xml` (있으면) */
  buildScript?: string;
}

/**
 * 수집한 신호를 스택·도구 목록으로 정규화한다. 네트워크를 타지 않는 순수 함수라 테스트로 고정할 수 있다.
 */
export function detectStack(signals: StackSignals): DetectedStack {
  const stacks = new Set<string>();
  const tools = new Set<string>();
  const evidence: string[] = [];

  for (const language of signals.languages) {
    const mapped = LANGUAGE_MAP[language];
    if (mapped) {
      stacks.add(mapped);
      evidence.push(`언어: ${language}`);
    }
  }

  for (const path of signals.files) {
    const name = path.split('/').pop() ?? path;
    for (const signal of FILE_SIGNALS) {
      if (!signal.pattern.test(name)) continue;
      signal.stacks?.forEach((s) => stacks.add(s));
      signal.tools?.forEach((t) => tools.add(t));
      if (signal.stacks || signal.tools) evidence.push(`파일: ${path}`);
    }
  }

  for (const dependency of signals.dependencies) {
    for (const signal of DEPENDENCY_SIGNALS) {
      if (signal.name !== dependency) continue;
      signal.stacks?.forEach((s) => stacks.add(s));
      signal.tools?.forEach((t) => tools.add(t));
      evidence.push(`의존성: ${dependency}`);
    }
  }

  if (signals.buildScript) {
    for (const signal of BUILD_SCRIPT_SIGNALS) {
      if (!signal.pattern.test(signals.buildScript)) continue;
      signal.stacks?.forEach((s) => stacks.add(s));
      signal.tools?.forEach((t) => tools.add(t));
      evidence.push(
        `빌드 스크립트: ${(signal.stacks ?? signal.tools ?? []).join(', ')}`,
      );
    }
  }

  // gradle 프로젝트에서 테스트 훅은 gradle 존재만으로 의미가 있다.
  if (tools.has('gradle')) tools.add('gradle-test');

  return {
    stacks: [...stacks],
    tools: [...tools],
    evidence: [...new Set(evidence)],
  };
}

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
