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

---

## 分享能力本地验证（4.5）

结果页新增：

- 复制分享文案
- 系统分享

本地验证建议：

```bash
cd apps/mobile
flutter pub get
flutter run
```

验证步骤：

1. 完成一次录音上传并进入结果页
2. 点击“复制分享文案”，确认出现 Snackbar，且剪贴板内容包含结果文案与 `#喵懂 #喵测`
3. 若带 `problemId` 进入结果页，确认客户端会优先请求 `GET /v1/templates/result?problem_id=...`
4. 点击“系统分享”，确认能调起系统分享面板；若失败，会显示错误 Snackbar

---

## 复测对比与成就本地验证（4.6）

结果页新增：

- 保存为基线
- 复测对比卡（上次/本次 label、confidence、time 与变化提示）
- 提交复测记录
- 首次提交复测成功后解锁“初次复测”成就

本地验证建议：

```bash
cd apps/mobile
flutter pub get
flutter run
```

验证步骤：

1. 从同一个 `problemId` 进入结果页，完成第一次分析
2. 点击“保存为基线”，确认出现 Snackbar：`已保存为该问题的基线结果`
3. 再次针对同一问题录音并进入结果页，确认出现“复测对比”卡片，展示上次/本次 label、confidence、time 与变化提示
4. 点击“提交复测记录”，确认接口成功后出现成功提示；如果是第一次成功提交，还会弹出“成就解锁：初次复测”
5. 点击“保存为新的基线”，再次进入同一问题时应以上一次最新保存结果作为新的 baseline

---

## 录音与上传（4.2）

录音页会执行：

1) 录音（最长 10 秒）
2) `POST /v1/audio/upload-url`
3) `PUT upload_url` 上传音频文件

本地联调建议：

```bash
# 1) 起后端（含 MinIO / Postgres）
./scripts/dev-up.sh

# 2) 起 Flutter
cd apps/mobile
flutter pub get
flutter run
```

> Android 模拟器访问宿主机 API：默认使用 `10.0.2.2:8080`（已在 app.dart 内处理）。
