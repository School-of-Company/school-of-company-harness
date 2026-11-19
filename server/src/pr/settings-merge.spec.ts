import { describe, expect, it } from 'vitest';
import { mergeClaudeSettings } from './settings-merge.js';

/** 하네스가 얹는 wiring 조각 (`.claude/templates/settings-hooks.json`과 같은 모양). */
const OUR_HOOKS = {
  hooks: {
    PreToolUse: [
      {
        matcher: 'Bash',
        hooks: [{ type: 'command', command: '.claude/hooks/preToolUse.sh' }],
      },
    ],
    PostToolUse: [
      {
        matcher: 'Edit|Write',
        hooks: [{ type: 'command', command: '.claude/hooks/postToolUse.sh' }],
      },
    ],
  },
};

describe('mergeClaudeSettings', () => {
  it('대상 레포가 직접 추가한 훅 항목을 지우지 않는다', () => {
    const base = {
      hooks: {
        PreToolUse: [
          {
            matcher: 'Bash(git commit*)',
            hooks: [{ type: 'command', command: '.claude/hooks/preCommit.sh' }],
          },
        ],
      },
    };

    const merged = mergeClaudeSettings(base, OUR_HOOKS);

    expect(merged.hooks).toEqual({
      PreToolUse: [base.hooks.PreToolUse[0], OUR_HOOKS.hooks.PreToolUse[0]],
      PostToolUse: [OUR_HOOKS.hooks.PostToolUse[0]],
    });
  });

  it('우리 항목이 이미 걸려 있으면 아무것도 바꾸지 않는다 (멱등)', () => {
    // 실제 사례: 대상 레포가 우리 dispatcher를 이미 쓰면서 자기 훅을 덧붙여 둔 상태.
    const base = {
      language: 'korean',
      hooks: {
        PreToolUse: [
          OUR_HOOKS.hooks.PreToolUse[0],
          {
            matcher: 'Bash(git commit*)',
            hooks: [{ type: 'command', command: '.claude/hooks/preCommit.sh' }],
          },
        ],
        PostToolUse: [OUR_HOOKS.hooks.PostToolUse[0]],
      },
      permissions: { allow: ['Bash(git status:*)'] },
    };

    expect(mergeClaudeSettings(base, OUR_HOOKS)).toEqual(base);
  });

  it('훅과 무관한 최상위 키는 그대로 보존한다', () => {
    const base = {
      language: 'korean',
      permissions: { allow: ['Bash(git status:*)'] },
      enabledPlugins: ['some-plugin'],
    };

    const merged = mergeClaudeSettings(base, OUR_HOOKS);

    expect(merged.language).toBe('korean');
    expect(merged.permissions).toEqual({ allow: ['Bash(git status:*)'] });
    expect(merged.enabledPlugins).toEqual(['some-plugin']);
    expect(merged.hooks).toEqual(OUR_HOOKS.hooks);
  });

  it('우리가 쓰지 않는 이벤트도 잃지 않는다', () => {
    const base = {
      hooks: {
        SessionStart: [
          {
            hooks: [{ type: 'command', command: '.claude/hooks/session.sh' }],
          },
        ],
      },
    };

    const merged = mergeClaudeSettings(base, OUR_HOOKS) as {
      hooks: Record<string, unknown>;
    };

    expect(merged.hooks.SessionStart).toEqual(base.hooks.SessionStart);
    expect(merged.hooks.PreToolUse).toEqual(OUR_HOOKS.hooks.PreToolUse);
  });

  it('훅 설정이 없는 레포에는 우리 것만 들어간다', () => {
    expect(mergeClaudeSettings({}, OUR_HOOKS).hooks).toEqual(OUR_HOOKS.hooks);
  });

  it('같은 명령이 다른 matcher로 걸려 있으면 중복 추가하지 않는다', () => {
    // dispatcher를 두 번 실행할 이유는 없으므로, matcher 표기가 달라도 연결된 것으로 본다.
    const base = {
      hooks: {
        PreToolUse: [
          {
            matcher: 'Bash(*)',
            hooks: [
              { type: 'command', command: '.claude/hooks/preToolUse.sh' },
            ],
          },
        ],
      },
    };

    const merged = mergeClaudeSettings(base, OUR_HOOKS) as {
      hooks: Record<string, unknown[]>;
    };

    expect(merged.hooks.PreToolUse).toHaveLength(1);
  });
});

