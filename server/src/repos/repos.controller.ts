import { Controller, Get } from '@nestjs/common';
import { ReposService, type RegisteredRepo } from './repos.service.js';

@Controller('repos')
export class ReposController {
  constructor(private readonly reposService: ReposService) {}

  @Get()
  async list(): Promise<RegisteredRepo[]> {
    return this.reposService.listRepos();
  }
}
