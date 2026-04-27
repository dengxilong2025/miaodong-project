import 'package:flutter/material.dart';

import '../api/api_client.dart';
import 'problem_detail_screen.dart';

class ProblemsScreen extends StatefulWidget {
  const ProblemsScreen({super.key, required this.api});

  final ApiClient api;

  @override
  State<ProblemsScreen> createState() => _ProblemsScreenState();
}

class _ProblemsScreenState extends State<ProblemsScreen> {
  bool _loading = true;
  String? _error;
  int? _contentVersion;
  List<Map<String, dynamic>> _items = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      await widget.api.ensureAnonymousAuth();
      final res = await widget.api.getJson('/v1/problems?limit=3');

      final cvAny = res['content_version'];
      final cv = cvAny is num ? cvAny.toInt() : int.tryParse('$cvAny');

      final itemsAny = res['items'];
      final items = (itemsAny is List ? itemsAny : const [])
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();

      setState(() {
        _contentVersion = cv;
        _items = items;
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
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '问题库',
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
            ),
            const SizedBox(height: 8),
            Text(
              _contentVersion == null ? 'content_version：—' : 'content_version：$_contentVersion',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 12),

            if (_loading) ...[
              const LinearProgressIndicator(),
              const SizedBox(height: 10),
              const Text('正在加载…'),
            ] else if (_error != null) ...[
              Text(
                '加载失败：$_error',
                style: const TextStyle(color: Colors.red),
              ),
              const SizedBox(height: 10),
              FilledButton(
                onPressed: _load,
                child: const Text('重试'),
              ),
            ] else ...[
              Expanded(
                child: ListView.separated(
                  itemCount: _items.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (context, i) {
                    final item = _items[i];
                    final id = (item['id'] ?? '').toString();
                    final title = (item['title'] ?? '').toString();
                    final summary = (item['summary'] ?? '').toString();
                    final displayTitle = title.isNotEmpty ? title : (id.isNotEmpty ? id : '未命名问题');
                    final displaySummary = summary.isNotEmpty ? summary : '（暂无摘要）';

                    return ListTile(
                      title: Text(displayTitle),
                      subtitle: Text(displaySummary),
                      trailing: const Icon(Icons.chevron_right_rounded),
                      onTap: id.isEmpty
                          ? null
                          : () {
                              Navigator.of(context).push(
                                MaterialPageRoute(
                                  builder: (_) => ProblemDetailScreen(
                                    api: widget.api,
                                    problemId: id,
                                  ),
                                ),
                              );
                            },
                    );
                  },
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