/** 지금 템플릿(`.claude/templates/settings-hooks.json`)과 같은 모양. */
const CURRENT_HOOKS = {
  hooks: {
    PreToolUse: [
      {
        matcher: 'Bash|Write|Edit',
        hooks: [
          {
            type: 'command',
            command: '"$CLAUDE_PROJECT_DIR"/.claude/hooks/preToolUse.sh',
          },
        ],
      },
    ],
    PostToolUse: [
      {
        matcher: 'Edit|Write',
        hooks: [
          {
            type: 'command',
            command: '"$CLAUDE_PROJECT_DIR"/.claude/hooks/postToolUse.sh',
          },
        ],
      },
    ],
  },
};

describe('mergeClaudeSettings — 이미 설치된 예전 wiring 승급', () => {
  const legacy = {
    hooks: {
      PreToolUse: [OUR_HOOKS.hooks.PreToolUse[0]],
      PostToolUse: [OUR_HOOKS.hooks.PostToolUse[0]],
    },
  };

  it('상대 경로·Bash 전용이던 항목을 새 모양으로 올리되 항목을 늘리지 않는다', () => {
    const merged = mergeClaudeSettings(legacy, CURRENT_HOOKS);

    // Bash 만 걸면 Write/Edit 를 검사하는 secret-guard 가 실행되지 않는다
    expect(merged.hooks).toEqual(CURRENT_HOOKS.hooks);
  });

  it('사람이 일부러 좁힌 matcher 는 그대로 두고 경로만 고친다', () => {
    const base = {
      hooks: {
        PreToolUse: [
          {
            matcher: 'Bash(git push*)',
            hooks: [
              { type: 'command', command: '.claude/hooks/preToolUse.sh' },
            ],
          },
        ],
      },
    };

    const merged = mergeClaudeSettings(base, CURRENT_HOOKS);
    const entries = (merged.hooks as typeof CURRENT_HOOKS.hooks).PreToolUse;

    expect(entries).toHaveLength(1);
    expect(entries[0].matcher).toBe('Bash(git push*)');
    expect(entries[0].hooks[0].command).toBe(
      '"$CLAUDE_PROJECT_DIR"/.claude/hooks/preToolUse.sh',
    );
  });

  it('승급한 뒤 다시 병합해도 아무것도 바뀌지 않는다 (멱등)', () => {
    const once = mergeClaudeSettings(legacy, CURRENT_HOOKS);
    expect(mergeClaudeSettings(once, CURRENT_HOOKS)).toEqual(once);
  });

  it('같은 항목에 섞여 있는 대상 레포의 다른 명령은 건드리지 않는다', () => {
    const base = {
      hooks: {
        PreToolUse: [
          {
            matcher: 'Bash',
            hooks: [
              { type: 'command', command: '.claude/hooks/preToolUse.sh' },
              { type: 'command', command: '.claude/hooks/mine.sh' },
            ],
          },
        ],
      },
    };

    const merged = mergeClaudeSettings(base, CURRENT_HOOKS);
    const [entry] = (merged.hooks as typeof CURRENT_HOOKS.hooks).PreToolUse;

    expect(entry.hooks.map((hook) => hook.command)).toEqual([
      '"$CLAUDE_PROJECT_DIR"/.claude/hooks/preToolUse.sh',
      '.claude/hooks/mine.sh',
    ]);
  });
});
