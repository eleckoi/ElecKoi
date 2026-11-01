# Desktop 产品数据库

本文记录当前 ElecKoi SQLite 基线及其所有权。DSH 已有正式存储合同的领域不在该数据库维护第二份数据：模型与联网搜索配置使用 settings/profile/credentials，聊天正文与运行轨迹使用 Session 日志，bundle 选择使用 profile。

## 所有者与位置

- 唯一所有者：DSH Host 插件 `@eleckoi/dsh-product-data`。
- 数据库文件：Electron `userData/eleckoi-common.sqlite3`，路径由桌面壳作为 Host 启动参数传入。
- SQLite 打开、迁移、恢复和所有 Repository 写入均位于 `packages/host/product-data/src`。Electron Main、Client 和 Renderer 不打开数据库。
- 公共 SQL：`apps/desktop/resources/database/eleckoi-common-schema-v1.sql`。
- 当前 `PRAGMA user_version`：`13`。
- 当前结构：49 张业务表、2 个视图；数据库物理结构版本只使用 SQLite `PRAGMA user_version`。

应用版本与 schema 之间没有代码关联：`CURRENT_SCHEMA_VERSION` 变了必须同时提升 `package.json` 的 `version`，否则同一版本号会发出两份不同的库结构——装过新库的用户回退到旧包时，旧程序会拒绝启动（`eleckoi/db/schema-mismatch`）。发版前按实际打出去的 schema 核对一次版本号（PR 模板里有这条勾选）。

`pnpm db:generate` 从固定 SQL 生成内嵌迁移 SQL与 Drizzle 查询映射；`pnpm check:database-schema` 校验生成内容。SQL 是公共结构权威，Drizzle 映射不反向生成迁移。

公开数据库 v11 到 v12 的迁移统一建立显示模板、完整编辑器版本、正则整体启停与聊天历史状态存储，并原子整理已移除的快捷命令正则目标：混合目标保留其他目标；仅有该目标的规则停用，保留原始名称、表达式与替换文本。当前全局、角色、预设规则及预设历史版本使用同一正式目标集合。无效的回复规则快照列删除，当前显示规则仍即时作用于 Session 正文。

推理正则的显示结果只保存在 Client/Host 显示投影中，原始思考文本仍来自 Session。提示词规则仅处理本轮后续模型请求中的推理文本副本，旧轮次保持用户输入与角色最终正文。无选定目标的旧规则不自动归入 AI 回复；携带不透明模型回放数据的推理不能改写后沿用回放信息，实际发生替换时明确失败，显示正则仍可使用。

本批未发布改动统一并入 v12→v13：角色的多开场白迁到 `character_openings`，每个角色只有一份开场白列表、默认开场白编号和整体启停。每条开场白保存标题、正文、变量绑定及初始变量，不存在独立开场白版本。当前默认开场白保持，原设定库各快照中的不同开场白并入同一列表；同编号但正文或绑定不同的条目分配新编号完整保留。迁移后删除设定库中的开场白内容及关联、`character_text_contents` 中的旧开场正文和 `characters.showOpening` 冗余列。聊天中已选开场白、聊天变量和 Session 日志不修改。

开场白提取由 [`characterOpenings.ts`](../packages/host/product-data/src/storage/sqlite/migrations/characterOpenings.ts) 在 v12→v13 的同一事务执行，不增加 v14 迁移支线。只有正式停止支持 v12 及更早数据库直接升级后，才可连同 0013 调用和旧库回归删除；单台设备完成整理不构成清理条件。开发库直接整理到此 v13 基线，正常运行只维护当前多开场白列表结构。

## 数据边界

全局设定库独立保存在 `global_setting_libraries`，每个库拥有自己的内容、文件夹、启停和删除状态；`global_setting_library_state` 只记录并发修改标识，不是命名版本。角色设定库的管理、版本切换、导出、复制与删除不会改动全局库。当前未发布结构仍并入 v12→v13，开发库通过备份后的单次原子补齐保留所有已有记录，不增加启动兼容支线。

