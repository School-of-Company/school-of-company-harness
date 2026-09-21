import { createHash } from 'crypto';
import type { CollectedFile } from './file-collector.js';

/**
 * "대상 레포에 이미 같은 내용이 있는 파일"을 걸러내기 위한 비교 로직.
 *
 * 왜 필요했나: 예전에는 고른 항목의 파일을 전부 커밋했다. 그래서 62개를 고르면 이미 최신인
 * 파일까지 다시 올라가 PR diff가 74개 파일로 부풀었고, 리뷰어는 "이번에 실제로 바뀐 게 무엇인지"를
 * 직접 골라내야 했다. 하네스는 같은 레포에 반복해서 쏘는 도구라서, **두 번째 실행은 변경분만
 * 남아야** 쓸 만하다.
 *
 * 비교는 GitHub에 올리기 전에 로컬에서 끝낸다. git이 파일 내용을 식별하는 방식(blob SHA)을
 * 그대로 계산하면, 대상 레포의 tree에 적힌 SHA와 문자열 비교만으로 동일 여부를 알 수 있다 —
 * 파일 내용을 하나씩 내려받을 필요가 없다.
 */

/** tree 응답에서 우리가 쓰는 부분만. `sha`는 blob SHA, `mode`는 파일 권한. */
export interface TreeEntry {
  path?: string;
  sha?: string | null;
  mode?: string;
  type?: string;
}

export type ChangeKind = 'added' | 'updated' | 'unchanged';

export interface ClassifiedFile {
  file: CollectedFile;
  kind: ChangeKind;
}

/**
 * git이 파일 하나에 부여하는 SHA를 계산한다.
 *
 * git은 파일 내용 앞에 `blob <바이트수>\0` 헤더를 붙인 뒤 SHA-1을 계산한다(그래서 같은 내용의
 * 파일은 어느 레포에 있든 같은 SHA가 된다). 여기서 같은 규칙으로 계산해야 GitHub이 tree에
 * 적어둔 SHA와 비교가 성립한다.
 */
export function gitBlobSha(content: string): string {
  const data = Buffer.from(content, 'utf-8');
  return createHash('sha1')
    .update(`blob ${data.length}\0`)
    .update(data)
    .digest('hex');
}

/**
 * 파일 권한 모드. 훅은 실행 파일이라 `100755`로 올려야 한다 — `settings.json`이
 * `.claude/hooks/preToolUse.sh`를 명령으로 직접 실행하므로, 실행 권한이 없으면
 * 대상 레포에서 훅이 "Permission denied"로 죽는다.
 */
export function modeFor(path: string): '100644' | '100755' {
  return path.endsWith('.sh') ? '100755' : '100644';
}

/**
 * 올릴 파일들을 대상 레포의 현재 tree와 비교해 신규/변경/동일로 나눈다.
 *
 * 내용이 같아도 실행 권한이 다르면 변경으로 본다 — `.sh` 파일을 `100644`로 올려두던 시절에
 * 만들어진 레포는 내용만 같고 권한이 틀린 상태이므로, 그걸 고쳐 보내야 한다.
 */
export function classifyFiles(
  files: CollectedFile[],
  baseEntries: TreeEntry[],
): ClassifiedFile[] {
  const existing = new Map<string, TreeEntry>();
  for (const entry of baseEntries) {
    if (entry.type === 'blob' && entry.path) existing.set(entry.path, entry);
  }

  return files.map((file) => {
    const current = existing.get(file.path);
    if (!current) return { file, kind: 'added' as const };

    const sameContent = current.sha === gitBlobSha(file.content);
    const sameMode = current.mode === modeFor(file.path);
    return {
      file,
      kind:
        sameContent && sameMode ? ('unchanged' as const) : ('updated' as const),
    };
  });
}
