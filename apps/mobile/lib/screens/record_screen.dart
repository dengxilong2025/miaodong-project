import 'package:flutter/material.dart';

class RecordScreen extends StatelessWidget {
  const RecordScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('录音（占位）'),
      ),
      body: const SafeArea(
        child: Padding(
          padding: EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '这里是录音页（4.2 会实现）',
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18),
              ),
              SizedBox(height: 10),
              Text('下一步将支持：'),
              SizedBox(height: 6),
              Text('• 最多 10 秒录音'),
              Text('• m4a 优先'),
              Text('• 调 /v1/audio/upload-url 获取直传地址'),
              Text('• 上传成功获得 audio_id'),
            ],
          ),
        ),
      ),
    );
  }
}

