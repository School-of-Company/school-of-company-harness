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