启用的全局库以明确的库编号映射到聊天运行时，通过 `全局设定库/库名/条目` 虚拟路径沿用现有设定读取、关键词与 EJS 规则。聊天只读这些共享资源；角色分支设定不会保存全局内容，全局库通过导入已有角色设定或转换本地世界书获得，界面提供整库启停、删除，并通过共用设定编辑器修改导入库的条目、文件夹与 EJS 配置；编辑不会回写来源角色，内容使用独立 Remote 保存入口。

| 数据 | 权威存储 |
| --- | --- |
| 角色、角色卡文本、用户资料 | SQLite；媒体字段保存 `eleckoi-media://` 引用，文件位于产品媒体目录 |
| 角色多开场白 | SQLite `character_openings`；一份列表及默认选择，与设定库版本无关联 |
| 设定库、变量配置与状态、正则、Agent 预设 | SQLite |
| 全局、角色、预设脚本的归属、列表、启停与设置 | SQLite；源码仅保存为 `author-scripts` 目录内的 `.js` 文件，库中只记录文件引用与修改标识 |
| 聊天目录、角色快照、关系索引、说话者、轮次与最终回复关系 | SQLite |
| 聊天正文、推理、工具调用、工具结果与 Provider replay state | DSH Session 日志 |
| 用户输入、工具结果和生图消息中的图片引用 | DSH Session 正式附件字段；文件由附件存储管理，回复表不保存图片 |
| 当前聊天变量、聊天内设定差异 | SQLite `chat_session_variable_states`、`conversation_setting_changes` |
| 每轮生成前／成功完成后的变量和聊天设定差异 | SQLite `conversation_state_snapshots`，按聊天、分支、Session、边界类型与阶段标识 |
| 模型提供商、模型 profile、API Key | DSH settings/profile/credentials |
| Tavily 设置与 API Key | DSH settings/credentials |
| 创作项目 | 用户工作区目录；SQLite 只保存当前需要的产品索引 |
| 显示偏好与聊天选择 | DSH settings；旧 `desktop_preferences` 在 v6 直接删除，不迁移 |

## 与 DSH Storage 的关系

当前产品数据库没有挂载 `@deepseek-ai/dsh-storage-sqlite`。该官方包是 Host 侧文档型 KV 后端，每个键对应一行 JSON；`@deepseek-ai/dsh-storage-domain` 在其上提供 schema 校验、写入串行化和 `domain/changed` 事件。它适合简单、独立、按键读写的领域状态。

ElecKoi 当前 49 张产品表需要关系、外键、排序、搜索、跨表事务和从 v1 连续迁移到当前版本。锁定版本的 DSH Storage 不提供二级索引、跨表事务或自动迁移，因此不替代这套关系型产品库。两者遵守同一所有权边界：只在 DSH Host 打开，Client 通过正式 Remote 调用；新增简单 KV 领域时先评估 `ctx.storageDomain`，新增关系型领域则进入本产品库并维护迁移链。聊天正文与轨迹仍由 DSH Session 持久化，查询索引由官方 `dsh-session-query-sqlite` 负责。

角色扮演的下一轮模型请求从 Session 投影：旧轮次只携带用户输入和角色最终正文，旧推理、工具过程与 Provider replay state 不再发送；当前轮次流程完整保留。该投影不会删除历史轨迹。编辑、删除、回退和重新生成保持同一聊天与 Session ID。

## 迁移链

迁移由 `packages/host/product-data/src/storage/sqlite/installSchema.ts` 在 Host 启动时原子执行：

