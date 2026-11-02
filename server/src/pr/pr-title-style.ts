import { Logger } from '@nestjs/common';
import type { Octokit } from '@octokit/rest';

/**
 * 대상 레포가 PR 제목에 요구하는 형식.
 *
 * - `scoped`: `[global] 하네스 동기화 — …` — 범위 접두어가 붙는다
 * - `plain`:  `하네스 동기화 — …` — 접두어가 없다
 *
 * 대상 레포마다 CI의 제목 검사가 다르고 서로 반대이기도 하다. Expo 계열의 한 레포는 "범위 접두어 없이
 * 50자 이하"를 요구하고, 같은 계열의 다른 세 레포는 `[form|survey|json|global|ci/cd] 설명` 형식을 필수
 * 체크로 건다. 그래서 어느 한쪽에 맞춘 고정 제목은 반대편에서 실패한 PR을 매번 연다. 레포를 읽고 정한다.
 */
export type TitleStyle = 'scoped' | 'plain';

/** 아무 단서도 없을 때의 형식. 이 조직의 레포는 `[scope] 설명` 관례를 쓰는 쪽이 많다. */
export const DEFAULT_TITLE_STYLE: TitleStyle = 'scoped';

const logger = new Logger('TitleStyle');

/** `^\[(form|survey|global)\]` 처럼 허용 범위 목록을 정규식으로 적어 둔 부분. */
const SCOPE_LIST = /\^\\\[\(([^)]+)\)\\\]/g;

/** "범위 접두어 없이" 같은, 접두어를 금지한다고 밝힌 문구. */
const FORBIDS_PREFIX =
  /(?:without|no)\s+(?:a\s+)?scope\s+prefix|must\s+not\s+(?:start|begin)\s+with\s+(?:a\s+)?(?:\[|scope)/i;

/**
 * 워크플로 파일 하나가 PR 제목 형식을 요구하면 그 형식을 돌려준다. 알아볼 수 없으면 undefined.
 *
 * 워크플로는 사람이 쓴 셸·JS 조각이라 완전하게 해석할 수 없다. 그래서 두 가지 알려진 모양만
 * 읽고, 그 밖의 것(릴리즈 제목 검사 등)은 모른 채로 둔다 — 틀리게 읽느니 모르는 편이 낫다.
 */
export function styleFromWorkflow(text: string): TitleStyle | undefined {
  if (!/pull_request/.test(text) || !/title/i.test(text)) return undefined;
  if (FORBIDS_PREFIX.test(text)) return 'plain';
  for (const match of text.matchAll(SCOPE_LIST)) {
    const scopes = match[1].split('|').map((scope) => scope.trim());
    // 허용 범위에 `global`이 없으면 어떤 접두어를 써야 통과할지 우리가 정할 수 없다
    if (scopes.includes('global')) return 'scoped';
  }
  return undefined;
}

/**
 * 최근 PR 제목의 관례로 형식을 짐작한다. 하네스가 보낸 PR은 우리가 정한 형식이라 센 대상에서 뺀다.
 * 표본이 적으면 짐작하지 않는다.
 */
export function styleFromTitles(titles: string[]): TitleStyle | undefined {
  const human = titles.filter((title) => !title.includes('하네스 동기화'));
  if (human.length < 5) return undefined;
  const scoped = human.filter((title) => /^\[[^\]]+\]/.test(title)).length;
  return scoped * 2 >= human.length ? 'scoped' : 'plain';
}

/** 워크플로에서 읽은 형식이 서로 어긋나면(예: 한쪽은 필수, 다른 쪽은 금지) 정할 수 없다. */
function agreed(styles: (TitleStyle | undefined)[]): TitleStyle | undefined {
  const found = new Set(styles.filter((style) => style !== undefined));
  return found.size === 1 ? [...found][0] : undefined;
}

const MAX_WORKFLOWS = 30;

async function readWorkflows(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<string[]> {
  let listing;
  try {
    listing = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: '.github/workflows',
    });
  } catch (error) {
    if ((error as { status?: number }).status === 404) return [];
    throw error;
  }
  if (!Array.isArray(listing.data)) return [];

  const names = listing.data
    .map((entry) => entry.path)
    .filter((path) => /\.ya?ml$/.test(path))
    .slice(0, MAX_WORKFLOWS);

  const texts = await Promise.all(
    names.map(async (path) => {
      const file = await octokit.rest.repos.getContent({ owner, repo, path });
      const data = file.data;
      if (Array.isArray(data) || !('content' in data)) return '';
      return Buffer.from(data.content, 'base64').toString('utf8');
    }),
  );
  return texts;
}

/**
 * 이 레포에 맞는 PR 제목 형식을 정한다. 우선순위는 (1) CI의 제목 검사 (2) 최근 PR 제목의 관례
 * (3) 기본값이다.
 *
 * 어디서 실패해도 던지지 않고 기본값으로 간다 — 제목 형식을 못 읽었다는 이유로 PR 생성이
 * 막히면 안 된다. 형식이 틀리면 해당 레포의 CI가 알려 주고, 사람이 제목을 고치면 된다.
 */
export async function detectTitleStyle(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<TitleStyle> {
  try {
    const workflows = await readWorkflows(octokit, owner, repo);
    const fromCi = agreed(workflows.map(styleFromWorkflow));
    if (fromCi) return fromCi;

    const prs = await octokit.rest.pulls.list({
      owner,
      repo,
      state: 'all',
      per_page: 30,
    });
    return (
      styleFromTitles(prs.data.map((pr) => pr.title)) ?? DEFAULT_TITLE_STYLE
    );
  } catch (error) {
    logger.warn(
      `${owner}/${repo}의 PR 제목 형식을 읽지 못해 기본값(${DEFAULT_TITLE_STYLE})을 씁니다: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return DEFAULT_TITLE_STYLE;
  }
}
