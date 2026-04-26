import 'package:flutter/material.dart';

import '../api/api_client.dart';
import 'record_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.api});

  final ApiClient api;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  bool _loading = true;
  String? _error;
  String? _userId;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await widget.api.ensureAnonymousAuth();
      final uid = await widget.api.store.getUserId();
      setState(() {
        _userId = uid;
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
              '喵懂 · 喵测',
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
            ),
            const SizedBox(height: 8),
            Text(
              '录一段 6–10 秒猫叫声，我们会给出解释、追问与建议。',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            const SizedBox(height: 16),

            if (_loading) ...[
              const LinearProgressIndicator(),
              const SizedBox(height: 10),
              const Text('正在匿名登录…'),
            ] else if (_error != null) ...[
              Text(
                '登录失败：$_error',
                style: const TextStyle(color: Colors.red),
              ),
              const SizedBox(height: 10),
              FilledButton(
                onPressed: _bootstrap,
                child: const Text('重试'),
              ),
            ] else ...[
              if (_userId != null)
                Text(
                  '已登录（匿名）：$_userId',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              const SizedBox(height: 12),
              FilledButton.icon(
                onPressed: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const RecordScreen()),
                  );
                },
                icon: const Icon(Icons.mic_rounded),
                label: const Text('开始喵测'),
              ),
              const SizedBox(height: 10),
              OutlinedButton.icon(
                onPressed: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('问题库入口：下一步在 4.4 接入')),
                  );
                },
                icon: const Icon(Icons.list_alt_rounded),
                label: const Text('先看问题库'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

