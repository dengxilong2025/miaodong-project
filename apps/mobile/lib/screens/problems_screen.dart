import 'package:flutter/material.dart';

import '../api/api_client.dart';

class ProblemsScreen extends StatelessWidget {
  const ProblemsScreen({super.key, required this.api});

  final ApiClient api;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '问题库（占位）',
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
            ),
            const SizedBox(height: 8),
            const Text('4.4 将在这里对接 /v1/problems 列表与详情。'),
            const SizedBox(height: 12),
            Text(
              '当前 API baseUrl：${api.baseUrl}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
      ),
    );
  }
}

