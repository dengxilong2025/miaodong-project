import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:miaodong_mobile/api/api_client.dart';
import 'package:miaodong_mobile/inference/inference_client.dart';
import 'package:miaodong_mobile/storage/local_store.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('submitRetest posts baseline/current request ids to /v1/retest', () async {
    SharedPreferences.setMockInitialValues({});
    final fakeClient = _RecordingClient((request) async {
      return http.Response(
        jsonEncode({'ok': true}),
        200,
        headers: {'content-type': 'application/json'},
      );
    });
    final api = ApiClient(
      baseUrl: 'http://example.com',
      store: LocalStore(),
      client: fakeClient,
    );
    final inference = InferenceClient(api: api);

    final res = await inference.submitRetest(
      problemId: 'night_meow',
      baselineRequestId: 'req_old',
      currentRequestId: 'req_new',
    );

    expect(res['ok'], isTrue);
    expect(fakeClient.requests, hasLength(1));
    expect(fakeClient.requests.single.method, 'POST');
    expect(fakeClient.requests.single.url.path, '/v1/retest');
    expect(
      jsonDecode(fakeClient.requests.single.body),
      {
        'problem_id': 'night_meow',
        'baseline_request_id': 'req_old',
        'current_request_id': 'req_new',
      },
    );
  });
}

class _RecordingClient extends http.BaseClient {
  _RecordingClient(this._handler);

  final Future<http.Response> Function(http.Request request) _handler;
  final List<http.Request> requests = [];

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final typed = request as http.Request;
    requests.add(typed);
    final response = await _handler(typed);
    return http.StreamedResponse(
      Stream.value(utf8.encode(response.body)),
      response.statusCode,
      headers: response.headers,
      reasonPhrase: response.reasonPhrase,
    );
  }
}
