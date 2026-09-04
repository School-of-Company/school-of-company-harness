import { ArrayNotEmpty, IsInt, IsString } from 'class-validator';

/**
 * 웹(체크박스 UI)이 "PR 생성" 버튼을 눌렀을 때 보내는 요청.
 *
 * 서버가 상태를 전혀 저장하지 않기 때문에, 이 한 번의 요청에 필요한 정보가 다 담겨야 한다:
 * - `installationId`: `GET /repos` 응답에 이미 들어있으므로 웹이 그대로 되돌려준다.
 *   (서버가 owner/repo로 다시 역추적하지 않아도 되게 해서 GitHub API 호출을 아낀다)
 * - `baseBranch`: 자동 감지하지 않고 명시적으로 받는다. 웹에서 대상 레포의 기본 브랜치를
 *   프리필해주되, 사용자가 `develop` 등으로 바꿀 수 있어야 하기 때문.
 * - `itemIds`: 체크된 카탈로그 항목 id 목록. 체크 상태는 브라우저 메모리에만 있고, 이 순간의
 *   스냅샷만 서버로 넘어온다.
 *
 * interface가 아니라 class인 이유: `ValidationPipe`와 `class-validator` 데코레이터는 런타임 타입이
 * 필요하다. 같은 이유로 이 DTO는 `import type`으로 가져오면 안 된다 (런타임 정보가 지워짐).
 */
export class CreatePrRequestDto {
  @IsString()
  owner: string;

  @IsString()
  repo: string;

  @IsInt()
  installationId: number;

  @IsString()
  baseBranch: string;

  @ArrayNotEmpty()
  @IsString({ each: true })
  itemIds: string[];
}

export class CreatePrResponseDto {
  /** 생성된 PR의 웹 URL — 웹이 바로 링크로 보여줄 수 있게 이것만 돌려준다. */
  url: string;
}
