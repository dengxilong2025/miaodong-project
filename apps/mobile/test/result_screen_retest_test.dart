import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:miaodong_mobile/api/api_client.dart';
import 'package:miaodong_mobile/screens/result_screen.dart';
import 'package:miaodong_mobile/storage/local_store.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('without baseline user can save current result as baseline', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final client = _QueueClient([
      _QueuedResponse.json({
        'request_id': 'req_current',
        'primary_intent': {'label': '夜间嚎叫', 'confidence': 0.91},
        'explanations': [],
      }),
    ]);
    final api = ApiClient(
      baseUrl: 'http://example.com',
      store: LocalStore(),
      client: client,
    );

    await tester.pumpWidget(
      MaterialApp(
        home: ResultScreen(
          api: api,
          audioUrl: 'https://example.com/audio.m4a',
          problemId: 'night_meow',
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('保存为基线'), findsOneWidget);
    expect(find.text('提交复测记录'), findsNothing);

    await tester.tap(find.text('保存为基线'));
    await tester.pumpAndSettle();

    expect(find.text('已保存为该问题的基线结果'), findsOneWidget);

    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString('retest_baseline_night_meow');
    expect(saved, isNotNull);
    expect(
      jsonDecode(saved!),
      containsPair('request_id', 'req_current'),
    );
  });

  testWidgets('with baseline user sees compare card and first submit unlocks achievement', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({
      'retest_baseline_night_meow': jsonEncode({
        'problem_id': 'night_meow',
        'request_id': 'req_old',
        'label': '夜间嚎叫',
        'confidence': 0.52,
        'created_at': '2026-04-27T08:30:00.000Z',
      }),
    });
    final client = _QueueClient([
      _QueuedResponse.json({
        'request_id': 'req_new',
        'primary_intent': {'label': '持续叫', 'confidence': 0.83},
        'explanations': [],
      }),
      _QueuedResponse.json({'ok': true}),
    ]);
    final api = ApiClient(
      baseUrl: 'http://example.com',
      store: LocalStore(),
      client: client,
    );

    await tester.pumpWidget(
      MaterialApp(
        home: ResultScreen(
          api: api,
          audioUrl: 'https://example.com/audio.m4a',
          problemId: 'night_meow',
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('复测对比'), findsOneWidget);
    expect(find.text('上次：夜间嚎叫'), findsOneWidget);
    expect(find.text('本次：持续叫'), findsOneWidget);
    expect(find.text('标签发生变化'), findsOneWidget);
    expect(find.text('提交复测记录'), findsOneWidget);
    expect(find.text('保存为新的基线'), findsOneWidget);

    await tester.tap(find.text('提交复测记录'));
    await tester.pumpAndSettle();

    expect(find.text('成就解锁：初次复测'), findsOneWidget);
    expect(find.text('你已经开始持续观察这个问题啦'), findsOneWidget);

    final retestRequest = client.requests.last;
    expect(retestRequest.method, 'POST');
    expect(retestRequest.url.path, '/v1/retest');
    expect(
      jsonDecode(retestRequest.body),
      {
        'problem_id': 'night_meow',
        'baseline_request_id': 'req_old',
        'current_request_id': 'req_new',
      },
    );

    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getBool('achievement_first_retest_unlocked'), isTrue);
  });
}

class _QueueClient extends http.BaseClient {
  _QueueClient(this._responses);

  final List<_QueuedResponse> _responses;
  final List<http.Request> requests = [];

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    if (_responses.isEmpty) {
      throw StateError('No queued response for ${request.method} ${request.url}');
    }
    final typed = request as http.Request;
    requests.add(typed);
    final response = _responses.removeAt(0);
    return http.StreamedResponse(
      Stream.value(utf8.encode(response.body)),
      response.statusCode,
      headers: response.headers,
    );
  }
}

class _QueuedResponse {
  _QueuedResponse({
    required this.body,
    required this.statusCode,
    required this.headers,
  });

  factory _QueuedResponse.json(Map<String, dynamic> body) {
    return _QueuedResponse(
      body: jsonEncode(body),
      statusCode: 200,
      headers: const {'content-type': 'application/json'},
    );
  }

  final String body;
  final int statusCode;
  final Map<String, String> headers;
}
