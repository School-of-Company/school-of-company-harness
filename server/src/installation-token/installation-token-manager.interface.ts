import { Octokit } from '@octokit/rest';

export const INSTALLATION_TOKEN_MANAGER = 'INSTALLATION_TOKEN_MANAGER';

/**
 * GitHub App 인증에는 두 가지 "정체성"이 있다:
 *
 * 1. **App 자체** — App ID + private key로 서명한 JWT로 증명. "나는 이 GitHub App이다"만 증명하고,
 *    어떤 레포도 건드릴 수 없다. `/app/installations` 같은 App 메타데이터 조회에만 쓸 수 있다.
 * 2. **Installation** — App이 특정 계정/조직에 설치된 하나의 단위. App JWT로 "installation access
 *    token"을 발급받으면, 그 installation에 App이 권한 부여받은 레포들에 실제로 쓰기 작업을 할 수 있다.
 *
 * 즉 순서는 항상 "App JWT 발급 → (필요하면) installation token으로 교환 → Octokit에 넣어서 사용"이다.
 * `getAppOctokit()`은 1번, `getOctokit(installationId)`는 2번을 캡슐화한다.
 */
export interface InstallationTokenManager {
  /** installation token으로 인증된 Octokit — 특정 레포에 커밋/PR 등 쓰기 작업을 할 때 사용. */
  getOctokit(installationId: number): Promise<Octokit>;
  /** App JWT로 인증된 Octokit — "이 App이 어디에 설치되어 있는지" 같은 메타데이터 조회 전용. */
  getAppOctokit(): Promise<Octokit>;
}
