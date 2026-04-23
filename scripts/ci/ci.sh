#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "[CI] repo root: ${ROOT_DIR}"

python3 "${ROOT_DIR}/scripts/ci/validate_repo.py"

echo "[CI] done"

