#!/usr/bin/env bash
set -euo pipefail

# 生成“可覆盖本地目录”的发布包
# 用法：
#   ./scripts/package.sh /path/to/output.zip
#
# 说明：
# - 打包内容包含仓库代码与文档
# - 排除 .git、缓存与临时文件

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PARENT_DIR="$(cd "${ROOT_DIR}/.." && pwd)"
PROJECT_DIR_NAME="$(basename "${ROOT_DIR}")"
OUT="${1:-}"

if [[ -z "${OUT}" ]]; then
  echo "Usage: $0 /absolute/or/relative/output.zip" >&2
  exit 2
fi

mkdir -p "$(dirname "${OUT}")"

cd "${PARENT_DIR}"

echo "[package] project: ${PROJECT_DIR_NAME}"
echo "[package] root:    ${ROOT_DIR}"
echo "[package] parent:  ${PARENT_DIR}"
echo "[package] out:  ${OUT}"

# 解压后目录名保持为 `${PROJECT_DIR_NAME}/`，你可直接覆盖本地同名文件夹。
zip -r "${OUT}" "${PROJECT_DIR_NAME}" \
  -x "${PROJECT_DIR_NAME}/.git/*" \
  -x "${PROJECT_DIR_NAME}/.DS_Store" \
  -x "${PROJECT_DIR_NAME}/**/.DS_Store" \
  -x "${PROJECT_DIR_NAME}/**/node_modules/*" \
  -x "${PROJECT_DIR_NAME}/**/.dart_tool/*" \
  -x "${PROJECT_DIR_NAME}/**/build/*" \
  -x "${PROJECT_DIR_NAME}/**/.pytest_cache/*" \
  -x "${PROJECT_DIR_NAME}/**/__pycache__/*" \
  -x "${PROJECT_DIR_NAME}/**/.venv/*" \
  -x "${PROJECT_DIR_NAME}/**/dist/*" \
  -x "${PROJECT_DIR_NAME}/**/.next/*"

echo "[package] done"
