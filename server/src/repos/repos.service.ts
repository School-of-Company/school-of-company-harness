import { Inject, Injectable } from '@nestjs/common';
import type { Octokit } from '@octokit/rest';
import { CatalogService } from '../catalog/catalog.service.js';
import {
  INSTALLATION_TOKEN_MANAGER,
  type InstallationTokenManager,
} from '../installation-token/installation-token-manager.interface.js';
import type { RecommendationRequestDto, RecommendationResponseDto } from './recommendation.dto.js';
import { detectStack, recommendItems, type StackSignals } from './stack.js';

export interface RegisteredRepo {
  owner: string;
  repo: string;
  installationId: number;
  defaultBranch: string;
}

@Injectable()
export class ReposService {
  constructor(
    @Inject(INSTALLATION_TOKEN_MANAGER)
    private readonly tokenManager: InstallationTokenManager,
    private readonly catalogService: CatalogService,
  ) {}

  /**
   * "App이 설치된 모든 레포"를 알아내려면 2단계 조회가 필요하다 — GitHub API에 이걸 한 번에
   * 주는 엔드포인트가 없기 때문이다.
   *
   * 1. App 레벨 인증(JWT)으로 `GET /app/installations` 호출 → 이 App이 설치된 "installation"
   *    목록을 얻는다. installation은 보통 조직/개인 계정 하나에 대응한다.
   * 2. 각 installation마다 그 installation 전용 토큰을 발급받아
   *    `GET /installation/repositories`를 호출해야, 그 installation 안에서 실제로 권한을
   *    받은 레포 목록이 나온다 (App 토큰으로는 이 엔드포인트를 호출할 수 없음).
   *
   * `octokit.paginate(...)`는 GitHub API가 응답을 페이지 단위로 나눠줄 때(Link 헤더 기반)
   * 자동으로 다음 페이지를 계속 가져와 하나의 배열로 합쳐준다 — 레포/installation이 많아져도
   * 직접 페이지네이션 로직을 짤 필요가 없다.
   */
  async listRepos(): Promise<RegisteredRepo[]> {
    const appOctokit = await this.tokenManager.getAppOctokit();
    const installations = await appOctokit.paginate(
      appOctokit.rest.apps.listInstallations,
    );

    const results: RegisteredRepo[] = [];
    for (const installation of installations) {
      const installationOctokit = await this.tokenManager.getOctokit(
        installation.id,
      );
      const repos = await installationOctokit.paginate(
        installationOctokit.rest.apps.listReposAccessibleToInstallation,
      );
      for (const repo of repos) {
        results.push({
          owner: repo.owner.login,
          repo: repo.name,
          installationId: installation.id,
          defaultBranch: repo.default_branch,
        });
      }
    }
    return results;
  }
  /**
   * 대상 레포를 들여다보고, 카탈로그 항목마다 "여기에 맞는가"를 판단해 돌려준다.
   *
   * 하네스는 한 카탈로그를 여러 레포에 뿌리는 도구라서, 고르는 쪽이 매번 "이 레포엔 뭐가
   * 맞는지"를 기억해야 했다. Kotlin 레포에 `nestjs-arch`를 체크해도 아무도 막지 않았고,
   * eslint를 쓰는 레포에 `oxlint` 훅만 들어가면 린트가 조용히 무동작이 된다.
   *
   * 판단 근거는 **레포가 실제로 가진 것**뿐이다:
   * - `GET /languages` — GitHub이 집계한 언어 비중
   * - 루트 파일 목록 — `build.gradle`, `package.json`, `eslint.config.*`, `next.config.*` …
   * - `package.json`의 dependencies·devDependencies — 설정 파일이 없어도 도구가 드러난다
   * - `build.gradle(.kts)` 본문 — ktlint·spotless·spring은 보통 플러그인으로만 선언된다
   *
   * 항목 쪽 요구사항은 별도 메타데이터가 아니라 이름 규약에서 읽는다 (`stack.ts` 참고).
   */
  async recommend(
    dto: RecommendationRequestDto,
  ): Promise<RecommendationResponseDto> {
    const { owner, repo, installationId } = dto;
    const octokit = await this.tokenManager.getOctokit(installationId);

    const signals = await this.collectSignals(octokit, owner, repo);
    const detected = detectStack(signals);

    return {
      ...detected,
      items: recommendItems(this.catalogService.listItems(), detected),
    };
  }

