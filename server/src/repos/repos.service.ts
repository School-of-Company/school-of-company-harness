import { Inject, Injectable } from '@nestjs/common';
import {
  INSTALLATION_TOKEN_MANAGER,
  type InstallationTokenManager,
} from '../installation-token/installation-token-manager.interface.js';

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
}
