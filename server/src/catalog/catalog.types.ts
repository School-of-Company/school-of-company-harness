/**
 * 카테고리는 "어느 도구용인지 + 어떤 종류인지"를 한 값에 담는다.
 * 웹에서 그룹핑할 때, PR 본문을 만들 때, 훅 의존성을 판단할 때 모두 이 값으로 분기한다.
 */
export type CatalogCategory =
  | 'claude-skill'
  | 'claude-agent'
  | 'claude-hook'
  | 'codex-skill'
  | 'codex-agent'
  | 'codex-hook';

export interface CatalogItem {
  /** 경로에서 파생된 안정적인 식별자 (예: `claude/skills/git-commit`). 웹이 체크 상태로 들고 있는 값. */
  id: string;
  category: CatalogCategory;
  /** 표시용 이름 — 경로 마지막 세그먼트를 그대로 쓴다. */
  title: string;
  /** 진입점 파일 frontmatter의 `description`. 없을 수도 있다(훅 스크립트 등). */
  description?: string;
  /**
   * 카탈로그 루트 기준 상대 경로이자, **대상 레포에 배포될 경로**.
   * 트레일링 슬래시가 있으면 디렉터리(스킬/훅), 없으면 파일 하나(에이전트)라는 신호다.
   */
  path: string;
}
