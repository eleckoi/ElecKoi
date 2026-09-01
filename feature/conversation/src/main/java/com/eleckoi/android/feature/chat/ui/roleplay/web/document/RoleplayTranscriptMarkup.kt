package com.eleckoi.android.feature.chat.ui.roleplay.web.document

internal val RoleplayTranscriptMarkupStart = """
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <script src="/asset/web-runtime/showdown-2.1.0.min.js"></script>
  <script src="/asset/web-runtime/dompurify-3.3.2.min.js"></script>
  <script src="/asset/web-runtime/tanstack-virtual-core-3.17.8.min.js"></script>
  <style>"""

internal val RoleplayTranscriptMarkupMiddle = """</style>
</head>
<body>
  <div id="top-spacer"></div>
  <main id="turns"></main>
  <div id="empty">还没有消息</div>
  <div id="bottom-spacer"></div>
  <div id="content-tail-gap" aria-hidden="true"></div>
  <div id="image-menu" class="image-menu" hidden></div>
  <script>"""

internal val RoleplayTranscriptMarkupEnd = """</script>
</body>
</html>
"""
