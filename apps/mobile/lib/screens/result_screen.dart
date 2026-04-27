import 'dart:convert';

import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../inference/inference_client.dart';
import 'problem_detail_screen.dart';

enum ResultPageState { loading, success, degraded, error }

class ResultScreen extends StatefulWidget {
  const ResultScreen({
    super.key,
    required this.api,
    required this.audioUrl,
    this.audioId,
    this.problemId,
  });

  final ApiClient api;
  final String audioUrl;
  final String? audioId;
  final String? problemId;

  @override
  State<ResultScreen> createState() => _ResultScreenState();
}

class _ResultScreenState extends State<ResultScreen> {
  late final InferenceClient _inference = InferenceClient(api: widget.api);

  ResultPageState _state = ResultPageState.loading;
  Map<String, dynamic>? _resp;
  String? _error;
  bool _sendingFeedback = false;

  @override
  void initState() {
    super.initState();
    _runInference();
  }

  void _snack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  String _timeOfDay() {
    final h = DateTime.now().hour;
    return (h >= 22 || h < 6) ? 'night' : 'day';
  }

  Future<void> _runInference() async {
    setState(() {
      _state = ResultPageState.loading;
      _error = null;
      _resp = null;
    });

    try {
      final ctx = <String, dynamic>{'time_of_day': _timeOfDay()};
      final res = await _inference.infer(audioUrl: widget.audioUrl, context: ctx);
      final degraded = (res['degraded'] == true) || (res['degraded']?.toString() == 'true');
      setState(() {
        _resp = res;
        _state = degraded ? ResultPageState.degraded : ResultPageState.success;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _state = ResultPageState.error;
      });
    }
  }

  String? _requestId() => _resp?['request_id']?.toString();

  Future<void> _feedback(bool helpful) async {
    final rid = _requestId();
    if (rid == null || rid.isEmpty) {
      _snack('没有 request_id，暂时无法反馈');
      return;
    }
    if (_sendingFeedback) return;

    setState(() => _sendingFeedback = true);
    try {
      await _inference.sendFeedback(requestId: rid, helpful: helpful);
      _snack('已反馈，感谢～');
    } catch (e) {
      _snack('反馈失败：$e');
    } finally {
      if (mounted) setState(() => _sendingFeedback = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final resp = _resp;

    Widget body;
    switch (_state) {
      case ResultPageState.loading:
        body = const Center(
          child: Padding(
            padding: EdgeInsets.all(16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircularProgressIndicator(),
                SizedBox(height: 12),
                Text('正在分析…'),
              ],
            ),
          ),
        );
        break;
      case ResultPageState.error:
        body = Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '分析失败',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 8),
              Text(_error ?? '未知错误', style: const TextStyle(color: Colors.red)),
              const SizedBox(height: 12),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  FilledButton.icon(
                    onPressed: _runInference,
                    icon: const Icon(Icons.refresh_rounded),
                    label: const Text('重试'),
                  ),
                  if (widget.problemId != null)
                    OutlinedButton(
                      onPressed: () {
                        Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => ProblemDetailScreen(
                              api: widget.api,
                              problemId: widget.problemId!,
                            ),
                          ),
                        );
                      },
                      child: const Text('查看问题详情'),
                    ),
                ],
              ),
            ],
          ),
        );
        break;
      case ResultPageState.degraded:
        final message = (resp?['message'] ?? '本次分析已降级').toString();
        final reason = (resp?['degraded_reason'] ?? resp?['reason'] ?? '-').toString();
        body = Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '本次结果不可用（降级）',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 10),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(message),
                      const SizedBox(height: 8),
                      Text('degraded_reason：$reason', style: Theme.of(context).textTheme.bodySmall),
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
                    onPressed: _runInference,
                    icon: const Icon(Icons.refresh_rounded),
                    label: const Text('重试'),
                  ),
                  if (widget.problemId != null)
                    OutlinedButton(
                      onPressed: () {
                        Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => ProblemDetailScreen(
                              api: widget.api,
                              problemId: widget.problemId!,
                            ),
                          ),
                        );
                      },
                      child: const Text('查看问题详情'),
                    ),
                ],
              ),
              const SizedBox(height: 14),
              _DebugSection(resp: resp),
            ],
          ),
        );
        break;
      case ResultPageState.success:
        final primary = resp?['primary_intent'];
        final label = (primary is Map ? (primary['label'] ?? primary['name']) : primary)?.toString() ?? '-';
        final confidenceRaw = (primary is Map ? primary['confidence'] : null);
        final confidence = double.tryParse((confidenceRaw ?? '').toString());

        final explanationsRaw = resp?['explanations'];
        final explanations = (explanationsRaw is List) ? explanationsRaw : const [];

        body = ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              '分析结果',
              style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 10),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('primary_intent：$label', style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 6),
                    Text(
                      'confidence：${confidence == null ? '-' : '${(confidence * 100).toStringAsFixed(0)}%'}',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            Text('解释', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 6),
            if (explanations.isEmpty)
              const Text('暂无解释（explanations 为空）')
            else
              ...explanations.map((e) {
                if (e is Map) {
                  final factor = (e['factor'] ?? e['title'] ?? '').toString();
                  final text = (e['text'] ?? e['explanation'] ?? e['reason'] ?? '').toString();
                  final title = factor.isNotEmpty ? factor : '解释';
                  return ListTile(
                    dense: true,
                    title: Text(title),
                    subtitle: text.isEmpty ? null : Text(text),
                  );
                }
                return ListTile(dense: true, title: Text(e.toString()));
              }),
            const SizedBox(height: 10),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                FilledButton(
                  onPressed: _sendingFeedback ? null : () => _feedback(true),
                  child: const Text('有用'),
                ),
                OutlinedButton(
                  onPressed: _sendingFeedback ? null : () => _feedback(false),
                  child: const Text('没用'),
                ),
                if (widget.problemId != null)
                  OutlinedButton(
                    onPressed: () {
                      Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => ProblemDetailScreen(
                            api: widget.api,
                            problemId: widget.problemId!,
                          ),
                        ),
                      );
                    },
                    child: const Text('查看问题详情'),
                  ),
                OutlinedButton.icon(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.replay_rounded),
                  label: const Text('再测一次'),
                ),
              ],
            ),
            const SizedBox(height: 14),
            _DebugSection(resp: resp),
          ],
        );
        break;
    }

    return Scaffold(
      appBar: AppBar(title: const Text('结果')),
      body: SafeArea(child: body),
    );
  }
}

class _DebugSection extends StatelessWidget {
  const _DebugSection({required this.resp});

  final Map<String, dynamic>? resp;

  @override
  Widget build(BuildContext context) {
    final r = resp ?? const {};
    final encoder = const JsonEncoder.withIndent('  ');
    final pretty = encoder.convert(r);

    String v(String k) => (r[k] ?? '-').toString();

    return ExpansionTile(
      title: const Text('调试信息'),
      childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      children: [
        _kv('request_id', v('request_id')),
        _kv('content_version', v('content_version')),
        _kv('inference_latency_ms', v('inference_latency_ms')),
        _kv('degraded_reason', v('degraded_reason')),
        const SizedBox(height: 8),
        SelectableText(pretty, style: Theme.of(context).textTheme.bodySmall),
      ],
    );
  }

  Widget _kv(String k, String val) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 140, child: Text('$k：', style: const TextStyle(fontWeight: FontWeight.w600))),
          Expanded(child: SelectableText(val)),
        ],
      ),
    );
  }
}