  /**
   * 신호 수집. 레포마다 없는 파일이 있는 게 정상이라(404), 개별 실패는 신호 하나가 비는 것으로
   * 취급하고 넘어간다 — 한 파일이 없다고 추천 전체를 실패시킬 이유가 없다.
   */
  private async collectSignals(
    octokit: Octokit,
    owner: string,
    repo: string,
  ): Promise<StackSignals> {
    const languages = await octokit.rest.repos
      .listLanguages({ owner, repo })
      .then(({ data }) =>
        Object.entries(data)
          .sort(([, a], [, b]) => b - a)
          .map(([language]) => language),
      )
      .catch(() => [] as string[]);

    const defaultBranch = await octokit.rest.repos
      .get({ owner, repo })
      .then(({ data }) => data.default_branch)
      .catch(() => undefined);

    // 루트만 보면 모노레포를 놓친다 — 하네스 자신도 `server/package.json`이라 루트 스캔으로는
    // oxlint를 감지하지 못했다. tree를 한 번에 받아(호출 1회) 경로 전체에서 신호를 찾는다.
    const files = defaultBranch
      ? await octokit.rest.git
          .getTree({
            owner,
            repo,
            tree_sha: defaultBranch,
            recursive: 'true',
          })
          .then(({ data }) =>
            data.tree
              .filter((entry) => entry.type === 'blob' && entry.path)
              .map((entry) => entry.path as string)
              .filter(isRelevantPath),
          )
          .catch(() => [] as string[])
      : [];

    const readText = async (path: string): Promise<string | undefined> =>
      octokit.rest.repos
        .getContent({ owner, repo, path })
        .then(({ data }) =>
          'content' in data
            ? Buffer.from(data.content, 'base64').toString('utf-8')
            : undefined,
        )
        .catch(() => undefined);

    // 모노레포에는 package.json이 여러 개 있다. 얕은 것부터 몇 개만 읽어 의존성을 합친다
    // (전부 읽으면 워크스페이스가 많은 레포에서 호출이 폭발한다).
    const packagePaths = files
      .filter((path) => path.endsWith('package.json'))
      .sort((a, b) => depthOf(a) - depthOf(b))
      .slice(0, 3);
    const dependencies = (
      await Promise.all(
        packagePaths.map(async (path) => {
          const content = await readText(path);
          return content ? dependencyNames(content) : [];
        }),
      )
    ).flat();

    const gradlePath = files
      .filter((path) => /(^|\/)build\.gradle(\.kts)?$/.test(path))
      .sort((a, b) => depthOf(a) - depthOf(b))[0];
    const gradleScript = gradlePath ? await readText(gradlePath) : undefined;

    return { languages, files, dependencies: [...new Set(dependencies)], gradleScript };
  }
}

function depthOf(path: string): number {
  return path.split('/').length;
}

/**
 * 의존성·빌드 산출물 경로는 신호가 아니라 잡음이다. 거기 있는 `package.json`을 읽으면 남의
 * 라이브러리 의존성이 우리 판단에 섞인다. 깊이도 제한한다 — 설정 파일은 얕은 곳에 있다.
 */
const IGNORED_SEGMENTS = [
  'node_modules',
  'build',
  'dist',
  'out',
  'target',
  '.next',
  '.gradle',
  '.venv',
  'vendor',
  'coverage',
];

function isRelevantPath(path: string): boolean {
  const segments = path.split('/');
  if (segments.length > 5) return false;
  return !segments.some((segment) => IGNORED_SEGMENTS.includes(segment));
}


/**
 * package.json에서 의존성 이름만 뽑는다. 깨진 JSON이어도 추천 전체를 실패시키지 않는다 —
 * 그 레포는 다른 신호(루트 파일, 언어)로만 판단된다.
 */
function dependencyNames(packageJson: string): string[] {
  try {
    const parsed = JSON.parse(packageJson) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return [
      ...Object.keys(parsed.dependencies ?? {}),
      ...Object.keys(parsed.devDependencies ?? {}),
    ];
  } catch {
    return [];
  }
}
