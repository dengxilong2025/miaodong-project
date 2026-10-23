import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:share_plus/share_plus.dart';

import '../api/api_client.dart';
import '../inference/inference_client.dart';
import '../retest/retest_store.dart';
import '../telemetry/telemetry_client.dart';
import 'problem_detail_screen.dart';

enum ResultPageState { loading, success, degraded, error }

const String defaultShareTemplate =
    '我家猫这次更像：{label}（{confidence}%）。来喵懂试试 #喵懂 #喵测';

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
  final resolvedLabel =
      (label == null || label.trim().isEmpty) ? '未知' : label.trim();
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
    required this.telemetry,
    required this.audioUrl,
    this.audioId,
    this.problemId,
  });

  final ApiClient api;
  final TelemetryClient telemetry;
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
  String? _followupAnswer;

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
      _followupAnswer = null;
    });

    try {
      final ctx = <String, dynamic>{'time_of_day': _timeOfDay()};

      await widget.telemetry.track(
        'inference_started',
        payload: {
          'entry': 'record',
          'problem_id': widget.problemId,
          'context_keys': ctx.keys.toList(),
        },
      );

      final res = await _inference.infer(
        audioUrl: widget.audioUrl,
        context: ctx,
        problemId: widget.problemId,
      );
      final degraded =
          (res['degraded'] == true) || (res['degraded']?.toString() == 'true');
      final currentAt = res['created_at']?.toString().trim().isNotEmpty == true
          ? res['created_at'].toString()
          : DateTime.now().toUtc().toIso8601String();

      final requestId = res['request_id']?.toString();
      final primary = _asMap(res['primary_intent']);
      final primaryIntentCode = _primaryIntentCodeFrom(primary);
      final modelVersion =
          (res['model_version'] ?? res['model'] ?? res['model_id'])?.toString();
      final confidence = primary?['confidence'];

      setState(() {
        _resp = res;
        _state = degraded ? ResultPageState.degraded : ResultPageState.success;
        _currentResultAtIso = currentAt;
      });

      if (degraded) {
        final degradedReason =
            (res['degraded_reason'] ?? res['reason'] ?? '').toString();
        await widget.telemetry.track(
          'inference_failed',
          requestId: requestId,
          payload: {
            'degraded': true,
            'degraded_reason': degradedReason,
          },
        );
      } else {
        await widget.telemetry.track(
          'inference_succeeded',
          requestId: requestId,
          payload: {
            'model_version': modelVersion,
            'primary_intent_code': primaryIntentCode,
            'confidence': confidence,
          },
        );
      }

      await widget.telemetry.track(
        'result_page_viewed',
        requestId: requestId,
        payload: {
          'problem_id': widget.problemId,
          'primary_intent_code': primaryIntentCode,
        },
      );

      final followup = _asMap(res['followup_question']);
      if (followup != null) {
        await widget.telemetry.track(
          'followup_question_shown',
          requestId: requestId,
          payload: {'question_id': followup['id']},
        );
      }
    } catch (e) {
      await widget.telemetry.track(
        'inference_failed',
        payload: {
          'degraded': false,
          'error': e.toString(),
          'problem_id': widget.problemId,
        },
      );
      setState(() {
        _error = e.toString();
        _state = ResultPageState.error;
      });
    }
  }

  String? _requestId() => _resp?['request_id']?.toString();

  String? _primaryIntentCodeFrom(Map<String, dynamic>? primary) {
    if (primary == null) return null;
    final candidates = [
      primary['code'],
      primary['intent_code'],
      primary['primary_intent_code'],
      primary['id'],
      primary['name'],
      primary['label'],
    ];
    for (final c in candidates) {
      final s = c?.toString().trim();
      if (s != null && s.isNotEmpty) return s;
    }
    return null;
  }

  Map<String, dynamic>? _primaryIntent() {
    final primary = _resp?['primary_intent'];
    if (primary is Map<String, dynamic>) return primary;
    if (primary is Map) return primary.cast<String, dynamic>();
    return null;
  }

  Map<String, dynamic>? _asMap(dynamic v) {
    if (v is Map<String, dynamic>) return v;
    if (v is Map) return Map<String, dynamic>.from(v);
    return null;
  }

  List<Map<String, dynamic>> _asListOfMap(dynamic v) {
    if (v is! List) return const [];
    return v.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  }

  int? _contentVersionValue() {
    final v = _resp?['content_version'];
    if (v is num) return v.toInt();
    return int.tryParse('$v');
  }

  Future<void> _answerFollowup(
      Map<String, dynamic> question, String value) async {
    setState(() => _followupAnswer = value);
    await widget.telemetry.track(
      'followup_question_answered',
      requestId: _requestId(),
      payload: {
        'question_id': (question['id'] ?? '').toString(),
        'answer_value': value,
      },
    );
  }

  void _trackToolsExpanded() {
    unawaited(
      widget.telemetry.track(
        'tools_section_expanded',
        requestId: _requestId(),
        contentVersion: _contentVersionValue(),
        payload: {'problem_id': widget.problemId},
      ),
    );
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
    if (requestId == null ||
        requestId.isEmpty ||
        label == null ||
        confidence == null) {
      _snack('当前结果信息不完整，无法保存为基线');
      return;
    }
    if (_savingBaseline) return;

    final baseline = RetestBaseline(
      problemId: problemId,
      requestId: requestId,
      label: label,
      confidence: confidence,
      createdAtIso:
          _currentResultAtIso ?? DateTime.now().toUtc().toIso8601String(),
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
      builder: (dialogContext) => AlertDialog(
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
      await widget.telemetry.track(
        'retest_started',
        requestId: currentRequestId,
        payload: {
          'problem_id': problemId,
          'baseline_request_id': baseline.requestId,
        },
      );

      await _inference.submitRetest(
        problemId: problemId,
        baselineRequestId: baseline.requestId,
        currentRequestId: currentRequestId,
      );
      _snack('已提交复测记录');

      final baselinePercent = formatConfidencePercent(baseline.confidence);
      final currentPercent = formatConfidencePercent(_currentConfidenceValue());
      final diff = (baselinePercent != null && currentPercent != null)
          ? (currentPercent - baselinePercent)
          : null;
      final direction = diff == null
          ? null
          : (diff == 0 ? 'same' : (diff > 0 ? 'up' : 'down'));

      await widget.telemetry.track(
        'retest_completed',
        requestId: currentRequestId,
        payload: {
          'problem_id': problemId,
          'baseline_request_id': baseline.requestId,
          'delta_direction': direction,
          'delta_value': diff,
        },
      );

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
      await widget.telemetry.track(
        'feedback_submitted',
        requestId: rid,
        payload: {
          'helpful': helpful,
          'problem_id': widget.problemId,
        },
      );
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
        final template =
            directShareAsset['share_text_template']?.toString().trim();
        if (template != null && template.isNotEmpty) return template;
      }

      final nestedBundle = res['bundle'];
      if (nestedBundle is Map) {
        final nestedShareAsset = nestedBundle['share_asset'];
        if (nestedShareAsset is Map) {
          final template =
              nestedShareAsset['share_text_template']?.toString().trim();
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
    final label =
        (primary is Map ? (primary['label'] ?? primary['name']) : primary)
            ?.toString();
    final confidencePercent =
        formatConfidencePercent(primary is Map ? primary['confidence'] : null);

    // 优先使用推理响应里已组装的 share_asset，避免额外请求。
    final responseShare = _asMap(_resp?['share_asset']);
    final responseTemplate =
        (responseShare?['share_text_template'] ?? '').toString().trim();
    final template = responseTemplate.isNotEmpty
        ? responseTemplate
        : (await _fetchShareTextTemplate() ?? defaultShareTemplate);

    return buildShareTextFromTemplate(
      template: template,
      label: label,
      confidencePercent: confidencePercent,
    );
  }

  Future<void> _copyShareText() async {
    final rid = _requestId();
    await widget.telemetry.track(
      'share_clicked',
      requestId: rid,
      payload: const {
        'share_channel': 'copy',
        'asset_type': 'text',
      },
    );
    try {
      final text = await _buildShareText();
      await Clipboard.setData(ClipboardData(text: text));
      await widget.telemetry.track(
        'share_completed',
        requestId: rid,
        payload: const {
          'share_channel': 'copy',
          'asset_type': 'text',
        },
      );
      _snack('已复制分享文案');
    } catch (e) {
      _snack('复制分享文案失败：$e');
    }
  }

  Future<void> _systemShare() async {
    final rid = _requestId();
    await widget.telemetry.track(
      'share_clicked',
      requestId: rid,
      payload: const {
        'share_channel': 'system',
        'asset_type': 'text',
      },
    );
    try {
      final text = await _buildShareText();
      await Share.share(text);
      await widget.telemetry.track(
        'share_completed',
        requestId: rid,
        payload: const {
          'share_channel': 'system',
          'asset_type': 'text',
        },
      );
    } catch (e) {
      _snack('调起系统分享失败：$e');
    }
  }

  List<String> _asStringList(dynamic v) {
    if (v is! List) return const [];
    return v
        .map((e) =>
            e is Map ? (e['text'] ?? e['title'] ?? e).toString() : e.toString())
        .where((s) => s.trim().isNotEmpty)
        .toList();
  }

  Widget _sectionTitle(BuildContext context, String text) {
    return Padding(
      padding: const EdgeInsets.only(top: 4, bottom: 6),
      child: Text(
        text,
        style: Theme.of(context)
            .textTheme
            .titleMedium
            ?.copyWith(fontWeight: FontWeight.w800),
      ),
    );
  }

  Widget _buildFollowupCard(BuildContext context, Map<String, dynamic> q) {
    final text = (q['text'] ?? '').toString().trim();
    if (text.isEmpty) return const SizedBox.shrink();

    final options = _asListOfMap(q['options']);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('帮我校准一下',
                style: Theme.of(context)
                    .textTheme
                    .titleSmall
                    ?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 6),
            Text(text),
            if (options.isNotEmpty) ...[
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: options.map((o) {
                  final value = (o['value'] ?? '').toString();
                  final label = (o['label'] ?? value).toString();
                  return ChoiceChip(
                    label: Text(label.isNotEmpty ? label : value),
                    selected: _followupAnswer == value,
                    onSelected: (selected) {
                      if (selected) unawaited(_answerFollowup(q, value));
                    },
                  );
                }).toList(),
              ),
            ],
            if (_followupAnswer != null) ...[
              const SizedBox(height: 8),
              const Text('已记录，谢谢～',
                  style: TextStyle(fontSize: 12, color: Color(0xFF2E7D32))),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildSuggestionsSection(
      BuildContext context, List<Map<String, dynamic>> suggestions) {
    if (suggestions.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionTitle(context, '建议'),
        ...suggestions.map((s) {
          final title = (s['title'] ?? '').toString();
          final steps = _asStringList(s['steps']);
          final window = s['expected_window_hours'];
          final windowHours =
              window is num ? window.toInt() : int.tryParse('$window');
          final retestTip = (s['retest_tip'] ?? '').toString().trim();
          return Card(
            margin: const EdgeInsets.only(bottom: 10),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title.isNotEmpty ? title : '建议',
                    style: Theme.of(context)
                        .textTheme
                        .titleSmall
                        ?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  if (steps.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    ...steps.map((t) => Padding(
                          padding: const EdgeInsets.only(bottom: 4),
                          child: Text('• $t'),
                        )),
                  ],
                  if (windowHours != null && windowHours > 0) ...[
                    const SizedBox(height: 4),
                    Text('预计 $windowHours 小时内可观察',
                        style: Theme.of(context).textTheme.bodySmall),
                  ],
                  if (retestTip.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text('复测提示：$retestTip',
                        style: Theme.of(context).textTheme.bodySmall),
                  ],
                ],
              ),
            ),
          );
        }),
      ],
    );
  }

  Widget _buildDegradedSuggestions(
      BuildContext context, List<Map<String, dynamic>> suggestions) {
    if (suggestions.isEmpty) return const SizedBox.shrink();
    return Card(
      child: ExpansionTile(
        title: const Text('先按问题库建议排查'),
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
        children: suggestions.map((s) {
          final title = (s['title'] ?? '').toString();
          final steps = _asStringList(s['steps']);
          return ListTile(
            dense: true,
            contentPadding: EdgeInsets.zero,
            title: Text(title.isNotEmpty ? title : '建议'),
            subtitle: steps.isEmpty ? null : Text(steps.join('；')),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildRiskCard(BuildContext context, Map<String, dynamic> risk) {
    final level = (risk['level'] ?? 'green').toString();
    final message = (risk['message'] ?? '').toString().trim();
    if (message.isEmpty) return const SizedBox.shrink();

    Color color;
    String label;
    switch (level) {
      case 'red':
        color = const Color(0xFFC62828);
        label = '红灯';
        break;
      case 'yellow':
        color = const Color(0xFFF9A825);
        label = '黄灯';
        break;
      default:
        color = const Color(0xFF2E7D32);
        label = '绿灯';
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.health_and_safety_outlined, color: color),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('风险提示 · $label',
                      style:
                          TextStyle(fontWeight: FontWeight.w800, color: color)),
                  const SizedBox(height: 4),
                  Text(message),
                  const SizedBox(height: 6),
                  Text('本结果不构成医疗诊断，出现异常请及时咨询兽医。',
                      style: Theme.of(context).textTheme.bodySmall),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildToolsSection(BuildContext context, Map<String, dynamic> tools) {
    final blocks = _asListOfMap(tools['content_blocks']);
    if (blocks.isEmpty) return const SizedBox.shrink();
    final collapsed = tools['collapsed_by_default'] != false;

    return Card(
      child: ExpansionTile(
        title: const Text('省力工具（可选）'),
        subtitle: const Text('不买也能先按建议做'),
        initiallyExpanded: !collapsed,
        onExpansionChanged: (open) {
          if (open) _trackToolsExpanded();
        },
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
        children: blocks.map((b) => _buildToolBlock(context, b)).toList(),
      ),
    );
  }

  Widget _buildToolBlock(BuildContext context, Map<String, dynamic> block) {
    final type = (block['type'] ?? '').toString();
    final title = (block['title'] ?? '').toString();

    if (type == 'efficiency_list') {
      final items = _asListOfMap(block['items']);
      return Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (title.isNotEmpty)
              Text(title,
                  style: Theme.of(context)
                      .textTheme
                      .titleSmall
                      ?.copyWith(fontWeight: FontWeight.w700)),
            ...items.map((it) {
              final name =
                  (it['name'] ?? it['title'] ?? it['sku_key'] ?? '').toString();
              final reason = (it['reason'] ?? '').toString();
              return ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                title: Text(name.isNotEmpty ? name : it.toString()),
                subtitle: reason.isEmpty ? null : Text(reason),
              );
            }),
          ],
        ),
      );
    }

    final bullets = _asStringList(block['bullets']);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (title.isNotEmpty)
            Text(title,
                style: Theme.of(context)
                    .textTheme
                    .titleSmall
                    ?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          ...bullets.map((t) => Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Text('• $t'),
              )),
        ],
      ),
    );
  }

  Widget _buildRetestCompareCard(BuildContext context) {
    final baseline = _baseline;
    final currentLabel = _currentLabel();
    final baselineConfidence = formatConfidencePercent(baseline?.confidence);
    final currentConfidence =
        formatConfidencePercent(_currentConfidenceValue());
    final labelChanged = baseline != null &&
        currentLabel != null &&
        baseline.label != currentLabel;

    if (!_hasComparableBaseline || baseline == null || currentLabel == null) {
      return const SizedBox.shrink();
    }

    final deltaText = baselineConfidence != null && currentConfidence != null
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
            Text(
                '上次置信度：${baselineConfidence == null ? '-' : '$baselineConfidence%'}'),
            Text('上次时间：${formatIsoTime(baseline.createdAtIso)}'),
            const SizedBox(height: 8),
            Text('本次：$currentLabel'),
            Text(
                '本次置信度：${currentConfidence == null ? '-' : '$currentConfidence%'}'),
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
                style: Theme.of(context)
                    .textTheme
                    .titleLarge
                    ?.copyWith(fontWeight: FontWeight.w800),
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
                              telemetry: widget.telemetry,
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
        final reason =
            (resp?['degraded_reason'] ?? resp?['reason'] ?? '-').toString();
        body = Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '本次结果不可用（降级）',
                style: Theme.of(context)
                    .textTheme
                    .titleLarge
                    ?.copyWith(fontWeight: FontWeight.w800),
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
                      Text('degraded_reason：$reason',
                          style: Theme.of(context).textTheme.bodySmall),
                    ],
                  ),
                ),
              ),
              if (_asListOfMap(resp?['suggestions']).isNotEmpty) ...[
                const SizedBox(height: 12),
                _buildDegradedSuggestions(
                    context, _asListOfMap(resp?['suggestions'])),
              ],
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
                              telemetry: widget.telemetry,
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
        final label = _currentLabel() ??
            (primary is Map ? (primary['label'] ?? primary['name']) : primary)
                ?.toString() ??
            '-';
        final confidence = formatConfidencePercent(
            primary is Map ? primary['confidence'] : null);

        final explanationsRaw = resp?['explanations'];
        final explanations =
            (explanationsRaw is List) ? explanationsRaw : const [];
        final followup = _asMap(resp?['followup_question']);
        final suggestions = _asListOfMap(resp?['suggestions']);
        final risk = _asMap(resp?['risk_level']);
        final tools = _asMap(resp?['optional_tools_section']);

        body = ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              '分析结果',
              style: Theme.of(context)
                  .textTheme
                  .titleLarge
                  ?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 10),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('更像：$label',
                        style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 6),
                    Text(
                      '置信度：${confidence == null ? '-' : '$confidence%'}',
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
                              '建立复测基线',
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
                              onPressed: _savingBaseline
                                  ? null
                                  : _saveCurrentAsBaseline,
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
                  final text =
                      (e['text'] ?? e['explanation'] ?? e['reason'] ?? '')
                          .toString();
                  final title = factor.isNotEmpty ? factor : '解释';
                  return ListTile(
                    dense: true,
                    title: Text(title),
                    subtitle: text.isEmpty ? null : Text(text),
                  );
                }
                return ListTile(dense: true, title: Text(e.toString()));
              }),
            if (followup != null) ...[
              const SizedBox(height: 12),
              _buildFollowupCard(context, followup),
            ],
            if (suggestions.isNotEmpty) ...[
              const SizedBox(height: 12),
              _buildSuggestionsSection(context, suggestions),
            ],
            if (risk != null) ...[
              const SizedBox(height: 12),
              _buildRiskCard(context, risk),
            ],
            if (tools != null) ...[
              const SizedBox(height: 12),
              _buildToolsSection(context, tools),
            ],
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
                            telemetry: widget.telemetry,
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
    const encoder = JsonEncoder.withIndent('  ');
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
          SizedBox(
              width: 140,
              child: Text('$k：',
                  style: const TextStyle(fontWeight: FontWeight.w600))),
          Expanded(child: SelectableText(val)),
        ],
      ),
    );
  }
}
