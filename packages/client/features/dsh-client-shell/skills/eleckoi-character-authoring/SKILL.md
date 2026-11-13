---
name: eleckoi-character-authoring
description: 在 ElecKoi 创作工作室新建或修改角色资料、开场白、设定、变量、后台脚本、按钮面板或配置版本时使用；先检查已保存数据和当前范围。楼层界面、独立项目和资产按任务加载对应技能。
---

# 角色卡创作

使用当前 Session 选择的角色。创建新角色使用 character.create；共享全局配置必须明确 target，预设提示词通过 presetPrompts 只读。工作区编程负责制作文件，产品配置经创作能力保存。

1. 先 eleckoi_list_toolsets 找领域，eleckoi_describe_toolset 查所需 operation_ids、include_schema=true。
2. 用该领域的 list/read 读取准确编号、完整原稿和修订；目录不等于正文。
3. 只提交用户要求的修改，按 schema 携带该范围修订。片段改写优先 settings.edit；命名版本和普通条目使用各自入口。
4. 保存后按实际回执核对。溢出沿 eleckoi_call_capability 的 result 续读，不再执行原写入。

修改配置前读取 `references/configurations.md` 中的对应领域；需要原生脚本、按钮或 SDK 时再读取 `references/author-sdk.md`，按需查询 `references/author-sdk-reference.md`。通过 Host 文件读取工具访问这些随包文件，不假定当前工作区是 ElecKoi 源码，也不用 shell 直接读取 app.asar。

常规角色卡保留聊天楼层：正则将标记或文本转换成楼层 HTML，正文也可直接包含 HTML，使用 eleckoi-message-frontends。后台脚本可配套维护变量、监听事件、注册按钮和打开面板；按需读作者 SDK，不因此创建独立项目。需要自定义整套内容区交互结构时才使用 eleckoi-character-frontends。导入或整理素材用 eleckoi-character-assets，参考按任务读取。
