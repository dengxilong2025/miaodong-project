#!/usr/bin/env bash
set -euo pipefail

# 本地开发环境启动脚本（依赖 Docker + docker compose）
# - 启动 Postgres / MinIO / Redis
# - 供本机与 CI 复用

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v docker >/dev/null 2>&1; then
  echo "[dev-up] docker not found. Please install Docker Desktop / Docker Engine first." >&2
  exit 127
fi

echo "[dev-up] root: ${ROOT_DIR}"
docker compose -f "${ROOT_DIR}/infra/docker-compose.yml" up -d
docker compose -f "${ROOT_DIR}/infra/docker-compose.yml" ps

