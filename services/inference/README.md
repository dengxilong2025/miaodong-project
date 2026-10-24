# Python 推理服务

职责：
- 音频标准化：统一转码到 16kHz/mono/PCM WAV（`app/audio.py`）
- 特征提取与模型推理：输出意图标签 + 置信度 + 解释因子
- 风险徽标：应激/发情/不舒服/疼痛（仅提示，不诊断；分享卡不展示）

运行依赖：
- `ffmpeg` 必须在 PATH 中（本地 Windows 可用 `winget install ffmpeg`；CI 已安装）
- 可选 `MIAODONG_AUDIO_ALLOWED_HOSTS` 限制可下载的音频域名

接口输出必须版本化（model_version / schema_version），避免线上升级互相踩踏。

