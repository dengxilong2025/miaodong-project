import 'package:flutter_test/flutter_test.dart';
import 'package:miaodong_mobile/screens/result_screen.dart';

void main() {
  group('share text helpers', () {
    test('falls back to default template with unknown label and missing confidence', () {
      final text = buildShareTextFromTemplate(
        template: defaultShareTemplate,
        label: null,
        confidencePercent: null,
      );

      expect(text, '我家猫这次更像：未知（-%）。来喵懂试试 #喵懂 #喵测');
    });

    test('replaces variables and appends hashtags when missing', () {
      final text = buildShareTextFromTemplate(
        template: '我家猫这次更像：{label}（{confidence}%）。快来测测',
        label: '夜间嚎叫',
        confidencePercent: 87,
      );

      expect(text, '我家猫这次更像：夜间嚎叫（87%）。快来测测 #喵懂 #喵测');
    });

    test('keeps hashtags when template already contains them', () {
      final text = buildShareTextFromTemplate(
        template: '结果：{label} {confidence}% #喵懂 #喵测',
        label: '持续叫',
        confidencePercent: 91,
      );

      expect(text, '结果：持续叫 91% #喵懂 #喵测');
    });

    test('converts confidence number to integer percent', () {
      expect(formatConfidencePercent(0.876), 88);
      expect(formatConfidencePercent(null), isNull);
    });
  });
}
