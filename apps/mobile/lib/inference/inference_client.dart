import '../api/api_client.dart';

class InferenceClient {
  InferenceClient({required this.api});

  final ApiClient api;

  Future<Map<String, dynamic>> infer({
    required String audioUrl,
    required Map<String, dynamic> context,
  }) async {
    return api.postJson('/v1/inference', {
      'audio_url': audioUrl,
      'context': context,
    });
  }

  Future<Map<String, dynamic>> sendFeedback({
    required String requestId,
    required bool helpful,
  }) async {
    return api.postJson('/v1/feedback', {
      'request_id': requestId,
      'helpful': helpful,
    });
  }
}

