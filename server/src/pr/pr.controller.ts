import { Body, Controller, Post } from '@nestjs/common';
import { PrService } from './pr.service.js';
import { CreatePrRequestDto, CreatePrResponseDto } from './pr.dto.js';

/**
 * `POST /pr` — "PR 생성" 버튼이 호출하는 엔드포인트.
 *
 * 검증은 두 층으로 나뉜다 (`.claude/rules/catalog.md`):
 * - 요청 형태(필드 존재·타입)는 전역 `ValidationPipe`가 DTO 데코레이터로 처리
 * - 비즈니스 규칙(미설치 레포, 없는 itemId 등)은 서비스에서 그냥 예외를 던진다
 *
 * DTO는 클래스이므로 `import type`으로 가져오지 않는다 — 런타임 타입이 지워지면 파이프가 동작하지 않는다.
 */
@Controller('pr')
export class PrController {
  constructor(private readonly prService: PrService) {}

  @Post()
  async create(@Body() dto: CreatePrRequestDto): Promise<CreatePrResponseDto> {
    return this.prService.createPr(dto);
  }
}
