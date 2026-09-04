import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import type { ConfigService } from '@nestjs/config';

/**
 * 이 프로젝트는 `"type": "module"`(ESM)이라 CommonJS의 `__dirname` 전역 변수가 존재하지 않는다.
 * ESM에서는 대신 `import.meta.url`이 현재 모듈의 파일 URL(`file:///...`)을 주므로,
 * 이걸 실제 경로로 변환(`fileURLToPath`)한 뒤 디렉터리만 잘라내(`dirname`) 같은 값을 얻는다.
 */
const here = dirname(fileURLToPath(import.meta.url));

/**
 * 카탈로그(`.claude/`, `.agents/`, `.codex/`)가 있는 레포 루트의 기본값.
 *
 * 빌드 결과물이 `server/dist/catalog/catalog-root.js`에 놓이므로, 거기서 세 단계를 올라가면
 * (`catalog` → `dist` → `server` → 루트) 레포 루트가 된다.
 */
const DEFAULT_CATALOG_ROOT = resolve(here, '..', '..', '..');

/**
 * 배포 환경에서 디렉터리 구조가 달라질 수 있어 `CATALOG_ROOT`로 덮어쓸 수 있게 열어뒀다.
 * 환경변수는 `ConfigService`를 통해서만 읽는다 (`.claude/skills/nestjs-arch`).
 */
export function resolveCatalogRoot(config: ConfigService): string {
  return config.get<string>('CATALOG_ROOT') ?? DEFAULT_CATALOG_ROOT;
}
