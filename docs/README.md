# ElecKoi Desktop 文档

本目录区分当前开发规范、插件教程、架构决策和历史资料。实现以仓库锁定版本的 DSH 官方源码为基准，ADR 说明决策原因，不替代当前接口合同。

- [创作工具与知识分层](CREATOR_AUTHORING_DESIGN.md)：按需技能、实时参数与文档分发。
- [角色资产创作](plugins/character-assets.md)与[角色界面创作](plugins/character-frontends.md)：资产操作、常规楼层的正则 HTML 与脚本协作，以及专用独立项目。

## 当前架构

- [联网搜索与网页抓取](WEB_SEARCH.md)：配置 DeepSeek Search、Fetch、独立密钥及原有提供商。

- [统一编辑器与完整配置版本](adr/0037-editor-collections-and-versions.md)：主界面多选、管理弹窗与版本数据合同。
- [聊天运行状态存储](adr/0038-conversation-runtime-state.md)：变量和分支设定的历史边界、回退及单文件归档。

- [EJS 归入正则替换](adr/0036-ejs-display-templates.md)：正则替换中的 EJS、数据范围和执行时机；[使用教程](plugins/regex-ejs.md)。

- [Android 更新检查](adr/0035-android-update-checks.md)：应用身份、平台发布识别、后台通知和原生壳边界。

- [生成图片随记录删除](adr/0034-generated-image-record-cleanup.md)：聊天删除、角色删除和重新生成对应的文件清理。

- [原生脚本库与作者 SDK](adr/0032-native-script-libraries.md)：三类脚本、作者规则和前端交互的数据与运行合同。
- [导入格式与原生数据存储](adr/0033-native-format-import-storage.md)：格式转换、原生数据归属与 MVU 导入提示。
- [工作区包职责分组](adr/0030-package-responsibility-groups.md)：Client、Host、公共合同和示例的位置。
- [Android 本地 Node Host](adr/0031-android-local-node-host.md)：平台入口、独立运行环境与构建边界。

- [运行期请求预览与写入放大](adr/0029-ephemeral-request-context-preview.md)：实际请求、内存共享、预览入口与增长回归约束。

- [DSH 官方客户端架构基准](DSH_DESKTOP_ARCHITECTURE.md)：Host、Client、桌面壳及上游版本边界。
- [产品数据库](DATABASE.md)：数据所有权、结构与迁移。
- [失败契约](error-contract.md)：失败码、每条码的详情参数、用户文案通道与四条契约规则；由码表生成。
- [错误处理协作声明](error-handling.md)：新增失败怎么写、用户可见文案在哪产生、加码与日志动作的顺序；`pnpm check:error-contract` 守四条规则。
- [报告投递端点配置](bug-report-endpoint.md)：报告往哪投、内置配置在哪、四个题目名契约、`/form/` 的坑与换 Base 步骤。
- [插件归属与接入清单](DSH_PLUGIN_MIGRATION.md)：内置能力的归属与公开接入点。

## 插件开发

从 [插件开发文档](plugins/README.md) 开始；第一次写插件先看 [快速入门](plugins/quick-start.md)。查询能力时使用 [接口总表](plugins/api-reference.md)，跨 Host/Client 调用见 [Remote](plugins/remote.md)。

接口总表是 bundle manifest 的导航目录；[Client](plugins/api-client.md)、[Host](plugins/api-host.md)、[Remote](plugins/api-remote.md) 的完整调用参考和数据类型使用锁定 DSH 官方生成器从公开源码生成。数量、成员和参数不能另行手工维护。

- [原生作者 SDK](plugins/author-sdk.html)：开发教程与可搜索接口参考；[仓库教程](plugins/author-sdk.md)和[可运行示例](../packages/examples/native-author/README.md)使用同一合同。
- [格式导入边界](plugins/sdk-compatibility.md)：外部资料转换为原生数据，不提供外部脚本运行环境。
- [角色资产库](ASSET_LIBRARY.md)：本地存储、固定引用、前端职责与自动打包。
- [角色卡传输格式](CHARACTER_CARD_TRANSFER.md)与[预设传输格式](AGENT_PRESET_TRANSFER.md)。

## 决策与历史

- [多应用工作区目录](adr/0028-multi-application-workspace.md)：桌面壳、Host、Web Client、共享包与后续 Android 工程的归属。

- [架构决策索引](adr/README.md)：按编号查看决定、状态与替代关系。
- [官方 ChatView 与角色消息座位](adr/0024-official-chat-view-roleplay-seats.md)：消息呈现、官方滚动与输入区布局边界。
- [同一 Session 复用已有用户事件重新生成](adr/0025-same-session-existing-input-regeneration.md)：重新生成、编辑、轨迹与轮次统计的身份规则。
- [历史资料](history/README.md)：旧架构说明，不作为当前实现指南。

## 文档维护

- [创作内容与运行边界](CONTENT_BOUNDARIES.md)：内容、批量导入、完整读取及外部合同的范围。

- [测试与日常验证](TESTING.md)：测试分组、并发、目录归属及扩大验证的条件。

- [v0.3.0 发布说明](releases/v0.3.0.md)
- [v0.2.20 发布说明](releases/v0.2.20.md)
- [v0.2.19 发布说明](releases/v0.2.19.md)
- [v0.2.18 发布说明](releases/v0.2.18.md)
- [v0.2.17 发布说明](releases/v0.2.17.md)
- [v0.2.16 发布说明](releases/v0.2.16.md)
- [v0.2.14 发布说明](releases/v0.2.14.md)
- [v0.2.13 发布说明](releases/v0.2.13.md)
- [v0.2.12 发布说明](releases/v0.2.12.md)
- [v0.2.11 发布说明](releases/v0.2.11.md)
- [v0.2.10 发布说明](releases/v0.2.10.md)
- [v0.2.9 发布说明](releases/v0.2.9.md)
- [v0.2.8 发布说明](releases/v0.2.8.md)
- [v0.2.7 发布说明](releases/v0.2.7.md)

新增、改名、归档和同步规则见 [文档维护约定](MAINTENANCE.md)。运行 `pnpm check:docs` 检查本地链接、ADR 编号、标题和索引；接口总表由 `pnpm check:plugin-docs` 单独校验。

## 公开课题与产品截图

- [AI 角色扮演开发难题](open-problems/README.md)
- [Open development questions](open-problems/README.en.md)
- 正式截图放在 `screenshots/`，供仓库产品介绍引用。
