#!/usr/bin/env bash
set -euo pipefail

# 一键测试脚本：
# - 不依赖 Docker 的校验：seed/文档/品牌词
# - 若环境存在 Go / Python 依赖则跑对应单测

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "[test] root: ${ROOT_DIR}"

python3 "${ROOT_DIR}/scripts/ci/validate_repo.py"

if command -v go >/dev/null 2>&1; then
  if [[ -f "${ROOT_DIR}/services/api/go.mod" ]]; then
    echo "[test] go test ./... (services/api)"
    (cd "${ROOT_DIR}/services/api" && go test ./...)
  fi
else
  echo "[test] go not found, skip go tests"
fi

if [[ -f "${ROOT_DIR}/services/inference/requirements.txt" ]]; then
  echo "[test] python tests (services/inference)"
  python3 -m pip install -r "${ROOT_DIR}/services/inference/requirements.txt" --break-system-packages
  (cd "${ROOT_DIR}/services/inference" && python3 -m pytest -q)
fi

echo "[test] done"

