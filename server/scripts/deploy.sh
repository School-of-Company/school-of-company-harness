#!/usr/bin/env bash
# VM에서 실행되는 배포 스크립트. 인자 하나: 직전 배포의 커밋 SHA (`git pull` 하기 전의 HEAD).
#
# 카탈로그(.claude/.agents/.codex)만 바뀐 배포는 항목을 요청마다 파일에서 읽기 때문에 pull만으로
# 끝난다. `server/`가 바뀐 경우에만 의존성 설치·빌드·재시작을 한다 — 재시작하는 몇 초 동안은
# 대시보드가 응답을 받지 못해서, 필요 없을 때는 하지 않는다.
set -euo pipefail

before="${1:?직전 커밋 SHA가 필요합니다}"
cd "$(dirname "$0")/../.."
after="$(git rev-parse HEAD)"
health_url="${HEALTH_URL:-http://localhost:80/catalog}"

if [ "$before" = "$after" ]; then
  echo "새 커밋 없음 ($after)"
  exit 0
fi

echo "배포: ${before:0:7} -> ${after:0:7}"

if git diff --name-only "$before" "$after" | grep -q '^server/'; then
  echo "server/ 변경 — 설치·빌드·재시작"
  cd server
  npm ci --no-audit --no-fund
  npm run build
  sudo systemctl restart harness

  # 기동 직후엔 포트가 아직 열리지 않았을 수 있어 잠시 기다린다.
  for _ in $(seq 1 15); do
    if curl -fsS -o /dev/null "$health_url"; then
      echo "상태 확인 통과: $health_url"
      exit 0
    fi
    sleep 1
  done
  echo "상태 확인 실패: $health_url" >&2
  systemctl status harness --no-pager -n 20 >&2 || true
  exit 1
fi

echo "카탈로그만 변경 — 재시작 없음"
