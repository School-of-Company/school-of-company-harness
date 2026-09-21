import { Type } from 'class-transformer';
import { IsInt, IsString } from 'class-validator';
import type { ItemRecommendation } from './stack.js';

/**
 * `GET /repos/:owner/:repo/recommendation?installationId=...` 요청.
 *
 * `installationId`는 `GET /repos` 응답에 이미 들어 있으므로 웹이 그대로 되돌려준다 —
 * `POST /pr`과 같은 방식이다(서버가 owner/repo로 역추적하지 않아 GitHub 호출을 아낀다).
 *
 * 쿼리스트링은 값이 전부 문자열로 도착하므로 `@Type(() => Number)`로 변환한다.
 * 그게 없으면 `@IsInt()`가 `"158933875"`를 거절한다.
 */
export class RecommendationRequestDto {
  @IsString()
  owner: string;

  @IsString()
  repo: string;

  @Type(() => Number)
  @IsInt()
  installationId: number;
}

export class RecommendationResponseDto {
  /** 감지된 언어·프레임워크 (kotlin, typescript, nestjs …) */
  stacks: string[];

  /** 감지된 빌드·린트·테스트 도구 (gradle, ktlint, oxlint …) */
  tools: string[];

  /** 그렇게 판단한 근거 — 화면에서 "왜 이렇게 골랐는지" 보여주는 데 쓴다 */
  evidence: string[];

  /** 카탈로그 전체에 대한 추천 여부와 이유 */
  items: ItemRecommendation[];
}
