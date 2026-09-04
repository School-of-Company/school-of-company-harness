import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { PrController } from './pr.controller.js';
import { PrService } from './pr.service.js';

@Module({
  imports: [CatalogModule],
  controllers: [PrController],
  providers: [PrService],
})
export class PrModule {}
