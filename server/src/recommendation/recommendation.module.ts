import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { RecommendationController } from './recommendation.controller.js';
import { RecommendationService } from './recommendation.service.js';

@Module({
  // 추천은 "카탈로그 전체"와 "대상 레포"를 맞춰보는 일이라 카탈로그가 필요하다.
  imports: [CatalogModule],
  controllers: [RecommendationController],
  providers: [RecommendationService],
})
export class RecommendationModule {}
