# 喵懂 H5 验证端

对应 WBS：4A.1（骨架）与 4A.2（录音 + 上传）。
目标：不注册公司、不依赖应用商店，先用浏览器验证“愿不愿意录音、上传是否顺畅”。

## 本地运行

1) 启动 API（开发期建议走 API 直传，避免对象存储 CORS）：

```powershell
cd services/api
$env:MIAODONG_CORS_ORIGINS = "http://127.0.0.1:5174,http://localhost:5174"
$env:MIAODONG_AUDIO_STORAGE = "api-direct"
go run ./cmd/api
```

2) 启动 H5：

```bash
cd apps/web
npm install
npm run dev
```

打开 `http://127.0.0.1:5174`。

- 麦克风只在 `localhost` 或 HTTPS 下可用。
- Vite 已把 `/v1` 代理到 `http://127.0.0.1:8080`。
- 上传 URL 是绝对地址，本地依赖 API 的 CORS 白名单（见 `MIAODONG_CORS_ORIGINS`）。

## 环境变量

| 变量 | 作用 |
|---|---|
| `VITE_API_BASE` | 生产 API 地址；空值时使用 Vite 代理 |
| `MIAODONG_CORS_ORIGINS` | 后端允许的 H5 源，逗号分隔 |
| `MIAODONG_AUDIO_STORAGE` | `api-direct` 强制走 API 上传；不设则尝试 S3 预签名 |

## 当前状态

- 4A.1 已实现：页面骨架、匿名登录、问题库读取
- 4A.2 已实现：MediaRecorder 录音、10 秒上限、预览、上传
- 4A.3 下一步：结果页、追问/建议/风险、复测
