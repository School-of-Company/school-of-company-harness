import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  RecommendationRequestDto,
  RecommendationResponseDto,
} from './recommendation.dto.js';
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

  /**
   * `GET /repos/:owner/:repo/recommendation?installationId=...`
   *
   * 대상 레포에 맞는 항목을 추천한다. **조회 전용이고, 아무것도 막지 않는다** — `POST /pr`은
   * 이 결과를 검사하지 않으므로 사용자는 `not-applicable` 항목도 그대로 보낼 수 있다.
   * 판단이 틀릴 수 있는 추론(레포가 가진 파일로 스택을 짐작하는 일)이라, 화면에서 경고로만
   * 보여주고 결정은 사람에게 남긴다.
   */
  @Get(':owner/:repo/recommendation')
  async recommend(
    @Param('owner') owner: string,
    @Param('repo') repo: string,
    @Query() query: Omit<RecommendationRequestDto, 'owner' | 'repo'>,
  ): Promise<RecommendationResponseDto> {
    const dto = new RecommendationRequestDto();
    dto.owner = owner;
    dto.repo = repo;
    dto.installationId = query.installationId;
    return this.reposService.recommend(dto);
  }
}