1. v1：公共 SQL 基线。
2. v2：运行期结构整理。
3. v3：设定条目与版本引用整理。
4. v4：DSH Session/turn 绑定。
5. v5：删除废弃消息高度字段。
6. v6：删除已由 DSH 正式存储接管的模型与搜索配置表，并删除不再使用的 `generation_attempts`、`cleanup_operations`、`desktop_preferences` 与旧结构登记表 `desktop_schema`；旧设置不迁移，当前版本只以 `PRAGMA user_version` 标识。
7. v7：原子移除当前预设及其历史版本中的子 Agent 模型选择字段，并更新预设工具配置版本；子 Agent 模型授权只由 DSH Host 设置负责。
8. v8：原子删除 `chat_sessions.historyUserMessageCount` 冗余列，保留其他列、聊天标识、快照及全部有效产品关系；运行时不再写入该计数。开场白切换和编辑权限以 DSH Session 的真实用户输入、待处理输入与运行状态为准，不另存第二份用户历史判断。
9. v9：聊天保存所选开场白的变量版本编号，变量工具按该版本加载完整配置；从 v8 直接升级，旧聊天固定升级时的当前版本，保留初始值、当前值及消息。
10. v10：新增正式脚本库管理关系，保存全局、角色和预设的分组、按钮、设置、启停、源码文件引用与修改版本。角色和预设归属通过外键约束，源码正文不进入 SQLite；文件与管理关系一起提交，失败恢复原文件。
11. v11：预设和分组保存正式用途，角色扮演与创作分别保存全局选择。现有预设、分组及启用选择归为角色扮演，原编号、内容、历史版本和脚本归属不变；新增默认创作预设，仅启用创作能力。

12. v12：一次增加共享全局、角色与预设的独立 EJS显示模板库、`editor_library_versions`、`regex_libraries` 和 `conversation_state_snapshots`。正则整体启停按归属独立保存；旧库及旧正则命名版本的整体状态默认启用，原条目启停不变，已有未发布 v12 原子补齐。编辑器配置和当前版本原子保存，脚本源码版本仅持有不可变归档摘要引用。聊天变量与设定历史按正式边界统一入库，删除回复里的变量、正则快照列及旧设定历史表。归属和恢复规则见 [ADR 0037](adr/0037-editor-collections-and-versions.md)、[ADR 0038](adr/0038-conversation-runtime-state.md)。本批未发布结构统一收在 v11→v12 单步升级。

## 聊天状态与归档

新生成和聊天导入都使用 `conversation_state_snapshots`。生成前保存变量与聊天设定差异的 `before`；成功结束后，当前变量与 `after` 在同一数据库事务提交。一轮可以有多个模型请求和助手事件，完成历史仍只有一个轮次边界；工具工作文件不承担历史存储。

回退恢复该轮次开始前的变量和聊天内设定差异，删除该轮完成后的状态及后续轮次状态。重新生成失败会恢复操作前的 Session、产品状态和历史。角色卡基础设定、预设、正则和脚本的作者配置不跟随聊天回退。

`agent_responses` 仅保留旧消息的九个关系字段：`id`、`conversationId`、`turnId`、`responseIndex`、`speakerId`、`status`、`createdAt`、`runtimeThreadId`、`dshTurn`。新聊天及新导入不写回复账本；正文、执行轨迹和图片引用都属于 Session。`agent_turns.variableStateJson` 仍用于产品开场白及旧输入元数据，不用它推算新轮次历史。

数据库升级保留旧账本能明确关联轮次的状态。按用户决定丢弃缺少绑定或存在多份候选的旧回复历史，保留正文和回复关系；缺失楼层显示“无历史状态”，不阻断正常聊天。旧检查点文件退出支持，没有转存或自动删除代码。

聊天导出仍是一个 JSON 文件，内部包含产品关系、当前设定差异、状态历史和正式 Session 日志；导入时统一重映射聊天、分支和 Session 标识。归档版本为 2，与物理数据库版本 12 是不同概念。已知未发布 v12/v13/v14 的旧开发结构先精确校验，再原子整理到 v12 后进入 v13，正式升级链为 v11→v12→v13。

生成结果表的旧开发整理不占用正式迁移步骤。已运行过原开发 v9/v10 的数据库，启动时先核对全部结构，再原子删除该表并整理为当前结构；原开发 v9 补齐变量版本绑定，原开发 v10 保留已有绑定，不重新选择版本。未知结构拒绝修改，失败回滚，不清库。聊天保存只等待当前进程的工作，不保存或查询重启前的执行结果。


