import { createPrivateKey } from 'crypto';
import { readFileSync } from 'fs';
import type { ConfigService } from '@nestjs/config';

/**
 * GitHub App 개인키를 읽어 `@octokit/auth-app`이 받아들이는 형식으로 정규화한다.
 *
 * 두 가지 함정을 여기서 흡수한다:
 *
 * 1. **개행 전달** — PEM은 여러 줄인데 환경변수는 한 줄이다. `.env`에 `\n`으로 이스케이프해
 *    넣는 관행이 있지만, systemd `EnvironmentFile`은 그 이스케이프를 복원해주지 않아서 키가
 *    깨진 채로 넘어간다. 그래서 `GITHUB_PRIVATE_KEY_PATH`로 **파일 경로**를 주는 쪽을 권장하고,
 *    환경변수 방식도 하위 호환으로 계속 지원한다.
 *
 * 2. **키 형식** — GitHub이 내려주는 `.pem`은 PKCS#1(`BEGIN RSA PRIVATE KEY`)인데, 최신
 *    `@octokit/auth-app`이 쓰는 JWT 구현은 PKCS#8(`BEGIN PRIVATE KEY`)만 받는다. 그대로 넘기면
 *    `DECODER routines::unsupported`로 실패하므로, Node의 crypto로 PKCS#8로 변환해 넘긴다.
 *    (이미 PKCS#8이면 변환해도 그대로다)
 */
export function loadPrivateKey(config: ConfigService): string {
  const path = config.get<string>('GITHUB_PRIVATE_KEY_PATH');
  const raw = path
    ? readFileSync(path, 'utf-8')
    : config.getOrThrow<string>('GITHUB_PRIVATE_KEY').replace(/\\n/g, '\n');

  return createPrivateKey(raw)
    .export({ type: 'pkcs8', format: 'pem' })
    .toString();
}
