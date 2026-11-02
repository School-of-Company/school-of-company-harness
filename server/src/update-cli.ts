import { NestFactory } from '@nestjs/core';
import { UpdateCliModule } from './update/update-cli.module.js';
import {
  UpdateService,
  type RepoUpdateResult,
  type UpdateStatus,
} from './update/update.service.js';

const USAGE = `사용법: npm run update:repos -- [--apply] [--only owner/repo[,owner/repo...]] [--base 브랜치]

  (옵션 없음)  dry-run — 아무것도 쓰지 않고 어떤 레포가 갱신 대상인지만 보여준다
  --apply      바뀐 레포에 실제로 PR을 만든다
  --only       지정한 레포만 대상으로 한다 (쉼표로 구분)
  --base       PR의 기준 브랜치로 우선 쓸 이름 (예: develop). 그 브랜치가 없는 레포는 기본 브랜치를 쓴다

  --only 없이는 카탈로그 원본 레포와 같은 계정의 레포만 대상이다 (원본 레포 자신은 항상 제외).
  다른 계정의 레포는 --only로 이름을 적어야 처리한다.`;

const LABELS: Record<UpdateStatus, string> = {
  created: 'PR 생성',
  'would-update': '갱신 대상',
  'up-to-date': '최신',
  'open-pr': '열린 PR 있음',
  'no-harness': '하네스 미사용',
  skipped: '건너뜀',
  error: '오류',
};

function parseArgs(argv: string[]): {
  apply: boolean;
  only?: string[];
  base?: string;
} {
  let apply = false;
  let only: string[] | undefined;
  let base: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply') {
      apply = true;
    } else if (arg === '--only' || arg.startsWith('--only=')) {
      const value = arg === '--only' ? argv[++i] : arg.slice('--only='.length);
      if (!value) throw new Error(`--only에 값이 없습니다.\n\n${USAGE}`);
      only = value.split(',').map((name) => name.trim());
    } else if (arg === '--base' || arg.startsWith('--base=')) {
      const value = arg === '--base' ? argv[++i] : arg.slice('--base='.length);
      if (!value) throw new Error(`--base에 값이 없습니다.\n\n${USAGE}`);
      base = value.trim();
    } else {
      throw new Error(`알 수 없는 옵션: ${arg}\n\n${USAGE}`);
    }
  }
  return { apply, only, base };
}

function line(result: RepoUpdateResult): string {
  const head = `${LABELS[result.status].padEnd(10)} ${result.owner}/${result.repo}`;
  const tail = [
    result.items && `항목 ${result.items.length}개`,
    result.fileCount && `파일 ${result.fileCount}개`,
    result.baseBranch && `기준 ${result.baseBranch}`,
    result.url,
    result.detail,
  ].filter(Boolean);
  return tail.length > 0 ? `${head}  ${tail.join(' · ')}` : head;
}

async function main() {
  let options: ReturnType<typeof parseArgs>;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    // 사용법 오류는 스택 트레이스 없이 메시지만 보여준다.
    console.error((error as Error).message);
    process.exitCode = 2;
    return;
  }
  const { apply, only, base } = options;
  const app = await NestFactory.createApplicationContext(UpdateCliModule, {
    logger: ['error', 'warn'],
  });

  console.log(
    apply
      ? '실행 모드: --apply (바뀐 레포에 PR을 만듭니다)\n'
      : '실행 모드: dry-run (아무것도 쓰지 않습니다. 실제로 올리려면 --apply)\n',
  );

  const results = await app.get(UpdateService).run({ apply, only, base });
  for (const result of results) console.log(line(result));

  // `--only`로 적은 이름이 App이 접근할 수 있는 레포에 없으면, 오타인지 권한 문제인지 알려준다.
  const seen = new Set(results.map(({ owner, repo }) => `${owner}/${repo}`));
  const missing = (only ?? []).filter((name) => !seen.has(name));
  if (missing.length > 0) {
    console.log(`\nApp이 설치된 레포 목록에 없음: ${missing.join(', ')}`);
  }

  const count = (status: UpdateStatus) =>
    results.filter((result) => result.status === status).length;
  console.log(
    `\n총 ${results.length}개 레포 — ${apply ? `PR 생성 ${count('created')}` : `갱신 대상 ${count('would-update')}`}` +
      ` · 최신 ${count('up-to-date')} · 열린 PR ${count('open-pr')}` +
      ` · 하네스 미사용 ${count('no-harness')} · 건너뜀 ${count('skipped')} · 오류 ${count('error')}`,
  );

  await app.close();
  if (count('error') > 0) process.exitCode = 1;
}
await main();