当前开发基线的全局与角色正则表使用 `optionsJson` 保存裁剪、深度范围和宏替换选项。缺少该字段的已知开发结构原子整理，保留已有规则，不新增业务表。独立扩展库及其读写服务已经撤除，不读取或搬运该库的数据，见 [ADR 0033](adr/0033-native-format-import-storage.md)。

脚本功能尚未实际使用，按用户确认直接采用当前文件结构，不保留旧脚本库转换或启动回退入口。现有 SQL 结构不变，不增加脚本源码迁移。角色卡导入仍把源码写入该角色的文件目录，自动保存归属。

脚本读取以实际 `.js` 文件为准。外部编辑造成源码变化时，读取更新修改标识，旧界面草稿不能覆盖已变更的源码。普通启停不重写未改变的源码。文件事务记录只用于当前操作失败和异常退出恢复，提交完成后释放，不是旧格式转换或另一份正常源码。数据库单文件备份不等于完整脚本备份，完整产品备份还须携带源码目录。

原生角色卡和预设的导出携带所属目录内的辅助模块及二进制资源；导入保留相对路径并自动关联新的所属对象，与脚本管理记录原子保存。入口正文不在附件里重复保存，辅助文件不进入 SQLite。角色或预设删除同样通过文件事务删除其所属文件；即使目录已编辑但尚未保存脚本管理记录，异常退出也按所属对象是否已提交删除恢复文件。全局脚本不随角色或预设删除。

较早开发构建创建的 v6 数据库在升级至 v7 前，先原子整理已废弃的执行、偏好与结构登记表，再执行 v6 → v7 迁移。仍有效的角色、预设、设定、变量与聊天索引数据保留，不要求清库。后续结构变化必须提升版本并追加连续迁移。

## 升级代码的清理条件

代码入口旁以 `TODO(迁移清理)` 标记等待退役的转换，下面按实际数据分别核对。客户端发布了新版本、某台机器已升级或本机扫描没有命中，都不能证明其他受支持的旧安装、未打开的聊天及备份已完成转换。当前没有宣布新的最低升级版本，以下入口均保留。

