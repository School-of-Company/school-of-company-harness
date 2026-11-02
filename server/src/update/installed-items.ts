import type { CatalogItem } from '../catalog/catalog.types.js';

/**
 * 대상 레포의 파일 목록에서 "이미 쓰고 있는" 카탈로그 항목을 추론한다.
 *
 * 서버는 상태를 저장하지 않으므로 "이 레포가 어떤 항목을 설치했는지"를 적어 둔 곳이 없다. 대신
 * 카탈로그 경로가 곧 배포 경로(`.claude/skills/<name>/` 등)라서, 대상 레포에 그 경로가 있으면
 * 설치된 것으로 본다 — 별도 매니페스트 없이 경로 규칙만으로 동작하는 이 카탈로그의 원칙과 같다.
 *
 * - 디렉터리 항목(경로가 `/`로 끝남): 그 아래 파일이 하나라도 있으면 설치됨. 접두어가 `/`까지
 *   포함하므로 `.claude/skills/test/`가 `.claude/skills/test-foo/`를 잘못 잡지 않는다
 * - 파일 항목(에이전트): 경로가 정확히 일치해야 설치됨
 *
 * 한계: 사용자가 직접 만든 같은 이름의 스킬도 설치된 것으로 잡힌다. 그 경우에도 결과는 PR로
 * 나가 사람이 diff를 보고 판단하므로, 감지를 더 엄격하게 만들지 않고 이 추론을 그대로 쓴다.
 */
export function findInstalledItems(
  catalog: CatalogItem[],
  treePaths: string[],
): CatalogItem[] {
  const exactPaths = new Set(treePaths);
  return catalog.filter((item) =>
    item.path.endsWith('/')
      ? treePaths.some((path) => path.startsWith(item.path))
      : exactPaths.has(item.path),
  );
}
