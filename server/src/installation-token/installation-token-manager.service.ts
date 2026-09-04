import { Injectable } from '@nestjs/common';
import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import { createTimedFetch } from '../common/timed-fetch.js';
import { withRetry } from '../common/retry.js';
import type { InstallationTokenManager } from './installation-token-manager.interface.js';

const TOKEN_TTL_SECONDS = 50 * 60;

interface CachedToken {
  token: string;
  expiresAt: number;
}

@Injectable()
export class InstallationTokenManagerService implements InstallationTokenManager {
  private readonly appAuth: ReturnType<typeof createAppAuth>;
  private readonly tokenCache = new Map<number, CachedToken>();

  constructor() {
    const appId = process.env.GITHUB_APP_ID;
    const privateKey = process.env.GITHUB_PRIVATE_KEY;
    if (!appId || !privateKey) {
      throw new Error(
        'GITHUB_APP_ID or GITHUB_PRIVATE_KEY environment variable is not defined',
      );
    }
    const authRequest = new Octokit({
      request: { fetch: createTimedFetch() },
    }).request;
    this.appAuth = createAppAuth({
      appId,
      privateKey: privateKey.replace(/\\n/g, '\n'),
      request: authRequest,
    });
  }

  async getAppOctokit(): Promise<Octokit> {
    const { token } = await withRetry(() => this.appAuth({ type: 'app' }));
    return new Octokit({ auth: token, request: { fetch: createTimedFetch() } });
  }

  async getOctokit(installationId: number): Promise<Octokit> {
    const cached = this.tokenCache.get(installationId);
    if (cached && cached.expiresAt > Date.now()) {
      return new Octokit({
        auth: cached.token,
        request: { fetch: createTimedFetch() },
      });
    }

    const { token } = await withRetry(() =>
      this.appAuth({ type: 'installation', installationId }),
    );
    this.tokenCache.set(installationId, {
      token,
      expiresAt: Date.now() + TOKEN_TTL_SECONDS * 1000,
    });

    return new Octokit({ auth: token, request: { fetch: createTimedFetch() } });
  }
}
