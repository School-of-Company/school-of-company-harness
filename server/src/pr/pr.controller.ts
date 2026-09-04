import { Body, Controller, Post } from '@nestjs/common';
import { PrService } from './pr.service.js';
import type { CreatePrRequest, CreatePrResponse } from './pr.dto.js';

@Controller('pr')
export class PrController {
  constructor(private readonly prService: PrService) {}

  @Post()
  async create(@Body() request: CreatePrRequest): Promise<CreatePrResponse> {
    return this.prService.createPr(request);
  }
}
