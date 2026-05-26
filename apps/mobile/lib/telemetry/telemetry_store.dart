import 'dart:convert';

import '../storage/local_store.dart';

const String kTelemetryQueueKey = 'telemetry_queue_v1';
const int kTelemetryMaxQueueSize = 50;

class TelemetryStore {
  TelemetryStore({required this.store});

  final LocalStore store;

  Future<List<Map<String, dynamic>>> list() async {
    final raw = await store.getString(kTelemetryQueueKey);
    if (raw == null || raw.trim().isEmpty) return const [];

    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List) return const [];
      return decoded
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  Future<void> enqueue(Map<String, dynamic> event) async {
    final items = (await list()).toList();
    items.add(event);

    // 只保留最近 kTelemetryMaxQueueSize 条（丢弃最老的）。
    if (items.length > kTelemetryMaxQueueSize) {
      final start = items.length - kTelemetryMaxQueueSize;
      final trimmed = items.sublist(start);
      await store.setString(kTelemetryQueueKey, jsonEncode(trimmed));
      return;
    }

    await store.setString(kTelemetryQueueKey, jsonEncode(items));
  }

  Future<void> removeFirstN(int n) async {
    if (n <= 0) return;

    final items = (await list()).toList();
    if (items.isEmpty) return;

    if (n >= items.length) {
      await clear();
      return;
    }

    final remaining = items.sublist(n);
    await store.setString(kTelemetryQueueKey, jsonEncode(remaining));
  }

  Future<void> clear() async {
    await store.setString(kTelemetryQueueKey, jsonEncode(const <dynamic>[]));
  }
}

