# MinIO Direct Upload (Presign) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `POST /v1/audio/upload-url` 从 api-direct 升级为 MinIO presign 直传：返回 presigned PUT（upload_url）与 presigned GET（audio_url），并通过开关 `MIAODONG_AUDIO_STORAGE` 支持回退；同时在 CI `e2e-db` 中增加端到端验证（PUT 上传 bytes → GET 下载一致）。

**Architecture:** 引入最小 storage 层 `internal/storage` 封装 MinIO 初始化、bucket 确保与 presign 生成；HTTP handler 只做参数校验与响应拼装。e2e-db 用真实 MinIO 容器跑 E2E。

**Tech Stack:** Go + MinIO (S3 compatible) + docker compose + GitHub Actions e2e-db。

---

## 0. File Map

**Create:**
- `services/api/internal/storage/minio.go`（MinIO client + EnsureBucket + PresignPut/Get）

**Modify:**
- `services/api/internal/http/handlers/audio.go`（upload-url 切换为 minio-presign + 兼容回退）
- `services/api/internal/http/handlers/audio_test.go`（补充断言 storage 字段与 headers）
- `.github/workflows/ci.yml`（e2e-db 增加 “E2E: audio minio presign” step）

---

## Task 1: 引入 MinIO storage 层（可测试、可维护）

**Files:**
- Create: `services/api/internal/storage/minio.go`

- [ ] **Step 1: 新增 MinIOFromEnv()**

`services/api/internal/storage/minio.go`

```go
package storage

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type MinIO struct {
	Client *minio.Client
	Bucket string
}

func NewMinIOFromEnv() (*MinIO, error) {
	endpoint := os.Getenv("MIAODONG_MINIO_ENDPOINT")
	if endpoint == "" {
		endpoint = "localhost:9000"
	}
	access := os.Getenv("MIAODONG_MINIO_ACCESS_KEY")
	if access == "" {
		access = "minio"
	}
	secret := os.Getenv("MIAODONG_MINIO_SECRET_KEY")
	if secret == "" {
		secret = "minio123456"
	}
	bucket := os.Getenv("MIAODONG_MINIO_BUCKET")
	if bucket == "" {
		bucket = "miaodong-audio"
	}
	useSSL := false
	if v := os.Getenv("MIAODONG_MINIO_USE_SSL"); v != "" {
		b, err := strconv.ParseBool(v)
		if err != nil {
			return nil, fmt.Errorf("invalid MIAODONG_MINIO_USE_SSL: %w", err)
		}
		useSSL = b
	}

	c, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(access, secret, ""),
		Secure: useSSL,
	})
	if err != nil {
		return nil, err
	}
	return &MinIO{Client: c, Bucket: bucket}, nil
}

func (m *MinIO) EnsureBucket(ctx context.Context) error {
	ok, err := m.Client.BucketExists(ctx, m.Bucket)
	if err != nil {
		return err
	}
	if ok {
		return nil
	}
	return m.Client.MakeBucket(ctx, m.Bucket, minio.MakeBucketOptions{})
}

func (m *MinIO) PresignPut(ctx context.Context, objectKey string, expires time.Duration, contentType string) (string, map[string]string, error) {
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	u, err := m.Client.PresignedPutObject(ctx, m.Bucket, objectKey, expires)
	if err != nil {
		return "", nil, err
	}
	return u.String(), map[string]string{"Content-Type": contentType}, nil
}

func (m *MinIO) PresignGet(ctx context.Context, objectKey string, expires time.Duration) (string, error) {
	u, err := m.Client.PresignedGetObject(ctx, m.Bucket, objectKey, expires, nil)
	if err != nil {
		return "", err
	}
	return u.String(), nil
}
```

- [ ] **Step 2: go test**

Run:
```bash
cd services/api
go test ./...
```
Expected: PASS（仅新增文件，不影响现有逻辑；依赖会自动写入 go.mod/go.sum）

- [ ] **Step 3: Commit**

```bash
git add services/api/internal/storage/minio.go services/api/go.mod services/api/go.sum
git commit -m "feat(storage): add minio client and presign helpers"
```

---

## Task 2: 改造 /v1/audio/upload-url（minio-presign + 回退）

**Files:**
- Modify: `services/api/internal/http/handlers/audio.go`
- Modify: `services/api/internal/http/handlers/audio_test.go`

- [ ] **Step 1: 在 AudioUploadURL 中选择存储模式**

