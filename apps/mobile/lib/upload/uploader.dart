import 'dart:io';

import '../api/api_client.dart';

class UploadInstruction {
  UploadInstruction({
    required this.audioId,
    required this.uploadUrl,
    required this.method,
    required this.headers,
    required this.expiresIn,
    required this.audioUrl,
    required this.storage,
  });

  final String audioId;
  final String uploadUrl;
  final String method;
  final Map<String, String> headers;
  final int expiresIn;
  final String audioUrl;
  final String storage;

  static UploadInstruction fromJson(Map<String, dynamic> j) {
    final headers = <String, String>{};
    final rawHeaders = j['headers'];
    if (rawHeaders is Map) {
      for (final e in rawHeaders.entries) {
        headers[e.key.toString()] = e.value.toString();
      }
    }

    return UploadInstruction(
      audioId: (j['audio_id'] ?? '').toString(),
      uploadUrl: (j['upload_url'] ?? '').toString(),
      method: (j['method'] ?? 'PUT').toString(),
      headers: headers,
      expiresIn: int.tryParse((j['expires_in'] ?? 0).toString()) ?? 0,
      audioUrl: (j['audio_url'] ?? '').toString(),
      storage: (j['storage'] ?? '').toString(),
    );
  }
}

/// 上传封装：
/// - POST /v1/audio/upload-url
/// - PUT upload_url
class Uploader {
  Uploader({required this.api});

  final ApiClient api;

  Future<UploadInstruction> getUploadUrl({
    String? contentType,
    int? durationMs,
  }) async {
    // v0.1：后端不强校验，可为空；这里仍保持结构可扩展
    final body = <String, dynamic>{};
    if (contentType != null) body['content_type'] = contentType;
    if (durationMs != null) body['duration_ms'] = durationMs;

    final res = await api.postJson('/v1/audio/upload-url', body);
    final ins = UploadInstruction.fromJson(res);
    if (ins.audioId.isEmpty || ins.uploadUrl.isEmpty) {
      throw Exception('upload-url 返回不完整：缺少 audio_id/upload_url');
    }
    return ins;
  }

  Future<void> uploadFile(UploadInstruction ins, File file) async {
    final bytes = await file.readAsBytes();
    await api.putBytes(ins.uploadUrl, ins.headers, bytes);
  }
}

