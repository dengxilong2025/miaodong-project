import 'package:flutter_test/flutter_test.dart';

import 'package:miaodong_mobile/app.dart';

void main() {
  testWidgets('app renders', (tester) async {
    await tester.pumpWidget(const MiaodongApp());
    expect(find.text('喵懂 · 喵测'), findsOneWidget);
  });
}

