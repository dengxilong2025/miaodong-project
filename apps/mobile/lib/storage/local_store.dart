import 'package:shared_preferences/shared_preferences.dart';

class LocalStore {
  static const _kUserId = 'user_id';
  static const _kToken = 'token';

  Future<String?> getUserId() async {
    final prefs = await SharedPreferences.getInstance();
    final v = prefs.getString(_kUserId);
    if (v == null || v.isEmpty) return null;
    return v;
  }

  Future<String?> getToken() async {
    final prefs = await SharedPreferences.getInstance();
    final v = prefs.getString(_kToken);
    if (v == null || v.isEmpty) return null;
    return v;
  }

  Future<void> setAuth({required String userId, required String token}) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kUserId, userId);
    await prefs.setString(_kToken, token);
  }

  Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_kUserId);
    await prefs.remove(_kToken);
  }
}

