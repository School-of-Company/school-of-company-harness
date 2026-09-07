/**
 * `.claude/settings.json` 병합 로직.
 *
 * PR 생성 로직에서 떼어낸 순수 함수다 — 네트워크도 파일시스템도 건드리지 않으므로 테스트로
 * 동작을 못 박아둘 수 있다. 실제로 이 파일은 "대상 레포의 훅 설정이 조용히 지워지는" 버그를
 * 고치면서 생겼다(아래 `mergeHooks` 주석 참고).
 */

/** settings.json의 훅 한 항목. `matcher`에 걸리면 `hooks`의 명령들이 실행된다. */
interface HookEntry {
  matcher?: string;
  hooks?: { type?: string; command?: string }[];
}

/** 이벤트 이름(`PreToolUse`, `PostToolUse` …) → 그 이벤트의 훅 항목 목록. */
type HooksByEvent = Record<string, HookEntry[]>;

/** 한 훅 항목이 실행하는 명령들을 모은다 — 중복 판정의 기준이 된다. */
function commandsOf(entry: HookEntry): string[] {
  return (entry.hooks ?? [])
    .map((hook) => hook.command)
    .filter((command): command is string => typeof command === 'string');
}

function isHookEntryArray(value: unknown): value is HookEntry[] {
  return Array.isArray(value);
}

/**
 * 이벤트별 훅 목록을 **더한다**.
 *
 * 원래는 `{ ...base, hooks: 우리것 }`으로 `hooks` 키를 통째로 갈아끼웠다. 최상위 키
 * (`permissions`, `language` …)는 보존되니 괜찮아 보였지만, `hooks` **안쪽**에 대상 레포가
 * 직접 추가한 항목이 있으면 그게 전부 사라졌다. 실제로 한 레포는 `Bash(git commit*)`에
 * 자기 `preCommit.sh`를 걸어 쓰고 있었는데, 하네스 PR을 머지하면 파일은 남고 호출만 없어져
 * 훅이 조용히 죽는 상태가 됐다.
 *
 * 그래서 교체가 아니라 append 하고, 이미 같은 명령이 걸려 있으면 건너뛴다:
 *
 * - 대상 레포가 손으로 넣은 항목은 그대로 남는다
 * - 같은 레포에 하네스 PR을 여러 번 보내도 dispatcher 항목이 쌓이지 않는다 (멱등)
 * - 우리 항목이 이미 있는 레포에서는 이 파일이 diff에 아예 나타나지 않는다
 *
 * 중복 판정을 `matcher`가 아니라 **명령 경로**로 하는 이유: dispatcher를 두 번 실행할 이유는
 * 없으므로, matcher 표기가 조금 달라도 같은 스크립트를 가리키면 이미 연결된 것으로 본다.
 */
function mergeHooks(baseHooks: unknown, ourHooks: HooksByEvent): HooksByEvent {
  const base: Record<string, unknown> =
    typeof baseHooks === 'object' && baseHooks !== null
      ? { ...(baseHooks as Record<string, unknown>) }
      : {};

  const merged: HooksByEvent = {};
  // 대상 레포에만 있는 이벤트(우리가 쓰지 않는 종류)도 잃지 않도록 먼저 옮겨 담는다.
  for (const [event, entries] of Object.entries(base)) {
    if (isHookEntryArray(entries)) merged[event] = [...entries];
  }

  for (const [event, ourEntries] of Object.entries(ourHooks)) {
    const existing = merged[event] ?? [];
    const wired = new Set(existing.flatMap(commandsOf));
    const toAdd = ourEntries.filter((entry) => {
      const commands = commandsOf(entry);
      // 명령이 하나라도 아직 안 걸려 있으면 추가한다.
      return commands.some((command) => !wired.has(command));
    });
    merged[event] = [...existing, ...toAdd];
  }

  return merged;
}

/**
 * 대상 레포의 기존 settings에 우리 훅 wiring을 얹은 결과를 돌려준다.
 *
 * 최상위 키는 얕은 병합으로 보존하고(우리가 관여하는 건 `hooks` 하나뿐이다), `hooks`만
 * `mergeHooks`로 항목 단위 병합한다.
 */
export function mergeClaudeSettings(
  base: Record<string, unknown>,
  hooksFragment: { hooks?: unknown },
): Record<string, unknown> {
  const ourHooks: HooksByEvent =
    typeof hooksFragment.hooks === 'object' && hooksFragment.hooks !== null
      ? (hooksFragment.hooks as HooksByEvent)
      : {};

  return { ...base, hooks: mergeHooks(base.hooks, ourHooks) };
}
