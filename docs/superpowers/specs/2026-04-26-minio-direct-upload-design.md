# MinIO 直传音频（/v1/audio/upload-url）设计稿 v0.1

日期：2026-04-26  
状态：已确认（用户“确认做 MinIO 直传”）  
范围：把当前 **api-direct**（PUT 到 API）升级为 **minio-presign**（客户端 PUT 直传 MinIO），并增加端到端系统测试。

---

## 1. 背景

当前实现（`services/api/internal/http/handlers/audio.go`）：

- `POST /v1/audio/upload-url` 返回一个 `upload_url`，实际是 `PUT /v1/audio/upload/{audio_id}`（上传到 API）
- `GET /v1/audio/{audio_id}` 从本机临时目录读取并下载

问题：

- 生产形态应为对象存储直传，API 不应承载音频二进制流
- 需要系统测试保证“签名可用 + MinIO 可写可读”

---

## 2. 目标（DoD）

1) `POST /v1/audio/upload-url` 生成 **MinIO presign PUT**（upload_url）与 **presign GET**（audio_url）  
2) 保持返回字段兼容（`audio_id/upload_url/headers/expires_in/audio_url/storage`）  
3) 支持开关回退：`MIAODONG_AUDIO_STORAGE=api-direct|minio-presign`  
4) CI `e2e-db` 增加端到端验证：调用 upload-url → PUT 上传几个 bytes → GET 下载校验一致  

---

## 3. 接口契约（保持兼容）

### 3.1 `POST /v1/audio/upload-url`

Request（保持 v0.1 简单，可暂不强校验）：

```json
{ "content_type": "audio/mp4", "duration_ms": 6000 }
```

Response（字段兼容 + 新增 storage= minio-presign）：

```json
{
  "audio_id": "a_xxx",
  "upload_url": "https://...presigned_put...",
  "method": "PUT",
  "headers": { "Content-Type": "application/octet-stream" },
  "expires_in": 600,
  "audio_url": "https://...presigned_get...",
  "storage": "minio-presign",
  "created_at": 1710000000
}
```

说明：

- `headers.Content-Type`：MVP 可先固定 `application/octet-stream`（与现有一致）；后续可透传 request 的 content_type  
- `expires_in`：默认 10 分钟
- `audio_url`：给推理服务/调试下载使用；后续可替换为“稳定公开 URL + 授权下载”策略

---

## 4. 配置与回退策略（可灰度）

### 4.1 开关

- `MIAODONG_AUDIO_STORAGE`：
  - `minio-presign`：优先使用 MinIO
  - `api-direct`：回退旧实现（用于无 MinIO 配置的本地联调/紧急兜底）

建议默认：

- 若 MinIO 配置齐全 → 自动使用 `minio-presign`
- 否则 → 自动回退 `api-direct`

### 4.2 MinIO 配置（环境变量）

建议使用（与 docker-compose 保持一致）：

- `MIAODONG_MINIO_ENDPOINT`：默认 `localhost:9000`
- `MIAODONG_MINIO_ACCESS_KEY`：默认 `minio`
- `MIAODONG_MINIO_SECRET_KEY`：默认 `minio123456`
- `MIAODONG_MINIO_BUCKET`：默认 `miaodong-audio`
- `MIAODONG_MINIO_USE_SSL`：默认 `false`

---

## 5. 解耦与代码结构（可维护）

新增一个最小 storage 层，让 handler 不关心 MinIO 细节：

- `services/api/internal/storage/minio.go`
  - `type MinIO struct { ... }`
  - `func NewMinIOFromEnv() (*MinIO, error)`
  - `func (m *MinIO) EnsureBucket(ctx) error`
  - `func (m *MinIO) PresignPut(ctx, objectKey string, expires time.Duration) (url string, headers map[string]string, err error)`
  - `func (m *MinIO) PresignGet(ctx, objectKey string, expires time.Duration) (url string, err error)`

Handler 逻辑：

1) 生成 `audio_id`
2) 计算 objectKey（例如 `audio/<audio_id>.bin`）
3) `EnsureBucket`
4) 生成 presign put/get
5) 返回 JSON（storage=minio-presign）

---

## 6. 系统测试（关键里程碑：科学、系统）

在 `.github/workflows/ci.yml` 的 `e2e-db` job 中新增 step：`E2E: audio minio presign`

步骤：

1) 启动 API（后台）并等待 `/v1/health`
2) 调用 `POST /v1/audio/upload-url` 得到 `upload_url/audio_url`
3) `curl -X PUT "$upload_url" --data-binary @/tmp/sample.bin`
4) `curl "$audio_url" > /tmp/out.bin`
5) `sha256sum` 对比一致

说明：

- MinIO 容器已在 docker compose 中启动（端口 9000）
- bucket 创建应由 API 自动完成（`EnsureBucket`），避免测试脚本依赖 MinIO 管理命令

---

## 7. 风险与后续

- presign URL 需要客户端可直连对象存储（生产环境要注意网络与 CORS）
- 后续可演进为：
  - `audio_url` 变为“稳定对象存储 URL”
  - 推理服务从对象存储读取时使用服务端凭据（不依赖短期 presign）

