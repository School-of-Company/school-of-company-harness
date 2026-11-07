#!/usr/bin/env bash
# VM에서 실행되는 배포 스크립트. 인자 하나: 직전 배포의 커밋 SHA (`git pull` 하기 전의 HEAD).
#
# 무엇을 할지는 SSH 클라이언트가 보낸 명령(`SSH_ORIGINAL_COMMAND`)이 정하고, 아래 목록에 있는 것만
# 실행한다. 배포 키는 `~/deploy-harness.sh` 하나만 실행하도록 고정돼 있는데, 거기서 이 스크립트가
# 불려 오므로 이 목록이 곧 그 키로 할 수 있는 일의 전부다.
#
#   (없음) | deploy          배포한다. 카탈로그가 바뀌었으면 이미 쓰는 레포의 develop으로 갱신 PR도 연다
#   update-repos             배포 없이 갱신 PR만 연다 — 기본 브랜치 기준 (develop이 없는 레포용)
#   update-repos --dry-run   무엇이 갱신 대상인지만 보여준다
#   update-repos --base develop [--dry-run]
#                            PR의 기준 브랜치를 develop으로 한다 (develop이 없는 레포는 건너뛴다)
#
# 카탈로그(.claude/.agents/.codex)만 바뀐 배포는 항목을 요청마다 파일에서 읽기 때문에 pull만으로
# 끝난다. `server/`가 바뀐 경우에만 의존성 설치·빌드·재시작을 한다 — 재시작하는 몇 초 동안은
# 대시보드가 응답을 받지 못해서, 필요 없을 때는 하지 않는다.
set -euo pipefail

before="${1:?직전 커밋 SHA가 필요합니다}"
command="${SSH_ORIGINAL_COMMAND:-deploy}"

case "$command" in
  deploy | update-repos | "update-repos --dry-run" | \
    "update-repos --base develop" | "update-repos --base develop --dry-run") ;;
  *)
    echo "허용되지 않은 명령: $command" >&2
    exit 2
    ;;
esac

cd "$(dirname "$0")/../.."
after="$(git rev-parse HEAD)"
health_url="${HEALTH_URL:-http://localhost:80/catalog}"

# 배포되는 카탈로그 항목의 경로. `.claude/rules`는 이 레포 자신을 위한 규칙이라 대상 레포에 가지 않는다.
catalog_changed() {
  git diff --name-only "$before" "$after" |
    grep -qE '^(\.claude/(skills|agents|hooks|templates|shared)/|\.agents/|\.codex/)'
}

update_repos() {
  echo "이미 쓰는 레포 갱신: $1"
  (cd server && node dist/update-cli.js $2)
}

case "$command" in
  update-repos)
    update_repos "PR 생성" "--apply"
    exit 0
    ;;
  "update-repos --dry-run")
    update_repos "dry-run" ""
    exit 0
    ;;
  "update-repos --base develop")
    update_repos "PR 생성 (기준 develop)" "--apply --base develop"
    exit 0
    ;;
  "update-repos --base develop --dry-run")
    update_repos "dry-run (기준 develop)" "--base develop"
    exit 0
    ;;
esac

if [ "$before" = "$after" ]; then
  echo "새 커밋 없음 ($after)"
  exit 0
fi

echo "배포: ${before:0:7} -> ${after:0:7}"

if git diff --name-only "$before" "$after" | grep -q '^server/'; then
  echo "server/ 변경 — 설치·빌드·재시작"
  (
    cd server
    npm ci --no-audit --no-fund
    npm run build
  )
  sudo systemctl restart harness

  # 기동 직후엔 포트가 아직 열리지 않았을 수 있어 잠시 기다린다.
  healthy=false
  for _ in $(seq 1 15); do
    if curl -fsS -o /dev/null "$health_url"; then
      healthy=true
      break
    fi
    sleep 1
  done
  if [ "$healthy" != true ]; then
    echo "상태 확인 실패: $health_url" >&2
    systemctl status harness --no-pager -n 20 >&2 || true
    exit 1
  fi
  echo "상태 확인 통과: $health_url"
else
  echo "카탈로그만 변경 — 재시작 없음"
fi

# 서비스가 정상일 때만 퍼뜨린다. 방금 올린 빌드가 죽어 있는데 여러 레포에 PR을 여는 일은 없어야 한다.
# 자동으로 열리는 PR은 develop으로 향한다. 대상 레포 대부분은 기본 브랜치(main)가 곧 운영 배포 브랜치라서,
# 사람이 보지 않는 사이 거기에 PR이 열려 있는 일이 없어야 한다. develop이 없는 레포는 건너뛴다 —
# 그런 레포는 `update-repos`로 사람이 직접 연다.
# 변경 여부는 GitHub가 알려 주는 `before`가 아니라 이 VM이 직전에 실제로 배포한 커밋과 비교한다 —
# 연속 머지로 중간 배포가 취소돼도 그 사이의 카탈로그 변경을 놓치지 않는다.
if catalog_changed; then
  update_repos "PR 생성 (기준 develop)" "--apply --base develop"
else
  echo "카탈로그 변경 없음 — 갱신 PR 생략"
fi
