import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import { createTimedFetch } from '../common/timed-fetch.js';
import type { InstallationTokenManager } from './installation-token-manager.interface.js';
import { loadPrivateKey } from './private-key.js';

/**
 * GitHub App 인증의 실제 구현체.
 *
 * 토큰 발급·캐싱·갱신을 직접 하지 않고 `authStrategy`로 `@octokit/auth-app`에 전부 위임한다.
 *
 * 처음에는 installation token을 직접 발급받아 `Map`에 담아두고 재사용했는데(만료 10분 전까지),
 * 오래 떠 있는 프로세스에서 `401 Bad credentials`가 재현됐다 — 재시작하면 즉시 정상, 같은 코드를
 * 새 프로세스로 단독 실행하면 정상이었으니 캐시된 토큰이 원인이었다. 만료 계산을 손으로 하는 대신
 * 라이브러리에 맡기면:
 *
 * - GitHub이 응답에 준 실제 만료 시각을 기준으로 캐싱하고, 만료되면 알아서 새로 받는다
 * - 인증 헤더 스킴(`token` vs `bearer`)도 토큰 종류에 맞게 붙여준다
 * - App JWT(최대 10분)도 별도로 관리된다
 *
 * 즉 이 클래스는 이제 "어떤 신분으로 Octokit을 만들지"만 결정한다.
 */
@Injectable()
export class InstallationTokenManagerService implements InstallationTokenManager {
  private readonly appId: string;
  private readonly privateKey: string;

  constructor(config: ConfigService) {
    // getOrThrow: 값이 없으면 첫 조회 시점에 바로 실패한다 (fail fast).
    this.appId = config.getOrThrow<string>('GITHUB_APP_ID');
    this.privateKey = loadPrivateKey(config);
  }

  /** App JWT로 인증된 Octokit — "이 App이 어디에 설치되어 있는지" 같은 메타데이터 조회 전용. */
  getAppOctokit(): Promise<Octokit> {
    return Promise.resolve(
      new Octokit({
        authStrategy: createAppAuth,
        auth: { appId: this.appId, privateKey: this.privateKey },
        request: { fetch: createTimedFetch() },
      }),
    );
  }

  /** installation token으로 인증된 Octokit — 특정 레포에 커밋/PR 등 쓰기 작업을 할 때 사용. */
  getOctokit(installationId: number): Promise<Octokit> {
    return Promise.resolve(
      new Octokit({
        authStrategy: createAppAuth,
        auth: {
          appId: this.appId,
          privateKey: this.privateKey,
          installationId,
        },
        request: { fetch: createTimedFetch() },
      }),
    );
  }
}
