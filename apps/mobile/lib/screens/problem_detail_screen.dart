import 'package:flutter/material.dart';

import '../api/api_client.dart';
import 'record_screen.dart';

class ProblemDetailScreen extends StatefulWidget {
  const ProblemDetailScreen({
    super.key,
    required this.api,
    required this.problemId,
  });

  final ApiClient api;
  final String problemId;

  @override
  State<ProblemDetailScreen> createState() => _ProblemDetailScreenState();
}

class _ProblemDetailScreenState extends State<ProblemDetailScreen> {
  bool _loading = true;
  String? _error;

  int? _contentVersion;
  Map<String, dynamic>? _problem;
  List<Map<String, dynamic>> _questions = const [];
  List<Map<String, dynamic>> _suggestions = const [];
  Map<String, dynamic>? _toolsGuide;

  @override
  void initState() {
    super.initState();
    _load();
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

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      await widget.api.ensureAnonymousAuth();
      final res = await widget.api.getJson('/v1/problems/${widget.problemId}');

      final cvAny = res['content_version'];
      final cv = cvAny is num ? cvAny.toInt() : int.tryParse('$cvAny');

      final problem = _asMap(res['problem']);
      final questions = _asListOfMap(res['questions']);
      final suggestions = _asListOfMap(res['suggestions']);

      // 服务端目前是 tools_guides（复数）；plan 写的是 tools_guide（单数），这里兼容两者。
      final toolsGuide = _asMap(res['tools_guide']) ?? _asMap(res['tools_guides']);

      setState(() {
        _contentVersion = cv;
        _problem = problem;
        _questions = questions;
        _suggestions = suggestions;
        _toolsGuide = toolsGuide;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final problem = _problem ?? const {};
    final title = (problem['title'] ?? '').toString().trim();
    final summary = (problem['summary'] ?? '').toString().trim();

    final tagsAny = problem['tags'];
    final tags = (tagsAny is List) ? tagsAny.map((e) => e.toString()).where((s) => s.isNotEmpty).toList() : const <String>[];

    Widget body;
    if (_loading) {
      body = const Center(
        child: Padding(
          padding: EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              CircularProgressIndicator(),
              SizedBox(height: 12),
              Text('正在加载…'),
            ],
          ),
        ),
      );
    } else if (_error != null) {
      body = Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '加载失败',
              style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 8),
            Text(_error!, style: const TextStyle(color: Colors.red)),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: _load,
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('重试'),
            ),
          ],
        ),
      );
    } else {
      body = ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            title.isNotEmpty ? title : '问题详情',
            style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 6),
          Text(
            _contentVersion == null ? 'content_version：—' : 'content_version：$_contentVersion',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 12),

          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (summary.isNotEmpty) Text(summary),
                  if (summary.isEmpty) const Text('（暂无摘要）'),
                  if (tags.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: tags.map((t) => Chip(label: Text(t))).toList(),
                    ),
                  ],
                ],
              ),
            ),
          ),

          const SizedBox(height: 16),
          Text('追问', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 6),
          if (_questions.isEmpty)
            const Text('（暂无追问）')
          else
            ..._questions.map((q) {
              final qText = (q['text'] ?? q['title'] ?? q['question'] ?? '').toString();
              final qType = (q['type'] ?? q['question_type'] ?? '').toString();
              final titleText = qType.isNotEmpty ? '$qText（$qType）' : qText;
              return ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                title: Text(titleText.isNotEmpty ? titleText : q.toString()),
              );
            }),

          const SizedBox(height: 12),
          Text('建议', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 6),
          if (_suggestions.isEmpty)
            const Text('（暂无建议）')
          else
            ..._suggestions.map((s) {
              final st = (s['title'] ?? s['name'] ?? '').toString();

              final stepsAny = s['steps'];
              final steps = (stepsAny is List)
                  ? stepsAny.take(2).map((e) => e is Map ? (e['text'] ?? e['title'] ?? e).toString() : e.toString()).toList()
                  : const <String>[];

              return Card(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(st.isNotEmpty ? st : '建议', style: Theme.of(context).textTheme.titleSmall),
                      if (steps.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        ...steps.map((t) => Padding(
                              padding: const EdgeInsets.only(bottom: 4),
                              child: Text('• $t'),
                            )),
                      ],
                    ],
                  ),
                ),
              );
            }),

          if (_toolsGuide != null) ...[
            const SizedBox(height: 12),
            ExpansionTile(
              title: const Text('省力工具（可选）'),
              initiallyExpanded: false,
              childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              children: _buildToolsGuide(context, _toolsGuide!),
            ),
          ],
          const SizedBox(height: 80),
        ],
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('问题详情')),
      body: SafeArea(child: body),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: FilledButton.icon(
            onPressed: (_loading || _error != null)
                ? null
                : () {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => RecordScreen(
                          api: widget.api,
                          problemId: widget.problemId,
                        ),
                      ),
                    );
                  },
            icon: const Icon(Icons.mic_rounded),
            label: const Text('开始喵测'),
          ),
        ),
      ),
    );
  }

  List<Widget> _buildToolsGuide(BuildContext context, Map<String, dynamic> tg) {
    final bulletsAny = tg['guide_bullets'] ?? tg['bullets'];
    final bullets = (bulletsAny is List) ? bulletsAny.map((e) => e.toString()).where((s) => s.isNotEmpty).toList() : const <String>[];

    final itemsAny = tg['efficiency_items'] ?? tg['items'];
    final items = (itemsAny is List) ? itemsAny.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList() : const <Map<String, dynamic>>[];

    final children = <Widget>[];

    if (bullets.isNotEmpty) {
      children.addAll(bullets.map((t) => Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Text('• $t'),
          )));
    }

    if (items.isNotEmpty) {
      if (children.isNotEmpty) children.add(const SizedBox(height: 8));
      children.add(Text('推荐清单', style: Theme.of(context).textTheme.titleSmall));
      children.add(const SizedBox(height: 6));
      children.addAll(items.map((it) {
        final name = (it['name'] ?? it['title'] ?? it['sku_key'] ?? '').toString();
        final reason = (it['reason'] ?? '').toString();
        return ListTile(
          dense: true,
          contentPadding: EdgeInsets.zero,
          title: Text(name.isNotEmpty ? name : it.toString()),
          subtitle: reason.isEmpty ? null : Text(reason),
        );
      }));
    }

    if (children.isEmpty) {
      children.add(const Text('（暂无内容）'));
    }

    return children;
  }
}