| 入口 | 何时可以清理 | 必须一起处理的范围 |
| --- | --- | --- |
| [SQLite v1 → v8 迁移链](../packages/host/product-data/src/storage/sqlite/installSchema.ts) | 正式停止支持某步骤起点及更早 schema 直接升级；剩余受支持版本仍有连续原子链 | 对应 `0002` 至 `0008` 步骤、旧表定义、import、登记与旧库 fixture；保留当前 SQL、版本常量及完整性校验 |
| [开发 v2、v6 同版本整理](../packages/host/product-data/src/storage/sqlite/installSchema.ts) | 分别停止支持对应开发基线直接升级 | 对应整理函数、专用入口和 fixture；v2 共享整理函数仍被 `0002` 使用时继续保留 |
| [模型设置 schema v0/v1 → v2](../packages/client/features/dsh-client-models/src/index.js) | 支持的升级和 profile 恢复入口均已保存至少 schema v2 的设置 | 旧 schema 转换、专用常量与用例；函数和启动调用须等两段整理均退役，保留当前设置合同和插件装配 |
| [旧子 Agent 占位路由](../packages/client/features/dsh-client-models/src/index.js) | 停止支持 v0.2.3 之前版本直升，且支持的 profile 恢复入口不再携带该路由 | 占位路由过滤、专用常量与用例；与模型设置 schema 转换分别核对 |
| [旧默认模型路由](../packages/client/features/dsh-client-roleplay/src/host/model-selection-migration.mjs) | 停止支持 v0.2.1 及更早版本直升，且支持的 profile 恢复入口不再携带旧路由 | 迁移函数、辅助函数、启动调用和旧路由用例；当前请求快照改为直接解析正式选择，保留每轮冻结与恢复后的模型刷新 |
| [旧实体化预设 ID](../packages/client/features/dsh-client-roleplay/src/host/agent-preset-bridge.mjs) | 支持恢复的 Session、快照和导入记录均已持久选择 `eleckoi-active`，且对应旧版本直升已退役 | 旧声明注册、别名、目录扫描、分支与用例；保留当前预设注册、重组和恢复服务 |
| [profile 内置 bundle 登记](../apps/desktop-host/src/desktopPluginBundles.ts)、[Tavily 首次选择](../apps/desktop-host/src/desktopPluginHost.ts) | 支持的升级和 profile 恢复入口分别已完成 `bundles-v5`、`tavily-bundle-v1` 登记 | 各自的一次性函数、调用及旧 profile 用例；保留新 profile 初始化和用户启停选择 |
| [请求上下文记录修复](../packages/host/runtime/src/sessionRequestContextRepair.ts) | 对应旧版本直升已退役，且支持的 Session 恢复和导入入口已有转换缺失可忽略标记的能力 | 修复模块、启动扫描、导出与专用用例；旧事件保留，新预览不落盘，见 [ADR 0029](adr/0029-ephemeral-request-context-preview.md) |
| [旧聊天独立输入补回](../packages/host/runtime/src/sessionHistoryRecovery.ts) | 对应旧聊天直升已退役，且支持的恢复和导入入口已把缺失输入写为正式 Session 消息 | 补回模块、归档读取、启动调用、导出与专用用例；保留逐会话错误隔离、投影重放、数据库状态历史和正常重新生成 |
| [已补回聊天的统计标记](../packages/client/features/dsh-client-roleplay/src/host/history-stats-projection.mjs) | 支持恢复的已迁移日志完成等价统计转换，重放结果保持正确 | 仅旧标记分支、专用状态与旧日志用例；保留当前已有输入续接的统计及投影登记 |
| [旧请求投影信封过滤](../packages/client/features/dsh-client-roleplay/src/host/conversation-context.mjs) | 支持恢复和导入的旧日志均已不含该插件消息 | 按正式插件来源标识排除旧信封；新请求仅在内存装配，不生产新信封 |
| [v3 → v4 系统开头补丁](adr/0026-legacy-session-system-head-migration.md) | 锁定上游的正式相邻迁移能通过同一组旧日志用例 | 版本补丁、`patchedDependencies` 登记和锁文件；保留官方格式目录与完整迁移链 |

删除恢复或迁移入口时只移除其专用用例；新建、重开、备份、完整性、当前模型请求、预设重组和重新生成等正常路径的验证继续保留。异常退出后的响应状态恢复是当前运行职责，仍由 [启动恢复](../packages/host/product-data/src/storage/sqlite/recoverInterruptedState.ts) 执行。

## 删除与文件

- 删除角色时级联删除其产品关系和聊天索引。
- 删除聊天或清空记录时，产品索引与对应 DSH Session 使用同一聊天标识处理，不创建分叉会话。
- 媒体文件由 Host 的 `LocalMediaStore` 写入；数据库只保存稳定媒体引用。Electron 的媒体协议只负责只读响应。
- 不再使用数据库清理任务表。DSH Session 文件生命周期交给正式 Session API，产品媒体删除由拥有该文件的 Host 操作在业务事务边界内执行。

## 验证

- `pnpm check:database-schema`：49 张公共表、2 个视图与生成文件一致。
- `pnpm test`：覆盖 v1 至 v13 迁移、未发布开发库整理、失败回滚、外键、重启持久化、角色与媒体、设定、变量、正则、预设、脚本库、聊天索引和 Remote 写入。
- `pnpm rebuild:electron && pnpm check:electron-sqlite`：使用 Electron 的真实原生 SQLite ABI 创建公共结构，核对 49 张业务表、2 个视图、`user_version = 13`、冗余列缺失、外键和完整性。

架构决策见 [ADR 0018](adr/0018-dsh-host-owns-product-data.md)。

数据库 v12→v13 删除独立显示模板表及其编辑器版本，并将角色多开场白提取为独立存储；正则与脚本版本逐行保留。旧模板不转换为正则，运行时不提供旧配置读写入口。历史升级步骤保留以支持受支持数据库连续升级。
