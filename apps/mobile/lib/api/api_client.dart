import 'dart:convert';

import 'package:http/http.dart' as http;

import '../storage/local_store.dart';

class ApiClient {
  ApiClient({
    required this.baseUrl,
    required this.store,
    http.Client? client,
  }) : _client = client ?? http.Client();

  final String baseUrl;
  final LocalStore store;
  final http.Client _client;

  Future<Map<String, dynamic>> postJson(
    String path,
    Map<String, dynamic> body, {
    Map<String, String>? headers,
  }) async {
    final uri = Uri.parse('$baseUrl$path');
    final h = <String, String>{
      'Content-Type': 'application/json',
      ...?headers,
    };
    final token = await store.getToken();
    if (token != null && token.isNotEmpty) {
      h['Authorization'] = 'Bearer $token';
    }

    final res = await _client.post(uri, headers: h, body: jsonEncode(body));
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception('HTTP ${res.statusCode}: ${res.body}');
    }
    final ct = res.headers['content-type'] ?? '';
    if (!ct.contains('application/json')) {
      throw Exception('unexpected content-type: $ct');
    }
    final decoded = jsonDecode(res.body);
    if (decoded is Map<String, dynamic>) return decoded;
    throw Exception('unexpected json shape');
  }

  Future<void> ensureAnonymousAuth() async {
    final existing = await store.getToken();
    if (existing != null && existing.isNotEmpty) return;

    final res = await postJson('/v1/auth/anonymous', {});
    final userId = (res['user_id'] ?? '').toString();
    final token = (res['token'] ?? '').toString();
    if (userId.isEmpty || token.isEmpty) {
      throw Exception('invalid auth response: missing user_id/token');
    }
    await store.setAuth(userId: userId, token: token);
  }
}

