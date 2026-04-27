import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../recording/recorder.dart';
import 'result_screen.dart';
import '../upload/uploader.dart';

enum RecordPageState { idle, recording, recorded, uploading, uploaded }

class RecordScreen extends StatefulWidget {
  const RecordScreen({super.key, required this.api, this.problemId});

  final ApiClient api;
  final String? problemId;

  @override
  State<RecordScreen> createState() => _RecordScreenState();
}

class _RecordScreenState extends State<RecordScreen> {
  final Recorder _recorder = Recorder();
  late final Uploader _uploader = Uploader(api: widget.api);

  RecordPageState _state = RecordPageState.idle;
  String? _filePath;
  String? _audioId;
  String? _audioUrl;
  String? _lastError;

  int _secondsLeft = 10;
  Timer? _tick;

  @override
  void dispose() {
    _tick?.cancel();
    _recorder.dispose();
    super.dispose();
  }

  void _snack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  void _setError(Object e) {
    setState(() => _lastError = e.toString());
    _snack('出错了：$e');
  }

  void _startTick() {
    _tick?.cancel();
    _secondsLeft = 10;
    _tick = Timer.periodic(const Duration(seconds: 1), (t) async {
      if (!mounted) return;
      setState(() => _secondsLeft = (_secondsLeft - 1).clamp(0, 10));
      if (_secondsLeft <= 0) {
        t.cancel();
        // 兜底：超时自动 stop（Recorder 内部也有 Timer 兜底）
        await _stopRecording();
      }
    });
  }

  Future<void> _startRecording() async {
    setState(() {
      _lastError = null;
      _audioId = null;
      _audioUrl = null;
      _filePath = null;
      _state = RecordPageState.recording;
    });
    try {
      final p = await _recorder.start(maxDuration: const Duration(seconds: 10));
      _startTick();
      setState(() => _filePath = p);
    } catch (e) {
      _tick?.cancel();
      setState(() => _state = RecordPageState.idle);
      _setError(e);
    }
  }

  Future<void> _stopRecording() async {
    try {
      await _recorder.stop();
      _tick?.cancel();
      setState(() => _state = RecordPageState.recorded);
    } catch (e) {
      _setError(e);
    }
  }

  Future<void> _reRecord() async {
    _tick?.cancel();
    await _recorder.stop();
    setState(() {
      _filePath = null;
      _audioId = null;
      _audioUrl = null;
      _lastError = null;
      _state = RecordPageState.idle;
      _secondsLeft = 10;
    });
  }

  Future<void> _upload() async {
    final path = _filePath;
    if (path == null || path.isEmpty) {
      _snack('还没有录音文件喵～先录一段再上传');
      return;
    }

    setState(() {
      _lastError = null;
      _state = RecordPageState.uploading;
    });

    try {
      // v0.1-alpha：upload-url 请求体可为空；这里带 duration_ms 以便后续演进
      final ins = await _uploader.getUploadUrl(durationMs: (10 - _secondsLeft) * 1000);
      await _uploader.uploadFile(ins, File(path));
      setState(() {
        _audioId = ins.audioId;
        _audioUrl = ins.audioUrl;
        _state = RecordPageState.uploaded;
      });
      _snack('上传成功：${ins.audioId}');
    } catch (e) {
      setState(() => _state = RecordPageState.recorded);
      _setError(e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isRecording = _state == RecordPageState.recording;
    final canUpload = _state == RecordPageState.recorded || _state == RecordPageState.uploaded;
    final uploading = _state == RecordPageState.uploading;
    final canAnalyze = _state == RecordPageState.uploaded && (_audioUrl?.isNotEmpty ?? false);

    return Scaffold(
      appBar: AppBar(title: const Text('录音')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '录一段猫叫声（最长 10 秒）',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
              ),
              const SizedBox(height: 8),
              Text(
                isRecording ? '录音中…剩余 ${_secondsLeft}s' : '点击开始录音，点击停止结束。',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
              const SizedBox(height: 14),

              if (isRecording) ...[
                LinearProgressIndicator(value: (10 - _secondsLeft) / 10.0),
                const SizedBox(height: 12),
              ],

              Card(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('状态：$_state'),
                      const SizedBox(height: 6),
                      Text('filePath：${_filePath ?? "-"}'),
                      const SizedBox(height: 6),
                      Text('problem_id：${widget.problemId ?? "-"}'),
                      const SizedBox(height: 6),
                      Text('audio_id：${_audioId ?? "-"}'),
                      const SizedBox(height: 6),
                      Text('audio_url：${_audioUrl ?? "-"}'),
                      if (_lastError != null) ...[
                        const SizedBox(height: 10),
                        Text(
                          _lastError!,
                          style: const TextStyle(color: Colors.red),
                        ),
                      ],
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 12),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  FilledButton.icon(
                    onPressed: uploading
                        ? null
                        : (isRecording ? _stopRecording : _startRecording),
                    icon: Icon(isRecording ? Icons.stop_rounded : Icons.mic_rounded),
                    label: Text(isRecording ? '停止' : '开始录音'),
                  ),
                  OutlinedButton.icon(
                    onPressed: uploading ? null : _reRecord,
                    icon: const Icon(Icons.replay_rounded),
                    label: const Text('重录'),
                  ),
                  FilledButton.icon(
                    onPressed: uploading ? null : (canUpload ? _upload : null),
                    icon: uploading
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.cloud_upload_rounded),
                    label: Text(uploading ? '上传中…' : '上传'),
                  ),
                  FilledButton.icon(
                    onPressed: canAnalyze
                        ? () {
                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => ResultScreen(
                                  api: widget.api,
                                  audioUrl: _audioUrl!,
                                  audioId: _audioId,
                                  problemId: widget.problemId,
                                ),
                              ),
                            );
                          }
                        : null,
                    icon: const Icon(Icons.analytics_rounded),
                    label: const Text('开始分析'),
                  ),
                ],
              ),

              const SizedBox(height: 18),
              const Text('上传成功后，点击「开始分析」生成结果页。'),
            ],
          ),
        ),
      ),
    );
  }
}
