import 'dart:convert';

import '../storage/local_store.dart';

class RetestBaseline {
  RetestBaseline({
    required this.problemId,
    required this.requestId,
    required this.label,
    required this.confidence,
    required this.createdAtIso,
  });

  final String problemId;
  final String requestId;
  final String label;
  final double confidence;
  final String createdAtIso;

  Map<String, dynamic> toJson() => {
    'problem_id': problemId,
    'request_id': requestId,
    'label': label,
    'confidence': confidence,
    'created_at': createdAtIso,
  };

  factory RetestBaseline.fromJson(Map<String, dynamic> json) {
    final confidenceRaw = json['confidence'];
    final confidence = switch (confidenceRaw) {
      num value => value.toDouble(),
      _ => double.tryParse(confidenceRaw?.toString() ?? ''),
    };

    return RetestBaseline(
      problemId: (json['problem_id'] ?? '').toString(),
      requestId: (json['request_id'] ?? '').toString(),
      label: (json['label'] ?? '').toString(),
      confidence: confidence ?? 0,
      createdAtIso: (json['created_at'] ?? '').toString(),
    );
  }
}

class RetestStore {
  RetestStore({required this.store});

  static const _firstRetestUnlockedKey = 'achievement_first_retest_unlocked';

  final LocalStore store;

  Future<RetestBaseline?> getBaseline(String problemId) async {
    final raw = await store.getString(_baselineKey(problemId));
    if (raw == null || raw.isEmpty) return null;

    final decoded = jsonDecode(raw);
    if (decoded is! Map<String, dynamic>) return null;

    final baseline = RetestBaseline.fromJson(decoded);
    if (baseline.problemId.isEmpty || baseline.requestId.isEmpty) return null;
    return baseline;
  }

  Future<void> saveBaseline(RetestBaseline baseline) async {
    await store.setString(_baselineKey(baseline.problemId), jsonEncode(baseline.toJson()));
  }

  Future<bool> isFirstRetestUnlocked() async {
    return await store.getBool(_firstRetestUnlockedKey) ?? false;
  }

  Future<void> unlockFirstRetest() async {
    await store.setBool(_firstRetestUnlockedKey, true);
  }

  String _baselineKey(String problemId) => 'retest_baseline_$problemId';
}
