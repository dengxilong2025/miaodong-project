import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../storage/local_store.dart';

class MeScreen extends StatefulWidget {
  const MeScreen({super.key, required this.api, required this.store});

  final ApiClient api;
  final LocalStore store;

  @override
  State<MeScreen> createState() => _MeScreenState();
}

class _MeScreenState extends State<MeScreen> {
  String? _userId;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final uid = await widget.store.getUserId();
    setState(() {
      _userId = uid;
      _loading = false;
    });
  }

  Future<void> _clear() async {
    await widget.store.clear();
    await _load();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('已清除本地缓存，下次会重新匿名登录')),
    );
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
              '我的（占位）',
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
            ),
            const SizedBox(height: 12),
            if (_loading) ...[
              const LinearProgressIndicator(),
              const SizedBox(height: 8),
              const Text('加载中…'),
            ] else ...[
              Text('user_id：${_userId ?? "-"}'),
              const SizedBox(height: 6),
              FutureBuilder<String?>(
                future: widget.store.getToken(),
                builder: (context, snap) {
                  final t = snap.data;
                  final short = (t == null || t.isEmpty)
                      ? '-'
                      : '${t.substring(0, t.length > 12 ? 12 : t.length)}…（len=${t.length}）';
                  return Text('token：$short');
                },
              ),
              const SizedBox(height: 16),
              OutlinedButton.icon(
                onPressed: _clear,
                icon: const Icon(Icons.delete_outline),
                label: const Text('清除本地缓存'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

