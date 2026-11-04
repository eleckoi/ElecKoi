# 从「创建你的插件」开始

PC 左侧导航和 Android 主侧栏「更多」中的「创建你的插件」沿用 DSH `0.2.1-rc.5` 的官方入口。它打开或复用所选工作区中的空白 Session，选择官方创造模式（预设 ID 为 `cordis`），把对应区域的插件创建请求加入输入草稿；已有文字、引用和附件保留，请求另起一段追加。点击入口不会发送消息，用户审阅后才提交。

其下的「进入工作区界面」是 ElecKoi 的工作区入口，直接沿官方 Workspace 新会话导航进入带工作区的页面，同样选择 `cordis`，但不准备插件创建提示词、不发送消息。可复用空会话中的既有草稿沿官方规则保留。

## 官方已经内置什么

创造模式的 `skill-filesystem` 指向随 `@deepseek-ai/dsh-agent-preset` 分发的技能目录，其中包含 `cordis-plugin-development`、`cordis-composition-reference`、`editing-cordis-compositions`，以及插件、界面与 MCP 的参考资料和模板。技能目录的描述进入模型上下文，正文和参考文件按需读取，并非把整套文档全部塞进每次请求。

模型通过 `cordis_inspect_list` / `cordis_inspect_query` 查询当前 Host 服务、事件、工具、Config 和已连接 Client 的 Slots 等真实合同，再通过普通工作区文件编写 bundle，经官方 Plugin Manager 安装、启停和验证。创造模式并不是另一套独立的插件脚手架页面。

锁定版本的原文与实现：

- [创建入口及草稿行为](https://github.com/deepseek-ai/deepseek-harness/blob/b830ec950faba0a46dda564be3e2d854afed94f1/packages/client/ui-entry-customization/README.zh.md)
- [创造模式组合](https://github.com/deepseek-ai/deepseek-harness/blob/b830ec950faba0a46dda564be3e2d854afed94f1/packages/bundle/web-app/presets/cordis.patch.yml)
- [插件开发技能及参考目录](https://github.com/deepseek-ai/deepseek-harness/tree/b830ec950faba0a46dda564be3e2d854afed94f1/packages/preset/agent-preset/skills/cordis-plugin-development)
- [只读运行时接口查询](https://github.com/deepseek-ai/deepseek-harness/blob/b830ec950faba0a46dda564be3e2d854afed94f1/packages/extensions/tool-cordis/README.zh.md)

## ElecKoi 补充什么

`@eleckoi/dsh-runtime` 通过官方 `dsh-skill-filesystem` 注册独立的 `eleckoi-plugin-development` provider，资源位于随包分发的 `@eleckoi/dsh-client-shell/skills/`。官方开发技能和模板保持原样，产品补充以新的技能名称加入同一技能目录。

该技能指导模型读取 ElecKoi 的公开 Slots、Client/Host 服务、Remote 声明、产品数据边界、安装与验收文档。它引用的 `references/` 由本目录全部 Markdown 文档生成；`pnpm generate:plugin-docs` 同步资源，`pnpm check:plugin-docs` 检查逐文件一致性，避免维护另一套手写文档。安装版无需用户额外提供 ElecKoi 源码仓库。

这些资料供模型按需读取，不改写官方预设、不复制官方开发技能、不增加 AI 工具、不提升权限。创建草稿时不会自动把整套文档追加进 Session；模型调用技能或文件读取后，结果沿官方工具日志记录。目录中的源码相对链接供源码开发使用；安装环境应查询实际接口并读取包导出的声明。

## 会话与界面边界

PC 原有左侧图标导航栏始终固定，包括进入插件创造、收起侧栏及窄窗口。插件创造只替换图标栏右边的二级侧栏，显示官方新会话、工作区与会话列表、搜索、管理；主导航入口和底部资料／设置不再重复到工作区侧栏。收起操作只隐藏工作区侧栏，左侧导航保留。产品壳使用官方公开的 Client 入口与插槽注册合同装配，不重复声明同名子插槽。Android 主导航抽屉保留产品入口；工作区顶栏的列表按钮单独打开管理工作区与会话的官方侧栏，复用同一专用会话过滤。返回与列表按钮位于官方标题栏前部，不叠加额外的「对话」页头；窄屏输入控件沿用官方布局。编程 Session 的提交走官方流程；只有角色聊天目录明确拥有的 Session 才执行 ElecKoi 角色发送前置准备。

工作区顶部按官方 Windows 布局分行：侧栏开关、应用与编辑位于 caption，品牌与新会话在其下。Windows 侧栏标记只在该界面挂载时启用并在退出时恢复，菜单始终只有一处；不会替换产品固定导航或普通角色页面顶栏。

权限选择保留官方的「仅可查看」「工作区内修改」「完全权限」三项，默认「工作区内修改」。具体审批和沙箱由官方权限服务执行；模型和插件不得自行切换权限。已有用户设置与历史权限记录不在本功能中改写。

插件工作区只呈现普通编程 Session。角色扮演目录中的正式 `runtimeSessionId`、工作室的 `eleckoiCreatorStudio` 投影、已注册的产品专用预设及其正式父子关系用于排除专用会话；不按标题、目录名或 Session ID 前缀猜测。该范围覆盖工作区分组、未分组、平铺、搜索与操作入口；归属尚未加载时不先暴露未知会话。正文搜索默认沿官方关闭状态，在启用该能力的部署中同样过滤结果。原官方全局 Session 目录、产品目录、分组注册和历史保持原数据来源，不迁移或重新归组。新建编程会话显式使用 `cordis` 预设，避免复用产品专用空会话。

PC 从工作区返回角色对话时，经官方 `uiWorkspace.openSession` 切换唯一的前台 `mainView`；角色正文保留自己的展示引用，不另争用前台身份。产品壳根据正式角色目录把该会话显示在角色页面，右侧栏随同一前台切换。此导航不改变工作区成员、角色记录或历史内容，也不使角色对话成为工作区可操作的列表项。
