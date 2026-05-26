import 'dart:io' show Platform;
import 'dart:math';

import '../api/api_client.dart';
import '../storage/local_store.dart';
import 'telemetry_store.dart';

const String kTelemetrySessionIdKey = 'telemetry_session_id_v1';
const String kTelemetryAppVersion = '0.1.0';

class TelemetryClient {
  TelemetryClient({
    required this.api,
    required this.store,
    TelemetryStore? queue,
  }) : _queue = queue ?? TelemetryStore(store: store);

  final ApiClient api;
  final LocalStore store;
  final TelemetryStore _queue;

  Future<String> _sessionId() async {
    final existing = await store.getString(kTelemetrySessionIdKey);
    if (existing != null && existing.trim().isNotEmpty) return existing.trim();

    final rand = Random.secure();
    final v = '${DateTime.now().millisecondsSinceEpoch}-${rand.nextInt(1 << 32)}';
    await store.setString(kTelemetrySessionIdKey, v);
    return v;
  }

  String _platform() {
    if (Platform.isIOS) return 'ios';
    if (Platform.isAndroid) return 'android';
    return 'unknown';
  }

  Future<void> track(
    String eventName, {
    String? requestId,
    int? contentVersion,
    Map<String, dynamic>? payload,
  }) async {
    final tsMs = DateTime.now().millisecondsSinceEpoch;

    final event = <String, dynamic>{
      'event_name': eventName,
      'ts_ms': tsMs,
      'user_id': await store.getUserId(),
      'session_id': await _sessionId(),
      'platform': _platform(),
      'app_version': kTelemetryAppVersion,
      'payload': payload ?? <String, dynamic>{},
      if (contentVersion != null) 'content_version': contentVersion,
      if (requestId != null && requestId.trim().isNotEmpty) 'request_id': requestId.trim(),
    };

    try {
      await api.postAnalyticsEvent(event);
    } catch (_) {
      // v0.1-alpha：失败直接入队，不影响 UI。
      try {
        await _queue.enqueue(event);
      } catch (_) {
        // ignore
      }
    }
  }

  /// flush 队列：按顺序逐条发送；中途失败则停止，保留未发送的队列。
  Future<void> flush() async {
    final items = await _queue.list();
    if (items.isEmpty) return;

    var success = 0;
    for (final e in items) {
      try {
        await api.postAnalyticsEvent(e);
        success += 1;
      } catch (_) {
        break;
      }
    }

    if (success > 0) {
      try {
        await _queue.removeFirstN(success);
      } catch (_) {
        // ignore
      }
    }
  }
}

