import { NotFoundException } from '@nestjs/common';
import { existsSync } from 'fs';
import { join } from 'path';
import { readCatalogFile, type CollectedFile } from './file-collector.js';

/**
 * 여러 항목이 같은 문서를 참조할 때, 그 문서를 자동으로 함께 보낸다.
 *
 * 왜 필요했나: `git-commit`과 `write-pr`은 같은 커밋 규칙을 따라야 하는데, 두 항목은 체크박스에서
 * 따로 선택된다. 그래서 규칙 텍스트를 각자 들고 있었고, 결국 갈라졌다 — `write-pr`은 "레포가 쓰는
 * 어휘를 읽어서 쓴다"로 고쳐졌는데 `git-commit`에는 이 레포에서 이미 폐기된 `web` scope가 남아,
 * 같은 레포에 둘 다 깔면 커밋과 PR의 scope 어휘가 서로 달라졌다.
 *
 * 해결은 훅에서 쓰던 것과 같은 모양이다(`hook-dependencies.ts`): 공용 문서를 `.claude/shared/`에
 * 한 벌만 두고, 그걸 참조하는 항목이 선택되면 서버가 문서를 자동으로 끼워 넣는다. 사용자는 여전히
 * 기능만 체크하고, 웹 UI에도 `shared/`는 체크박스로 노출되지 않는다(`CatalogService`의 스캔 대상이
 * 아니다).
 *
 * 등록 매니페스트를 두지 않는 이유도 카탈로그 전체와 같다 — **참조 자체가 메타데이터다.** 항목
 * 파일 안에 경로를 적으면 그게 곧 의존성 선언이고, "파일에 쓰고 매니페스트에 등록"이라는 두 단계
 * 중 후자를 깜빡해 조용히 빠지는 경우가 없다.
 */
const SHARED_REFERENCE = /(?:\.claude|\.agents)\/shared\/[A-Za-z0-9._/-]+\.md/g;

/**
 * 주어진 파일들의 내용에서 참조된 공용 문서 경로를 뽑는다.
 *
 * 값은 경로 → 그 경로를 처음 참조한 파일. 참조한 쪽을 들고 있어야, 카탈로그에 없는 경로를
 * 만났을 때 "어느 항목이 잘못 적었는지"를 에러 메시지에 담을 수 있다.
 *
 * 공용 문서가 또 다른 공용 문서를 참조하는 경우(중첩)는 따라가지 않는다. 지금 그런 문서가 없고,
 * 없는 동안에는 한 단계로 끝내는 편이 동작을 예측하기 쉽다.
 */
export function findSharedReferences(
  files: CollectedFile[],
): Map<string, string> {
  const referenced = new Map<string, string>();
  for (const file of files) {
    for (const match of file.content.matchAll(SHARED_REFERENCE)) {
      if (!referenced.has(match[0])) referenced.set(match[0], file.path);
    }
  }
  return referenced;
}

/**
 * 참조된 공용 문서를 읽어 전송 목록에 올린다.
 *
 * 카탈로그에 없는 경로를 참조하고 있으면 그냥 throw 한다 (`.claude/rules/server.md`) — 오타 난
 * 참조를 조용히 건너뛰면, 대상 레포에는 존재하지 않는 파일을 읽으라고 지시하는 스킬이 깔린다.
 * 그건 사용자가 고칠 수 있는 카탈로그 쪽 실수이므로 어느 파일의 어느 경로인지까지 알려준다.
 */
export function resolveSharedReferences(
  files: CollectedFile[],
  catalogRoot: string,
): CollectedFile[] {
  return [...findSharedReferences(files).entries()].map(([path, from]) => {
    if (!existsSync(join(catalogRoot, path))) {
      throw new NotFoundException(
        `${from}이(가) 참조하는 공용 문서 ${path}이(가) 카탈로그에 없습니다. 경로 오타인지 확인하거나 파일을 추가하세요.`,
      );
    }
    return { path, content: readCatalogFile(path, catalogRoot) };
  });
}