规则：
- 若 `MIAODONG_AUDIO_STORAGE=api-direct` → 走旧逻辑
- 否则尝试 MinIO：
  - `NewMinIOFromEnv()` 成功 + `EnsureBucket` 成功 → 走 minio-presign
  - 任一失败 → 回退 api-direct（并返回 `storage=api-direct`）

- [ ] **Step 2: minio-presign 分支返回 presigned PUT/GET**

对象 key：
- `audio/<audio_id>.bin`

expires：
- `10 * time.Minute`

返回字段：
- `audio_id`
- `upload_url`（presigned put）
- `audio_url`（presigned get）
- `headers`（Content-Type）
- `method=PUT`
- `expires_in=600`
- `storage=minio-presign`

- [ ] **Step 3: 更新单测**

`services/api/internal/http/handlers/audio_test.go` 追加断言：
- `out["storage"]` 必须存在
- `out["headers"]` 必须存在（且为 object）

（单测无需真正连接 MinIO；这里只验证契约字段稳定）

- [ ] **Step 4: go test**

Run:
```bash
cd services/api
go test ./...
```

- [ ] **Step 5: Commit**

```bash
git add services/api/internal/http/handlers/audio.go services/api/internal/http/handlers/audio_test.go
git commit -m "feat(audio): presign minio upload-url with fallback"
```

---

## Task 3: e2e-db 增加端到端系统测试（MinIO presign PUT/GET）

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: 在 e2e-db job 中新增 step：E2E: audio minio presign**

要点：
- 使用 `MIAODONG_AUDIO_STORAGE=minio-presign`
- 设置 MinIO env（endpoint/keys/bucket/use_ssl）
- 启动 API（后台）等待 `/v1/health`
- 调用 `/v1/audio/upload-url` 获取 presign
- 使用 `curl -X PUT` 上传 `/tmp/sample.bin`
- 使用 `curl` 下载 `audio_url` 并对比 sha256

脚本（示例，落地时写进 YAML）：

```bash
set -euo pipefail
API_URL="http://127.0.0.1:8080"

cd services/api
export MIAODONG_AUDIO_STORAGE="minio-presign"
export MIAODONG_MINIO_ENDPOINT="localhost:9000"
export MIAODONG_MINIO_ACCESS_KEY="minio"
export MIAODONG_MINIO_SECRET_KEY="minio123456"
export MIAODONG_MINIO_BUCKET="miaodong-audio"
export MIAODONG_MINIO_USE_SSL="false"

go run ./cmd/api > /tmp/miaodong-api.log 2>&1 &
API_PID=$!
trap 'kill "$API_PID" >/dev/null 2>&1 || true' EXIT

for i in {1..60}; do
  if curl -fsS "${API_URL}/v1/health" >/dev/null; then
    echo "api healthy"
    break
  fi
  sleep 1
done

RESP="$(curl -fsS -X POST "${API_URL}/v1/audio/upload-url" -H "Content-Type: application/json" -d '{}' )"
python3 - <<'PY'
import json,sys
data=json.loads(sys.stdin.read())
assert data.get("upload_url"), "missing upload_url"
assert data.get("audio_url"), "missing audio_url"
print(data["upload_url"])
print(data["audio_url"])
PY <<<"$RESP" > /tmp/urls.txt

UPLOAD_URL="$(sed -n '1p' /tmp/urls.txt)"
AUDIO_URL="$(sed -n '2p' /tmp/urls.txt)"

printf "meow-audio-test-%s" "$(date +%s)" > /tmp/sample.bin
sha256sum /tmp/sample.bin | awk '{print $1}' > /tmp/sample.sha

curl -fsS -X PUT "${UPLOAD_URL}" --data-binary "@/tmp/sample.bin" -H "Content-Type: application/octet-stream" >/dev/null
curl -fsS "${AUDIO_URL}" -o /tmp/out.bin
sha256sum /tmp/out.bin | awk '{print $1}' > /tmp/out.sha

diff -u /tmp/sample.sha /tmp/out.sha
echo "E2E audio minio presign: OK"
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "test(ci): add e2e minio presign upload"
```

---

## Task 4: 全量验证 + nightly

- [ ] Run: `python3 scripts/ci/validate_repo.py`
- [ ] Run: `cd services/api && go test ./...`
- [ ] 观察 GitHub Actions：validate/go-api/python-inference/e2e-db 全绿
- [ ] nightly：`./scripts/package.sh /workspace/miaodong-nightly.zip`

