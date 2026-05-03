import 'package:flutter_test/flutter_test.dart';
import 'package:miaodong_mobile/retest/retest_store.dart';
import 'package:miaodong_mobile/storage/local_store.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('LocalStore string helpers', () {
    test('setString/getString round trip', () async {
      SharedPreferences.setMockInitialValues({});
      final store = LocalStore();

      await store.setString('custom_key', 'custom_value');

      expect(await store.getString('custom_key'), 'custom_value');
    });
  });

  group('RetestStore', () {
    test('saves and reads baseline by problemId', () async {
      SharedPreferences.setMockInitialValues({});
      final store = RetestStore(store: LocalStore());
      final baseline = RetestBaseline(
        problemId: 'night_meow',
        requestId: 'req_old',
        label: '夜间嚎叫',
        confidence: 0.82,
        createdAtIso: '2026-04-27T08:30:00.000Z',
      );

      await store.saveBaseline(baseline);

      final loaded = await store.getBaseline('night_meow');
      expect(loaded, isNotNull);
      expect(loaded!.problemId, 'night_meow');
      expect(loaded.requestId, 'req_old');
      expect(loaded.label, '夜间嚎叫');
      expect(loaded.confidence, closeTo(0.82, 0.0001));
      expect(loaded.createdAtIso, '2026-04-27T08:30:00.000Z');
    });

    test('first retest achievement is locked by default and can be unlocked', () async {
      SharedPreferences.setMockInitialValues({});
      final store = RetestStore(store: LocalStore());

      expect(await store.isFirstRetestUnlocked(), isFalse);

      await store.unlockFirstRetest();

      expect(await store.isFirstRetestUnlocked(), isTrue);
    });
  });
}
