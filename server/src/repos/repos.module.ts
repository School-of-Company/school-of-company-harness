import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { ReposController } from './repos.controller.js';
import { ReposService } from './repos.service.js';

@Module({
  // 추천을 만들 때 카탈로그 전체가 필요하다 (`ReposService.recommend`).
  imports: [CatalogModule],
  controllers: [ReposController],
  providers: [ReposService],
})
export class ReposModule {}
