import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { PrModule } from '../pr/pr.module.js';
import { ReposModule } from '../repos/repos.module.js';
import { UpdateService } from './update.service.js';

/**
 * 컨트롤러가 없다 — 일괄 업데이트는 HTTP 엔드포인트가 아니라 `update-cli.ts`로만 실행한다.
 * 그래서 `AppModule`에도 등록하지 않는다 (공개 API에 새 경로를 만들지 않기 위해).
 */
@Module({
  imports: [CatalogModule, PrModule, ReposModule],
  providers: [UpdateService],
  exports: [UpdateService],
})
export class UpdateModule {}
