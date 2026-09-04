import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { PrController } from './pr.controller.js';
import { PrService } from './pr.service.js';

/**
 * `CatalogModule`을 import하는 이유: PR을 만들 때 넘어온 `itemIds`를 실제 파일 경로로 해석해야
 * 하므로 `CatalogService`가 필요하다. (`InstallationTokenModule`은 `@Global()`이라 import 불필요)
 */
@Module({
  imports: [CatalogModule],
  controllers: [PrController],
  providers: [PrService],
})
export class PrModule {}
