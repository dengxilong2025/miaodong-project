#!/usr/bin/env bash
set -euo pipefail

# 将 seed JSON 导入数据库（通过生成 SQL + psql 执行）
# 需要：Go + psql(Postgres client)
#
# 用法：
#   MIAODONG_DSN="postgres://postgres:postgres@localhost:5432/miaodong?sslmode=disable" ./scripts/db/seed.sh

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DSN="${MIAODONG_DSN:-postgres://postgres:postgres@localhost:5432/miaodong?sslmode=disable}"
TMP_SQL="${TMPDIR:-/tmp}/miaodong-seed.sql"

echo "[seed] generate sql -> ${TMP_SQL}"
(
  cd "${ROOT_DIR}/services/api" && \
  go run ./cmd/seed --out "${TMP_SQL}"
)

echo "[seed] apply sql via psql"
psql "${DSN}" -f "${TMP_SQL}"

echo "[seed] done"

