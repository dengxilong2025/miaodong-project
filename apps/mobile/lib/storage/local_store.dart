import 'package:shared_preferences/shared_preferences.dart';

class LocalStore {
  static const _kUserId = 'user_id';
  static const _kToken = 'token';

  Future<String?> getString(String key) async {
    final prefs = await SharedPreferences.getInstance();
    final v = prefs.getString(key);
    if (v == null || v.isEmpty) return null;
    return v;
  }

  Future<void> setString(String key, String value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(key, value);
  }

  Future<bool?> getBool(String key) async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(key);
  }

  Future<void> setBool(String key, bool value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(key, value);
  }

  Future<String?> getUserId() async {
    return getString(_kUserId);
  }

  Future<String?> getToken() async {
    return getString(_kToken);
  }

  Future<void> setAuth({required String userId, required String token}) async {
    await setString(_kUserId, userId);
    await setString(_kToken, token);
  }

  Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_kUserId);
    await prefs.remove(_kToken);
  }
}
