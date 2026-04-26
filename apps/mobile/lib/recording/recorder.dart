import 'dart:async';

import 'package:path_provider/path_provider.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:record/record.dart';

/// 录音状态（v0.1-alpha：只区分是否在录音）
enum RecorderState { idle, recording }

/// 录音封装：
/// - 负责麦克风权限请求
/// - 负责开始/停止
/// - 负责 10 秒上限（Timer 兜底）
class Recorder {
  final AudioRecorder _recorder = AudioRecorder();

  RecorderState _state = RecorderState.idle;
  Timer? _limitTimer;

  RecorderState get state => _state;

  /// 确保已获得麦克风权限；拒绝时抛异常并给出可读信息。
  Future<void> ensurePermission() async {
    final status = await Permission.microphone.request();
    if (!status.isGranted) {
      throw Exception('麦克风权限被拒绝，请在系统设置中开启');
    }
  }

  /// 开始录音，返回将要写入的文件路径。
  ///
  /// 注意：不同平台/编码器最终输出格式可能不同，但 v0.1-alpha 目标是
  /// “可录可传”闭环，因此只要生成文件即可。
  Future<String> start({required Duration maxDuration}) async {
    if (_state == RecorderState.recording) {
      throw Exception('已在录音中');
    }

    await ensurePermission();

    final tmp = await getTemporaryDirectory();
    final ts = DateTime.now().millisecondsSinceEpoch;
    final path = '${tmp.path}/miaodong_$ts.m4a';

    // 尽量用 AAC-LC（m4a）。若平台不支持，会由插件降级。
    const config = RecordConfig(
      encoder: AudioEncoder.aacLc,
      bitRate: 128000,
      sampleRate: 44100,
    );

    await _recorder.start(config, path: path);
    _state = RecorderState.recording;

    // 10 秒兜底：确保 maxDuration 在所有平台都生效。
    _limitTimer?.cancel();
    _limitTimer = Timer(maxDuration, () async {
      try {
        await stop();
      } catch (_) {
        // ignore
      }
    });

    return path;
  }

  /// 停止录音（若未录音则 no-op）。
  Future<void> stop() async {
    _limitTimer?.cancel();
    _limitTimer = null;

    if (_state != RecorderState.recording) {
      return;
    }

    await _recorder.stop();
    _state = RecorderState.idle;
  }

  Future<void> dispose() async {
    _limitTimer?.cancel();
    _limitTimer = null;
    await _recorder.dispose();
    _state = RecorderState.idle;
  }
}

