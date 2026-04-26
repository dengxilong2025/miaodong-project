import 'dart:io' show Platform;

import 'package:flutter/material.dart';

import 'api/api_client.dart';
import 'screens/home_screen.dart';
import 'screens/me_screen.dart';
import 'screens/problems_screen.dart';
import 'storage/local_store.dart';

class MiaodongApp extends StatelessWidget {
  const MiaodongApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '喵懂',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorSchemeSeed: const Color(0xFFFF8FB1),
      ),
      home: const AppShell(),
    );
  }
}

class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _index = 0;

  late final LocalStore _store = LocalStore();
  late final ApiClient _api = ApiClient(
    baseUrl: _defaultBaseUrl(),
    store: _store,
  );

  String _defaultBaseUrl() {
    // 开发期默认地址（本地 API 服务）
    // Android 模拟器访问宿主机需用 10.0.2.2
    if (Platform.isAndroid) return 'http://10.0.2.2:8080';
    return 'http://127.0.0.1:8080';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _index,
        children: [
          HomeScreen(api: _api),
          ProblemsScreen(api: _api),
          MeScreen(api: _api, store: _store),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (v) => setState(() => _index = v),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.mic_rounded), label: '喵测'),
          NavigationDestination(icon: Icon(Icons.list_alt_rounded), label: '问题库'),
          NavigationDestination(icon: Icon(Icons.person_rounded), label: '我的'),
        ],
      ),
    );
  }
}

