---
name: eleckoi-character-frontends
description: 在 ElecKoi 制作、导入、修改或导出自定义整套角色聊天内容区交互的独立 HTML／ZIP 项目时使用，例如接入 AI 的网页游戏或模拟系统。常规楼层美化和状态栏使用 eleckoi-message-frontends，脚本按钮弹窗使用角色创作技能。
---

# 角色独立前端项目

先读 `references/frontends.md` 的独立前端项目部分。只有任务或现有工程需要自定义整套内容区交互结构时才采用此项目入口；常规角色卡沿聊天楼层实现，后台脚本可以配套按钮和面板。代码量、游戏机制、外部页面文件和弹窗本身都不能作为选择独立项目的依据。

项目接管角色聊天内容区，可使用自己的控件并通过 SDK 直接发送操作；当前仍保留宿主输入框和应用外壳，底层聊天与消息继续使用正式服务。常规楼层界面使用 eleckoi-message-frontends，脚本功能使用 eleckoi-character-authoring。

1. frontends.list/read_file 获取当前角色项目、文件和修订。
2. 在工作区编写 HTML／JS／CSS；通过 import_file 或 import 导入项目，默认作为未启用草稿。
3. 修改用 write_files/update，保留未提交文件；清单与入口使用正式参数。所有写入用最新工作区 expectedRevision。
4. 按用户意图 select 指定项目，select(null) 恢复默认内容区；移除项目不删除角色资产库。

角色项目使用明确 HTML 入口和 scope=character；目前绑定仅支持聊天 root。SDK 必须声明并等待 ElecKoiReady。实现消息、变量、输入、生成或媒体功能前，按需读取 `references/author-sdk.md` 与 `references/author-sdk-reference.md`；没有实际聊天时，不能宣称配置预览已经完成聊天交互验收。

需要素材加载 eleckoi-character-assets，并按需读 `references/assets.md`。样式留在项目页面，不访问宿主 DOM 或直接改内部文件。通过 Host 文件读取工具访问随包参考。
