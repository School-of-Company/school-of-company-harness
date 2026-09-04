import { Controller, Get } from '@nestjs/common';
import { ReposService, type RegisteredRepo } from './repos.service.js';

/**
 * `GET /repos` — 배포 대상 레포 목록.
 *
 * 별도의 "레포 등록" 절차가 없다. GitHub App이 설치된 레포가 곧 등록된 레포이고, 매 요청마다
 * GitHub API로 라이브 조회하므로 DB에 목록을 보관할 필요가 없다 (App을 새로 설치/제거하면
 * 다음 조회에 바로 반영됨).
 */
@Controller('repos')
export class ReposController {
  constructor(private readonly reposService: ReposService) {}

  @Get()
  async list(): Promise<RegisteredRepo[]> {
    return this.reposService.listRepos();
  }
}
