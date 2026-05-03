import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:share_plus/share_plus.dart';

import '../api/api_client.dart';
import '../inference/inference_client.dart';
import '../retest/retest_store.dart';
import 'problem_detail_screen.dart';

enum ResultPageState { loading, success, degraded, error }

const String defaultShareTemplate = '我家猫这次更像：{label}（{confidence}%）。来喵懂试试 #喵懂 #喵测';

int? formatConfidencePercent(Object? confidenceRaw) {
  if (confidenceRaw == null) return null;
  final confidence = switch (confidenceRaw) {
    num value => value.toDouble(),
    _ => double.tryParse(confidenceRaw.toString()),
  };
  if (confidence == null) return null;
  if (confidence >= 0 && confidence <= 1) {
    return (confidence * 100).round();
  }
  return confidence.round();
}

String buildShareTextFromTemplate({
  required String template,
  required String? label,
  required int? confidencePercent,
}) {
  final resolvedLabel = (label == null || label.trim().isEmpty) ? '未知' : label.trim();
  final resolvedConfidence = confidencePercent?.toString() ?? '-';

  var text = template
      .replaceAll('{label}', resolvedLabel)
      .replaceAll('{confidence}', resolvedConfidence)
      .trim();

  final hasMiaodongTag = text.contains('#喵懂');
  final hasMiaoceTag = text.contains('#喵测');
  if (!hasMiaodongTag || !hasMiaoceTag) {
    final missingTags = <String>[
      if (!hasMiaodongTag) '#喵懂',
      if (!hasMiaoceTag) '#喵测',
    ];
    text = '${text.trimRight()} ${missingTags.join(' ')}'.trim();
  }

  return text;
}

double? parseConfidenceValue(Object? confidenceRaw) {
  if (confidenceRaw == null) return null;
  return switch (confidenceRaw) {
    num value => value.toDouble(),
    _ => double.tryParse(confidenceRaw.toString()),
  };
}

String formatIsoTime(String? iso) {
  if (iso == null || iso.trim().isEmpty) return '-';
  final parsed = DateTime.tryParse(iso);
  if (parsed == null) return iso;
  final local = parsed.toLocal();
  final month = local.month.toString().padLeft(2, '0');
  final day = local.day.toString().padLeft(2, '0');
  final hour = local.hour.toString().padLeft(2, '0');
  final minute = local.minute.toString().padLeft(2, '0');
  return '${local.year}-$month-$day $hour:$minute';
}

