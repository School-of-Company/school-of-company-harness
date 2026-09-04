import { Module } from '@nestjs/common';
import { InstallationTokenModule } from './installation-token/installation-token.module.js';
import { ReposModule } from './repos/repos.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { PrModule } from './pr/pr.module.js';

/**
 * 루트 모듈. 기능은 세 갈래뿐이다:
 * - `ReposModule` — 어디에 배포할 수 있는지 (`GET /repos`)
 * - `CatalogModule` — 무엇을 배포할 수 있는지 (`GET /catalog`)
 * - `PrModule` — 실제로 배포하기 (`POST /pr`)
 *
 * `InstallationTokenModule`은 기능이 아니라 인프라(GitHub 인증)라서 `@Global()`로 등록되고,
 * 여기서 한 번만 import하면 나머지 모듈이 전부 주입받아 쓸 수 있다.
 *
 * DB/캐시/큐 모듈이 없는 건 의도된 것이다 — 요청 하나가 조회→선택→PR 생성으로 끝나는
 * 완전 무상태 서비스라서 영속 계층이 필요 없다.
 */
@Module({
  imports: [InstallationTokenModule, ReposModule, CatalogModule, PrModule],
})
export class AppModule {}
