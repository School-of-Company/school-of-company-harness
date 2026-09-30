import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  RecommendationRequestDto,
  RecommendationResponseDto,
} from './recommendation.dto.js';
import { RecommendationService } from './recommendation.service.js';

/**
 * `GET /repos/:owner/:repo/recommendation?installationId=...`
 *
 * 경로를 `repos` 아래에 둔 이유는 웹에서 레포를 고른 직후 호출하는 값이기 때문이다
 * (`GET /repos`로 목록을 받고, 고른 하나에 대해 이걸 부른다).
 *
 * **조회 전용이고 아무것도 막지 않는다** — `POST /pr`은 이 결과를 검사하지 않으므로 사용자는
 * `not-applicable` 항목도 그대로 보낼 수 있다. 추론은 틀릴 수 있어서 결정은 사람에게 남긴다.
 */
@Controller('repos')
export class RecommendationController {
  constructor(private readonly recommendationService: RecommendationService) {}

  @Get(':owner/:repo/recommendation')
  async recommend(
    @Param('owner') owner: string,
    @Param('repo') repo: string,
    @Query() query: Pick<RecommendationRequestDto, 'installationId'>,
  ): Promise<RecommendationResponseDto> {
    const dto = new RecommendationRequestDto();
    dto.owner = owner;
    dto.repo = repo;
    dto.installationId = query.installationId;
    return this.recommendationService.recommend(dto);
  }
}
