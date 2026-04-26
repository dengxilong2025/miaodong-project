# Flutter 客户端（v0.1-alpha）

这里是喵懂 Flutter 工程（iOS/Android 同构）的工作目录。

建议模块划分（示意）：
- recording：录音/权限/格式
- upload：直传对象存储/重试/弱网队列
- result：结果页渲染（意图/解释/追问/建议/风险/工具区/分享）
- knowledge：问题库浏览
- telemetry：埋点/配置/灰度分组

---

## 开发运行

前置：
- 本机已安装 Flutter SDK（建议 stable）
- 本机启动后端 API：默认 `http://127.0.0.1:8080`（iOS 模拟器）
  - Android 模拟器会自动使用 `http://10.0.2.2:8080`

在本目录下执行：

```bash
flutter pub get
flutter run
```

启动后会自动调用 `POST /v1/auth/anonymous` 获取匿名 `user_id/token` 并缓存（shared_preferences）。

> 注意：当前仓库环境不包含 Flutter SDK，因此 CI 不会运行 flutter build/analyze。以本机为准。
