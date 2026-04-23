#!/usr/bin/env bash
set -euo pipefail

# 数据库迁移（需要：Go + goose + Postgres）
# 用法：
#   MIAODONG_DSN="postgres://postgres:postgres@localhost:5432/miaodong?sslmode=disable" ./scripts/db/migrate.sh

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DSN="${MIAODONG_DSN:-postgres://postgres:postgres@localhost:5432/miaodong?sslmode=disable}"

if ! command -v goose >/dev/null 2>&1; then
  echo "[migrate] goose not found, installing..."
  go install github.com/pressly/goose/v3/cmd/goose@latest
  export PATH="$(go env GOPATH)/bin:${PATH}"
fi

echo "[migrate] DSN=${DSN}"
goose -dir "${ROOT_DIR}/services/api/migrations" postgres "${DSN}" up

