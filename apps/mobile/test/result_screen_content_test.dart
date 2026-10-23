import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:miaodong_mobile/api/api_client.dart';
import 'package:miaodong_mobile/screens/result_screen.dart';
import 'package:miaodong_mobile/storage/local_store.dart';
import 'package:miaodong_mobile/telemetry/telemetry_client.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('composed result renders followup, suggestions, risk and tools',
      (tester) async {
    tester.view.physicalSize = const Size(1200, 2600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    SharedPreferences.setMockInitialValues({});
    final client = _ComposedClient();
    final api = ApiClient(
      baseUrl: 'http://example.com',
      store: LocalStore(),
      client: client,
    );
    final telemetry = TelemetryClient(api: api, store: api.store);

    await tester.pumpWidget(
      MaterialApp(
        home: ResultScreen(
          api: api,
          telemetry: telemetry,
          audioUrl: 'https://example.com/audio.m4a',
          problemId: 'night_meow',
        ),
      ),
    );
    await tester.pumpAndSettle();

    // 推理请求必须携带 problem_id（结果页内容闭环的前提）。
    final inferenceReq =
        client.requests.singleWhere((r) => r.url.path == '/v1/inference');
    final inferenceBody = jsonDecode(inferenceReq.body) as Map<String, dynamic>;
    expect(inferenceBody['problem_id'], 'night_meow');

    expect(find.text('更像：想玩/精力过剩'), findsOneWidget);
    expect(find.text('置信度：72%'), findsOneWidget);
    expect(find.text('帮我校准一下'), findsOneWidget);
    expect(find.text('通常发生在你关灯后 0-30 分钟内吗？'), findsOneWidget);
    expect(find.text('是'), findsOneWidget);

    expect(find.text('建议'), findsOneWidget);
    expect(find.text('睡前小仪式'), findsOneWidget);
    expect(find.text('• 逗猫棒 5-10 分钟'), findsOneWidget);
    expect(find.text('预计 24 小时内可观察'), findsOneWidget);
    expect(find.text('复测提示：明晚同时间段再测'), findsOneWidget);

    expect(find.text('风险提示 · 绿灯'), findsOneWidget);
    expect(find.text('精神食欲正常，先调整作息看看。'), findsOneWidget);

    // 建议打卡：直接服务“有效解决次数”北极星指标。
    await tester.ensureVisible(find.text('我做了').first);
    await tester.tap(find.text('我做了').first);
    await tester.pumpAndSettle();
    expect(find.text('已完成'), findsOneWidget);
    final doneEvent = client.requests
        .where((r) => r.url.path == '/v1/analytics/event')
        .map((r) => jsonDecode(r.body) as Map<String, dynamic>)
        .firstWhere((e) => e['event_name'] == 'suggestion_mark_done');
    expect((doneEvent['payload'] as Map)['suggestion_id'], 's_night_01');

    // 工具区默认折叠。
    expect(find.text('省力工具（可选）'), findsOneWidget);
    expect(find.text('优先可控可重复的玩具'), findsNothing);

    final shownEvents = _eventNames(client);
    expect(shownEvents, contains('followup_question_shown'));

    final toolsTile = find.widgetWithText(ExpansionTile, '省力工具（可选）');
    await tester.ensureVisible(toolsTile);
    await tester.tap(toolsTile);
    await tester.pumpAndSettle();

    expect(find.text('• 优先可控可重复的玩具'), findsOneWidget);
    expect(find.text('逗猫棒'), findsOneWidget);
    expect(_eventNames(client), contains('tools_section_expanded'));

    await tester.ensureVisible(find.text('是'));
    await tester.tap(find.text('是'));
    await tester.pumpAndSettle();

    expect(find.text('已记录，谢谢～'), findsOneWidget);
    final answered = client.requests
        .where((r) => r.url.path == '/v1/analytics/event')
        .map((r) => jsonDecode(r.body) as Map<String, dynamic>)
        .firstWhere((e) => e['event_name'] == 'followup_question_answered');
    expect((answered['payload'] as Map)['question_id'], 'q_night_01');
    expect((answered['payload'] as Map)['answer_value'], 'yes');
  });
}

List<String> _eventNames(_ComposedClient client) {
  return client.requests
      .where((r) => r.url.path == '/v1/analytics/event')
      .map((r) =>
          (jsonDecode(r.body) as Map<String, dynamic>)['event_name'].toString())
      .toList();
}

class _ComposedClient extends http.BaseClient {
  final List<http.Request> requests = [];

  static const Map<String, dynamic> _composed = {
    'request_id': 'req_compose',
    'content_version': 2,
    'schema_version': '1.0',
    'model_version': 'stub',
    'degraded': false,
    'inference_latency_ms': 12,
    'primary_intent': {'code': 'PLAY', 'label': '想玩/精力过剩', 'confidence': 0.72},
    'explanations': [
      {'factor': 'CONTEXT', 'text': '发生在夜间时段，较常与精力未消耗有关'},
    ],
    'followup_question': {
      'id': 'q_night_01',
      'text': '通常发生在你关灯后 0-30 分钟内吗？',
      'type': 'single_choice',
      'options': [
        {'value': 'yes', 'label': '是'},
        {'value': 'no', 'label': '否'},
      ],
    },
    'suggestions': [
      {
        'id': 's_night_01',
        'title': '睡前小仪式',
        'steps': ['逗猫棒 5-10 分钟', '给一点奖励'],
        'expected_window_hours': 24,
        'retest_tip': '明晚同时间段再测',
      },
      {
        'id': 's_night_02',
        'title': '避免把叫训练成按钮',
        'steps': ['不要立刻喂食'],
        'expected_window_hours': 72,
        'retest_tip': '观察 72 小时',
      },
    ],
    'risk_level': {'level': 'green', 'message': '精神食欲正常，先调整作息看看。'},
    'optional_tools_section': {
      'collapsed_by_default': true,
      'content_blocks': [
        {
          'type': 'guide',
          'title': '避坑采购指南',
          'bullets': ['优先可控可重复的玩具'],
        },
        {
          'type': 'efficiency_list',
          'title': '省力工具（非必需）',
          'items': [
            {
              'sku_key': 'wand_toy_basic',
              'name': '逗猫棒',
              'reason': '改善夜叫',
              'buy_link': null
            },
          ],
        },
      ],
    },
    'share_asset': {
      'share_title': '测一测我家猫在想啥',
      'share_text_template': '我家猫这次更像：{label}（{confidence}%）。喵懂 #喵懂 #喵测',
      'card_style': 'result_card_v1',
    },
  };

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final typed = request as http.Request;
    requests.add(typed);

    Map<String, dynamic> body;
    if (typed.url.path == '/v1/inference') {
      body = _composed;
    } else {
      // analytics / feedback / retest / template 都返回成功占位
      body = const {'ok': true};
    }

    return http.StreamedResponse(
      Stream.value(utf8.encode(jsonEncode(body))),
      200,
      headers: const {'content-type': 'application/json'},
    );
  }
}