String formatConfidenceDelta(int currentConfidence, int baselineConfidence) {
  final diff = currentConfidence - baselineConfidence;
  if (diff == 0) return '0%';
  final prefix = diff > 0 ? '+' : '';
  return '$prefix$diff%';
}

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
  late final RetestStore _retestStore = RetestStore(store: widget.api.store);

  ResultPageState _state = ResultPageState.loading;
  Map<String, dynamic>? _resp;
  String? _error;
  bool _sendingFeedback = false;
  RetestBaseline? _baseline;
  bool _loadingBaseline = true;
  bool _savingBaseline = false;
  bool _submittingRetest = false;
  String? _currentResultAtIso;

  @override
  void initState() {
    super.initState();
    _loadBaseline();
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

  Future<void> _loadBaseline() async {
    final problemId = widget.problemId;
    if (problemId == null || problemId.isEmpty) {
      if (mounted) {
        setState(() => _loadingBaseline = false);
      } else {
        _loadingBaseline = false;
      }
      return;
    }

    try {
      final baseline = await _retestStore.getBaseline(problemId);
      if (!mounted) return;
      setState(() {
        _baseline = baseline;
        _loadingBaseline = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loadingBaseline = false);
    }
  }

  Future<void> _runInference() async {
    setState(() {
      _state = ResultPageState.loading;
      _error = null;
      _resp = null;
      _currentResultAtIso = null;
    });

    try {
      final ctx = <String, dynamic>{'time_of_day': _timeOfDay()};
      final res = await _inference.infer(audioUrl: widget.audioUrl, context: ctx);
      final degraded = (res['degraded'] == true) || (res['degraded']?.toString() == 'true');
      final currentAt =
          res['created_at']?.toString().trim().isNotEmpty == true
              ? res['created_at'].toString()
              : DateTime.now().toUtc().toIso8601String();
      setState(() {
        _resp = res;
        _state = degraded ? ResultPageState.degraded : ResultPageState.success;
        _currentResultAtIso = currentAt;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _state = ResultPageState.error;
      });
    }
  }

  String? _requestId() => _resp?['request_id']?.toString();

  Map<String, dynamic>? _primaryIntent() {
    final primary = _resp?['primary_intent'];
    if (primary is Map<String, dynamic>) return primary;
    if (primary is Map) return primary.cast<String, dynamic>();
    return null;
  }

  String? _currentLabel() {
    final primary = _primaryIntent();
    final label = (primary?['label'] ?? primary?['name'])?.toString().trim();
    if (label == null || label.isEmpty) return null;
    return label;
  }

  double? _currentConfidenceValue() {
    final primary = _primaryIntent();
    return parseConfidenceValue(primary?['confidence']);
  }

  bool get _hasComparableBaseline {
    final baseline = _baseline;
    final currentRequestId = _requestId();
    return baseline != null &&
        currentRequestId != null &&
        currentRequestId.isNotEmpty &&
        baseline.requestId != currentRequestId;
  }

  Future<void> _saveCurrentAsBaseline() async {
    final problemId = widget.problemId;
    final requestId = _requestId();
    final label = _currentLabel();
    final confidence = _currentConfidenceValue();
    if (problemId == null || problemId.isEmpty) {
      _snack('缺少 problemId，无法保存为基线');
      return;
    }
    if (requestId == null || requestId.isEmpty || label == null || confidence == null) {
      _snack('当前结果信息不完整，无法保存为基线');
      return;
    }
    if (_savingBaseline) return;

    final baseline = RetestBaseline(
      problemId: problemId,
      requestId: requestId,
      label: label,
      confidence: confidence,
      createdAtIso: _currentResultAtIso ?? DateTime.now().toUtc().toIso8601String(),
    );

    setState(() => _savingBaseline = true);
    try {
      await _retestStore.saveBaseline(baseline);
      if (!mounted) return;
      setState(() => _baseline = baseline);
      _snack('已保存为该问题的基线结果');
    } catch (e) {
      _snack('保存基线失败：$e');
    } finally {
      if (mounted) setState(() => _savingBaseline = false);
    }
  }

  Future<void> _showFirstRetestAchievementDialog() async {
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder:
          (dialogContext) => AlertDialog(
            title: const Text('成就解锁：初次复测'),
            content: const Text('你已经开始持续观察这个问题啦'),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(dialogContext).pop(),
                child: const Text('知道了'),
              ),
            ],
          ),
    );
  }

  Future<void> _submitRetest() async {
    final problemId = widget.problemId;
    final baseline = _baseline;
    final currentRequestId = _requestId();
    if (problemId == null || problemId.isEmpty) {
      _snack('缺少 problemId，无法提交复测记录');
      return;
    }
    if (baseline == null) {
      _snack('还没有基线结果，先保存一次基线吧');
      return;
    }
    if (currentRequestId == null || currentRequestId.isEmpty) {
      _snack('没有 request_id，暂时无法提交复测');
      return;
    }
    if (baseline.requestId == currentRequestId) {
      _snack('当前结果已是基线，先再测一次再提交复测吧');
      return;
    }
    if (_submittingRetest) return;

    setState(() => _submittingRetest = true);
    try {
      await _inference.submitRetest(
        problemId: problemId,
        baselineRequestId: baseline.requestId,
        currentRequestId: currentRequestId,
      );
      _snack('已提交复测记录');

      final unlocked = await _retestStore.isFirstRetestUnlocked();
      if (!unlocked) {
        await _retestStore.unlockFirstRetest();
        await _showFirstRetestAchievementDialog();
      }
    } catch (e) {
      _snack('提交复测失败：$e');
    } finally {
      if (mounted) setState(() => _submittingRetest = false);
    }
  }

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

  Future<String?> _fetchShareTextTemplate() async {
    final problemId = widget.problemId;
    if (problemId == null || problemId.isEmpty) return null;

    try {
      final res = await widget.api.getJson(
        '/v1/templates/result?problem_id=${Uri.encodeQueryComponent(problemId)}',
      );
      final directShareAsset = res['share_asset'];
      if (directShareAsset is Map) {
        final template = directShareAsset['share_text_template']?.toString().trim();
        if (template != null && template.isNotEmpty) return template;
      }

      final nestedBundle = res['bundle'];
      if (nestedBundle is Map) {
        final nestedShareAsset = nestedBundle['share_asset'];
        if (nestedShareAsset is Map) {
          final template = nestedShareAsset['share_text_template']?.toString().trim();
          if (template != null && template.isNotEmpty) return template;
        }
      }
    } catch (_) {
      return null;
    }

    return null;
  }

  Future<String> _buildShareText() async {
    final primary = _resp?['primary_intent'];
    final label = (primary is Map ? (primary['label'] ?? primary['name']) : primary)?.toString();
    final confidencePercent = formatConfidencePercent(primary is Map ? primary['confidence'] : null);
    final template = await _fetchShareTextTemplate() ?? defaultShareTemplate;

    return buildShareTextFromTemplate(
      template: template,
      label: label,
      confidencePercent: confidencePercent,
    );
  }

  Future<void> _copyShareText() async {
    try {
      final text = await _buildShareText();
      await Clipboard.setData(ClipboardData(text: text));
      _snack('已复制分享文案');
    } catch (e) {
      _snack('复制分享文案失败：$e');
    }
  }

  Future<void> _systemShare() async {
    try {
      final text = await _buildShareText();
      await SharePlus.instance.share(ShareParams(text: text));
    } catch (e) {
      _snack('调起系统分享失败：$e');
    }
  }

  Widget _buildRetestCompareCard(BuildContext context) {
    final baseline = _baseline;
    final currentLabel = _currentLabel();
    final baselineConfidence = formatConfidencePercent(baseline?.confidence);
    final currentConfidence = formatConfidencePercent(_currentConfidenceValue());
    final labelChanged = baseline != null && currentLabel != null && baseline.label != currentLabel;

    if (!_hasComparableBaseline || baseline == null || currentLabel == null) {
      return const SizedBox.shrink();
    }

    final deltaText =
        baselineConfidence != null && currentConfidence != null
            ? formatConfidenceDelta(currentConfidence, baselineConfidence)
            : '-';

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('复测对比', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 10),
            Text('上次：${baseline.label}'),
            Text('上次置信度：${baselineConfidence == null ? '-' : '$baselineConfidence%'}'),
            Text('上次时间：${formatIsoTime(baseline.createdAtIso)}'),
            const SizedBox(height: 8),
            Text('本次：$currentLabel'),
            Text('本次置信度：${currentConfidence == null ? '-' : '$currentConfidence%'}'),
            Text('本次时间：${formatIsoTime(_currentResultAtIso)}'),
            const SizedBox(height: 10),
            Text(labelChanged ? '标签发生变化' : '标签保持一致'),
            Text('置信度变化：$deltaText'),
            const SizedBox(height: 12),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                FilledButton(
                  onPressed: _submittingRetest ? null : _submitRetest,
                  child: Text(_submittingRetest ? '提交中…' : '提交复测记录'),
                ),
                OutlinedButton(
                  onPressed: _savingBaseline ? null : _saveCurrentAsBaseline,
                  child: Text(_savingBaseline ? '保存中…' : '保存为新的基线'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
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
        final label = _currentLabel() ?? (primary is Map ? (primary['label'] ?? primary['name']) : primary)?.toString() ?? '-';
        final confidence = formatConfidencePercent(primary is Map ? primary['confidence'] : null);

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
                      'confidence：${confidence == null ? '-' : '$confidence%'}',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            if (_loadingBaseline)
              const Padding(
                padding: EdgeInsets.only(bottom: 12),
                child: LinearProgressIndicator(minHeight: 2),
              )
            else if (_hasComparableBaseline) ...[
              _buildRetestCompareCard(context),
              const SizedBox(height: 12),
            ] else if (widget.problemId != null) ...[
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(Icons.flag_outlined),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              '保存为基线',
                              style: TextStyle(fontWeight: FontWeight.w700),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              _baseline != null
                                  ? '当前结果已经是该问题的基线，可再测一次后回来做复测对比。'
                                  : '把这次结果保存为该问题的基线，后续复测会自动展示对比卡。',
                            ),
                            const SizedBox(height: 10),
                            FilledButton(
                              onPressed: _savingBaseline ? null : _saveCurrentAsBaseline,
                              child: Text(_savingBaseline ? '保存中…' : '保存为基线'),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),
            ],
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
                OutlinedButton(
                  onPressed: _copyShareText,
                  child: const Text('复制分享文案'),
                ),
                OutlinedButton(
                  onPressed: _systemShare,
                  child: const Text('系统分享'),
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
