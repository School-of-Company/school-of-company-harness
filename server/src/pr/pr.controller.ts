import { Body, Controller, Post } from '@nestjs/common';
import { PrService } from './pr.service.js';
import type { CreatePrRequest, CreatePrResponse } from './pr.dto.js';

/**
 * `POST /pr` — "PR 생성" 버튼이 호출하는 엔드포인트.
 *
 * DTO를 `class-validator`로 검증하지 않는 이유: 잘못된 입력은 방어하지 않고 그대로 예외를
 * 던지는 정책이다 (`.claude/rules/server.md`). 인터페이스는 컴파일 타임 타입 안전성 용도이고,
 * 런타임 검증 계층은 의도적으로 두지 않았다.
 */
@Controller('pr')
export class PrController {
  constructor(private readonly prService: PrService) {}

  @Post()
  async create(@Body() request: CreatePrRequest): Promise<CreatePrResponse> {
    return this.prService.createPr(request);
  }
}
