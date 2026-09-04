import { Injectable } from '@nestjs/common';
import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import { createTimedFetch } from '../common/timed-fetch.js';
import { withRetry } from '../common/retry.js';
import type { InstallationTokenManager } from './installation-token-manager.interface.js';

/**
 * GitHub의 installation access token은 발급 시점부터 1시간 동안 유효하다. 매 요청마다 새로
 * 발급받으면 불필요한 API 호출과 지연이 생기므로, 만료 10분 전(50분)까지는 캐시를 재사용한다.
 */
const TOKEN_TTL_SECONDS = 50 * 60;

interface CachedToken {
  token: string;
  expiresAt: number;
}

/**
 * GitHub App 인증의 실제 구현체.
 *
 * `@octokit/auth-app`의 `createAppAuth()`가 내부적으로 하는 일:
 * 1. App ID(`iss` claim)와 만료시간(`exp`, 최대 10분)을 담은 JWT를 private key(RS256)로 직접 서명한다
 *    — 별도 서버 요청 없이 로컬에서 암호학적으로 계산됨.
 * 2. `{ type: 'installation', installationId }`로 호출하면, 그 JWT를 Bearer 토큰으로 실어
 *    `POST /app/installations/{id}/access_tokens`를 호출해 installation token을 받아온다.
 * 3. `{ type: 'app' }`로 호출하면 JWT 자체를 그대로 반환한다 (교환 없이 App 신분 그대로 사용).
 *
 * 즉 우리가 짠 코드는 "언제 어떤 토큰을 요청할지"와 "받은 토큰을 얼마나 캐싱할지"만 관리하고,
 * JWT 서명·HTTP 호출 자체는 전부 라이브러리가 처리한다.
 */
@Injectable()
export class InstallationTokenManagerService implements InstallationTokenManager {
  private readonly appAuth: ReturnType<typeof createAppAuth>;
  /**
   * installationId → 토큰 캐시. 무상태 서비스라 DB/Redis 대신 프로세스 메모리에만 둔다 —
   * 서버가 재시작되면 캐시는 비워지고, 다음 요청 때 다시 발급받으면 그만이다.
   */
  private readonly tokenCache = new Map<number, CachedToken>();

  constructor() {
    const appId = process.env.GITHUB_APP_ID;
    const privateKey = process.env.GITHUB_PRIVATE_KEY;
    if (!appId || !privateKey) {
      throw new Error(
        'GITHUB_APP_ID or GITHUB_PRIVATE_KEY environment variable is not defined',
      );
    }
    // 인증 요청도 짧은 타임아웃 fetch로 나가야 withRetry가 재시도할 기회를 충분히 갖는다.
    const authRequest = new Octokit({
      request: { fetch: createTimedFetch() },
    }).request;
    this.appAuth = createAppAuth({
      appId,
      // .env 파일에 개행이 리터럴 "\n" 문자열로 저장되는 경우가 많아 실제 개행으로 되돌린다.
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
