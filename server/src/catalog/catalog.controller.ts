import { Controller, Get } from '@nestjs/common';
import { CatalogService } from './catalog.service.js';
import type { CatalogItem } from './catalog.types.js';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get()
  list(): CatalogItem[] {
    return this.catalogService.listItems();
  }
}
