import { Controller, Get } from '@nestjs/common';
import { CatalogService } from './catalog.service.js';
import type { CatalogItem } from './catalog.types.js';

/**
 * `GET /catalog` — 체크박스 UI가 페이지 로드 시 한 번 호출한다.
 *
 * 웹이 다른 레포(`startup-official`)에 있어서 카탈로그 파일을 직접 읽을 수 없기 때문에,
 * 카탈로그가 있는 이 서버가 API로 내려줘야 한다.
 */
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get()
  list(): CatalogItem[] {
    return this.catalogService.listItems();
  }
}
