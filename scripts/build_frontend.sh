#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"

node_ok() {
  command -v node >/dev/null 2>&1 || return 1
  node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>18||(a===18&&b>=18)?0:1)'
}

if node_ok; then
  echo "Сборка фронтенда: Node.js $(node -v)"
  (cd frontend && npm ci --no-audit --no-fund && npm run build && node scripts/export-static.mjs "$ROOT/static")
elif command -v docker >/dev/null 2>&1; then
  echo "Сборка фронтенда: Docker (node:22-alpine)"
  DOCKER=docker
  docker info >/dev/null 2>&1 || DOCKER="sudo docker"
  $DOCKER run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -e NEXT_TELEMETRY_DISABLED=1 \
    -v "$ROOT/frontend:/app" -v "$ROOT/static:/static" -w /app node:22-alpine \
    sh -c "npm ci --no-audit --no-fund && npm run build && node scripts/export-static.mjs /static"
else
  echo "Нужен Node.js 18.18+ или Docker, чтобы собрать фронтенд" >&2
  exit 1
fi
test -f static/index.html && echo "Готово: static/index.html"
