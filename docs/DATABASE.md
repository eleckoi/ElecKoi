# Desktop 产品数据库

本文记录当前 ElecKoi SQLite 基线及其所有权。DSH 已有正式存储合同的领域不在该数据库维护第二份数据：模型与联网搜索配置使用 settings/profile/credentials，聊天正文与运行轨迹使用 Session 日志，bundle 选择使用 profile。

## 所有者与位置

- 唯一所有者：DSH Host 插件 `@eleckoi/dsh-product-data`。
- 数据库文件：Electron `userData/eleckoi-common.sqlite3`，路径由桌面壳作为 Host 启动参数传入。
- SQLite 打开、迁移、恢复和所有 Repository 写入均位于 `packages/host/product-data/src`。Electron Main、Client 和 Renderer 不打开数据库。
- 公共 SQL：`apps/desktop/resources/database/eleckoi-common-schema-v1.sql`。
- 当前 `PRAGMA user_version`：`17`。
- 当前结构：49 张业务表、2 个视图；数据库物理结构版本只使用 SQLite `PRAGMA user_version`。

角色自定义聊天背景的保留配置存放在现有 `character_text_contents` 的 `chat-background-custom` 内容中，保存图片引用、透明度、模糊与遮罩。`characters.chatBackground` 继续表示当前生效的模式或图片；切到纯色、立绘或共享背景不会丢弃自定义配置。图片只使用原角色的 `chat-background` 媒体槽，不复制另一份文件；更换图片在事务提交后清理旧文件，失败回退，删除角色按原外键及媒体归属清理。已有自定义背景在读取／下一次保存时兼容，不增加物理结构或迁移。角色卡导入导出仍不携带本地背景偏好。

应用版本与 schema 之间没有代码关联：`CURRENT_SCHEMA_VERSION` 变了必须同时提升 `package.json` 的 `version`，否则同一版本号会发出两份不同的库结构——装过新库的用户回退到旧包时，旧程序会拒绝启动（`eleckoi/db/schema-mismatch`）。发版前按实际打出去的 schema 核对一次版本号（PR 模板里有这条勾选）。

应用 `0.2.21` 的数据库基线为 v17，增加变量来源身份的原子升级。v15→v16 只整理创作预设提示词的 JSON 语义，不新增表或视图；旧库沿现有连续链升级，不清库。

创作预设继续使用自有虚拟目录和同一条目存储，仅支持文字正文、提示词常驻及 Agent 读取的必读／选读。v15→v16 在同一事务内转换当前内容和全部保存版本：关键词选读变为普通选读并清除匹配配置；EJS 正文与引用条目保留源码，转成停用的文字条目，用户改成所需文字后再启用。普通文字、必读、常驻正文、编号、标题、目录、排序、时间和版本关系保留。角色扮演预设、角色及全局设定库和聊天 Session 不参与本步骤；任意条目无效则回滚整步，仍保持 v15。

预设导出格式为 `eleckoi.agent-preset` v3。旧 v1/v2 文件中的创作提示词只在导入边界执行同一转换，包含全部保存版本；当前保存、批量修改和 v3 导入直接校验当前格式，禁止重新引入 EJS 或关键词配置。数据库升级与旧文件导入分别登记退役条件，不在正常读取中反复转换。

`pnpm db:generate` 从固定 SQL 生成内嵌迁移 SQL与 Drizzle 查询映射；`pnpm check:database-schema` 校验生成内容。SQL 是公共结构权威，Drizzle 映射不反向生成迁移。

公开数据库 v11 到 v12 的迁移统一建立显示模板、完整编辑器版本、正则整体启停与聊天历史状态存储，并原子整理已移除的快捷命令正则目标：混合目标保留其他目标；仅有该目标的规则停用，保留原始名称、表达式与替换文本。当前全局、角色、预设规则及预设历史版本使用同一正式目标集合。无效的回复规则快照列删除，当前显示规则仍即时作用于 Session 正文。

推理正则的显示结果只保存在 Client/Host 显示投影中，原始思考文本仍来自 Session。提示词规则仅处理本轮后续模型请求中的推理文本副本，旧轮次保持用户输入与角色最终正文。无选定目标的旧规则不自动归入 AI 回复；携带不透明模型回放数据的推理不能改写后沿用回放信息，实际发生替换时明确失败，显示正则仍可使用。

本批未发布改动统一并入 v12→v13：角色的多开场白迁到 `character_openings`，每个角色只有一份开场白列表、默认开场白编号和整体启停。每条开场白保存标题、正文和变量绑定，不存在独立开场白版本。当前默认开场白保持，原设定库各快照中的不同开场白并入同一列表；同编号但正文或绑定不同的条目分配新编号完整保留。迁移后删除设定库中的开场白内容及关联、`character_text_contents` 中的旧开场正文和 `characters.showOpening` 冗余列。聊天中已选开场白、聊天变量和 Session 日志不修改。

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

正文、代码、终端的字体与字号统一由官方主题 settings 保存，正文默认 14px；聊天显示的产品 schema 不再声明 `message_font_size` 和 `message_font_weight`，展示也不读取这些旧局部值。已有偏好 JSON 中的额外字段不参与字体计算，不自动搬到官方设置、不增加迁移或兼容分支；已保存的官方主题配置保持。行距、字距和消息间距仍使用原有产品显示偏好，不改数据库版本或 Session。

## 与 DSH Storage 的关系

当前产品数据库没有挂载 `@deepseek-ai/dsh-storage-sqlite`。该官方包是 Host 侧文档型 KV 后端，每个键对应一行 JSON；`@deepseek-ai/dsh-storage-domain` 在其上提供 schema 校验、写入串行化和 `domain/changed` 事件。它适合简单、独立、按键读写的领域状态。

ElecKoi 当前 49 张产品表需要关系、外键、排序、搜索、跨表事务和从 v1 连续迁移到当前版本。锁定版本的 DSH Storage 不提供二级索引、跨表事务或自动迁移，因此不替代这套关系型产品库。两者遵守同一所有权边界：只在 DSH Host 打开，Client 通过正式 Remote 调用；新增简单 KV 领域时先评估 `ctx.storageDomain`，新增关系型领域则进入本产品库并维护迁移链。聊天正文与轨迹仍由 DSH Session 持久化，查询索引由官方 `dsh-session-query-sqlite` 负责。

角色扮演的下一轮模型请求从 Session 投影：旧轮次只携带用户输入和角色最终正文，旧推理、工具过程与 Provider replay state 不再发送；当前轮次流程完整保留。该投影不会删除历史轨迹。编辑、删除、回退和重新生成保持同一聊天与 Session ID。

角色聊天的生成归属按会话区分，切换角色、打开其他历史或新建聊天不会停止原会话。Client 中每个进行中的发送／重新生成独立持有官方 Session 引用，准备、执行与保存结束后释放；当前页面引用只控制显示。后台结果按发起会话读取，不重新选中它或覆盖当前页面的消息、草稿和生成状态，停止只指向当前会话的请求。并发状态仅存在于运行内存，不增加数据库字段、历史副本或迁移。

子代理使用独立 Session；普通派发从独立上下文开始，fork 只在建立时继承已完成历史。删除主聊天先停止运行中的后代，再按正式 `parentSession` 关系递归删除会话目录、对应角色运行配置快照与工具结果。历史子代理唤醒回复的原输入关联由现有投影从正式派发和消息事件重建，不改写会话历史或增加数据库迁移。

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
13. v13：提取独立开场白、增加全局设定库并删除独立显示模板，保留有效正文和关联。
14. v14：补齐默认创作预设的工作区能力，自定义工具选择不变。
15. v15：移除开场白独立初值，变量初值由正式配置统一生成；已有聊天状态不回写。
16. v16：创作预设提示词改为文字常驻、必读和选读；转换当前与历史版本，旧 EJS 停用保留正文。
17. v17：变量值与来源身份一同保存、快照和回退；升级按会话关联版本建立一次来源基线，其他旧字段作为运行时项保留。

## 聊天状态与归档

新生成和聊天导入都使用 `conversation_state_snapshots`。生成前保存变量与聊天设定差异的 `before`；成功结束后，当前变量与 `after` 在同一数据库事务提交。一轮可以有多个模型请求和助手事件，完成历史仍只有一个轮次边界；工具工作文件不承担历史存储。

回退恢复该轮次开始前的变量和聊天内设定差异，删除该轮完成后的状态及后续轮次状态。重新生成失败会恢复操作前的 Session、产品状态和历史。角色卡基础设定、预设、正则和脚本的作者配置不跟随聊天回退。

`agent_responses` 仅保留旧消息的九个关系字段：`id`、`conversationId`、`turnId`、`responseIndex`、`speakerId`、`status`、`createdAt`、`runtimeThreadId`、`dshTurn`。新聊天及新导入不写回复账本；正文、执行轨迹和图片引用都属于 Session。`agent_turns.variableStateJson` 仍用于产品开场白及旧输入元数据，不用它推算新轮次历史。

数据库升级保留旧账本能明确关联轮次的状态。按用户决定丢弃缺少绑定或存在多份候选的旧回复历史，保留正文和回复关系；缺失楼层显示“无历史状态”，不阻断正常聊天。旧检查点文件退出支持，没有转存或自动删除代码。

聊天导出仍是一个 JSON 文件，内部包含产品关系、当前设定差异、状态历史和正式 Session 日志；导入时统一重映射聊天、分支和 Session 标识。归档版本为 2，与物理数据库版本 12 是不同概念。已知未发布 v12/v13/v14 的旧开发结构先精确校验，再原子整理到 v12 后进入 v13，正式升级链为 v11→v12→v13。

聊天归档导入的目标是当前选中的现存角色，不要求目标角色编号等于导出时编号。归档内部的会话归属、关系和状态仍须一致；创建新聊天时仅重绑角色归属及对应角色发言身份，不覆盖目标角色卡、作者配置或历史正文与变量值。旧角色不存在也不阻断导入，变量版本缺失继续沿既有软关联合同处理。

原生日志先通过同批官方 Session 格式目录校验，再用官方继承前缀和 seed 构造创建独立 Session，事件序号及历史投递回执保留，只有已知且在归档映射中的子会话关系随身份更新。投递回执属于原来获得接受的 Session，不能改成新编号冒充新会话已投递。所有日志写入后走官方只读打开与完整读取，成功后才提交产品聊天目录；失败沿原导入清理路径撤销本次创建，不修改原文件和已有聊天。此行为不改变归档版本或数据库结构。

聊天归档不携带本机 `session-snapshots` 运行配置。重新生成和删除消息按产品数据库中的聊天／Session 映射校验归属，读取已导入的历史状态；生成准备从当前角色、预设和会话模型建立运行配置。首次激活时尚无配置的 Agent，在本轮配置准备后补齐同一套请求与上下文装配，每个 Agent 只安装一次。导入的根会话允许编辑、删除和回退，关闭写句柄后按官方 seed 构造重建编辑后的继承边界，保留 Session ID 和旧回执原始归属，格式严格验证及失败回滚继续生效；实际子任务按 `origin: subagent` 区分，不用“有继承历史”代替子任务身份。

生成结果表的旧开发整理不占用正式迁移步骤。已运行过原开发 v9/v10 的数据库，启动时先核对全部结构，再原子删除该表并整理为当前结构；原开发 v9 补齐变量版本绑定，原开发 v10 保留已有绑定，不重新选择版本。未知结构拒绝修改，失败回滚，不清库。聊天保存只等待当前进程的工作，不保存或查询重启前的执行结果。


当前开发基线的全局与角色正则表使用 `optionsJson` 保存裁剪、深度范围和宏替换选项。缺少该字段的已知开发结构原子整理，保留已有规则，不新增业务表。独立扩展库及其读写服务已经撤除，不读取或搬运该库的数据，见 [ADR 0033](adr/0033-native-format-import-storage.md)。

脚本功能尚未实际使用，按用户确认直接采用当前文件结构，不保留旧脚本库转换或启动回退入口。现有 SQL 结构不变，不增加脚本源码迁移。角色卡导入仍把源码写入该角色的文件目录，自动保存归属。

脚本读取以实际 `.js` 文件为准。外部编辑造成源码变化时，读取更新修改标识，旧界面草稿不能覆盖已变更的源码。普通启停不重写未改变的源码。文件事务记录只用于当前操作失败和异常退出恢复，提交完成后释放，不是旧格式转换或另一份正常源码。数据库单文件备份不等于完整脚本备份，完整产品备份还须携带源码目录。

原生角色卡和预设的导出携带所属目录内的辅助模块及二进制资源；导入保留相对路径并自动关联新的所属对象，与脚本管理记录原子保存。入口正文不在附件里重复保存，辅助文件不进入 SQLite。角色或预设删除同样通过文件事务删除其所属文件；即使目录已编辑但尚未保存脚本管理记录，异常退出也按所属对象是否已提交删除恢复文件。全局脚本不随角色或预设删除。

较早开发构建创建的 v6 数据库在升级至 v7 前，先原子整理已废弃的执行、偏好与结构登记表，再执行 v6 → v7 迁移。仍有效的角色、预设、设定、变量与聊天索引数据保留，不要求清库。后续结构变化必须提升版本并追加连续迁移。

## 升级代码的清理条件

新聊天通过所选开场白的 `variableVersionId` 关联素材库中的变量版本；变量编辑器当前选中项只服务编辑，不切换已有聊天的关联。未关联、无有效开场白或关联版本缺失时，开局变量状态为 `{}`，不自动采用其他版本；缺失关联不阻断创建、继续聊天、切换开场白或聊天导入。已有聊天的初始值、当前值及历史保持，版本编号保留用于恢复同一配置，删除版本不要求先删除聊天或解除所有开场白关联。旧原稿字段和不一致初值仍由下述 v14→v15 迁移一次性修正，本轮不新增物理结构或迁移。

会话的变量关联可在「变量查看与管理」明确切换或取消，不依赖开场白存在，也不改变创作编辑器的选中版本。写入只更新原 `agent_conversations.variableVersionId`，校验目标属于本角色并核对原关联，拒绝过期操作；生成或排队期间不切换。当前值、来源身份、开局及全部历史快照不重写，新配置缺少当前值时继续使用原默认值读取与 insert 合同。同编号原配置切回后，未被后续实际写入覆盖的原值仍可按原身份读取。此入口没有新增表、字段、迁移或另一份配置存储。

聊天工具在每次使用时从变量库读取关联版本的最新目录、类型、默认值、说明、更新规则和校验；当前候选值单独属于本轮，成功后才写回聊天。运行合同中的 `defaultStateJson` 来自作者配置，不读取开局快照。新增定义可立即发现和读取默认值；尚未写入聊天的值以 `current_present: false` 明确返回，实际创建仍使用 `insert`，不会把曾被主动删除的值自动补回。默认值修改不重置已保存当前值，配置和状态在补丁异步处理期间变化会拒绝本次候选，供重新读取后再试。版本缺失时只读取已有聊天值，不虚构说明或校验规则；恢复相同编号的版本后继续读取最新配置。

变量版本中的定义默认值与 `initialStateJson` 在保存时由共享生成器同步。普通变量和静态分组按当前定义重建，只有动态键分组保留原快照中的具体条目及数据；不得因存在任意动态分组而保留整份旧初值。分组改名或移动通过原分组 ID 找回动态数据，停用及删除分组不带入新初值。导入时已求值的动态数据保留，现有聊天的初始、当前及轮次状态不随作者修改回写。

变量来源身份保存在 `chat_session_variable_states.identityJson`，和变量值在同一事务写入；历史边界使用 `conversation_state_snapshots.variableIdentityJson` 一同保存。身份记录只包含节点身份、父节点身份、来源及定义引用，不含规则、默认值或另一份变量值。作者定义引用当前关联版本和稳定条目编号；AI 给定义赋值仍属定义，配置以外新写入的项才属于 runtime。动态字典实例拥有运行时身份，其模板字段仍引用作者定义；删除容器后，不将其后代当成独立根变量。

工具目录为最新配置定义加明确归属的运行时项。同一条目改名保留身份和原值，新建同名条目具有不同编号，当前值明确缺失，只有显式创建后才写入新值；旧值在已有快照保留。作者删除、停用或改名不会清洗存档；运行时根据来源投影最新目录，旧字段不会因配置中缺席就被推断为动态变量。值与身份一起成功提交、并发校验和回退；作者 Zod 与脚本继续处理工具可见的当前状态。

v16→v17 在单个原子步骤中为两张原有表增加来源列，保留初始／当前值和全部快照的原始 JSON；升级只按会话已保存的关联版本建立一次基线：该版本中声明的字段归定义（包括停用项），其余旧字段统一作为 runtime 保留使用，不追查历史创建者。编辑器当前选中的其他版本不参与。初始值、当前值和历史快照原样保留，不套用新默认值、转换旧类型或清洗孤立字段；基线完成后，新写入和后续编辑按稳定身份处理。此前未发布的 removed_paths 内容随本步骤删除；编辑器及运行时不再维护它。迁移失败回滚结构与数据。迁移入口 `0017VariableIdentity.ts`、登记与旧结构验证分支须保留到停止支持 v16 及更早直接升级后一起退役。

聊天归档中的产品存档快照导出为 v3，外层聊天历史封装保持 v2；完整保留值、身份与历史。v1/v2 只在归档导入边界按同一简单基线转换来源，其他旧字段作为运行时项保留，正常运行只使用当前身份模型；停止支持这两种归档后删除导入转换，共用旧配置读取器等数据库迁移调用同时退役后删除。变量配置文件仍为现有格式，不携带聊天来源，也不再携带删除标记。

当前开场白合同、存储写入和导出不含独立初值字段。v14→v15 在升级事务中移除旧字段；文件导入只解析当前定义的字段，忽略其他字段，不设该字段的兼容运行分支。聊天历史中的已解析开局状态继续用于重开和历史恢复，与已退役的角色原稿字段不同。

迁移、旧版本导入、过渡适配入口统一以 `RETIRE WHEN:` 明确退役条件；下面按实际数据分别核对。客户端发布了新版本、某台机器已升级或本机扫描没有命中，都不能证明其他受支持的旧安装、未打开的聊天及备份已完成转换。2026-11-12 已明确退役 v0.2.1 及更早默认模型路由的自动转换，当前直接解析保存的提供商 ID，失效选择通过模型选择器重新设置；该决定不改变其他升级来源的支持范围，下表入口继续保留。

| 入口 | 何时可以清理 | 必须一起处理的范围 |
| --- | --- | --- |
| [v14→v15 开场白及变量初值升级](../packages/host/product-data/src/storage/sqlite/migrations/0015OpeningVariableState.ts) | 停止支持 v14 及更早数据库直接升级，剩余支持版本仍有连续迁移链 | 删除 0015、登记及 v14 升级／回滚回归；保留当前无独立初值的合同、共享初值生成器及聊天历史状态 |
| [SQLite v1 → v17 迁移链](../packages/host/product-data/src/storage/sqlite/installSchema.ts) | 正式停止支持某步骤起点及更早 schema 直接升级；剩余受支持版本仍有连续原子链 | 对应 `0002` 至 `0017` 步骤、旧表定义、import、登记与旧库 fixture；保留当前 SQL、版本常量及完整性校验 |
| [v15→v16 创作提示词转换](../packages/host/product-data/src/storage/sqlite/migrations/0016CreatorPrompts.ts) | 正式停止支持 v15 及更早数据库直接升级，剩余支持版本仍有连续原子链 | 删除 0016、installSchema 的 import／登记及 v15 升级／回滚回归；共用旧提示词转换器须等待下行的旧文件导入也退役 |
| [创作预设 v1/v2 文件提示词转换](../packages/host/product-data/src/domain/agentPresets/AgentPresetImportCodec.ts)、[共用转换器](../packages/shared/src/foundation/legacyCreatorPrompts.ts) | 停止支持 ElecKoi 预设 v1/v2 文件导入；共用转换器还须等待 v15 及更早数据库升级退役 | 删除旧文件版本登记、legacyCreator 参数／转换分支及专用回归；最后一个调用退役后删除共用转换器，保留当前 v3、创作格式校验、普通保存与角色扮演能力 |
| [开发 v2、v6 同版本整理](../packages/host/product-data/src/storage/sqlite/installSchema.ts) | 分别停止支持对应开发基线直接升级 | 对应整理函数、专用入口和 fixture；v2 共享整理函数仍被 `0002` 使用时继续保留 |
| [模型设置 schema v0/v1 → v2](../packages/client/features/dsh-client-models/src/index.js) | 支持的升级和 profile 恢复入口均已保存至少 schema v2 的设置 | 旧 schema 转换、专用常量与用例；函数和启动调用须等两段整理均退役，保留当前设置合同和插件装配 |
| [旧子 Agent 占位路由](../packages/client/features/dsh-client-models/src/index.js) | 停止支持 v0.2.3 之前版本直升，且支持的 profile 恢复入口不再携带该路由 | 占位路由过滤、专用常量与用例；与模型设置 schema 转换分别核对 |
| [旧实体化预设 ID](../packages/client/features/dsh-client-roleplay/src/host/agent-preset-bridge.mjs) | 支持恢复的 Session、快照、导入及历史回退入口均不会再选中实体化预设 ID，且对应旧版本直升已退役 | `migrateStoredPreset`、`legacyPresetId`、启动扫描、准备及关闭写入句柄后的转换调用和专用用例；保留当前预设注册、重组和恢复服务 |
| [创作工作室旧散列预设 ID](../packages/client/features/dsh-client-creator-studio/src/host/runtime.mjs) | 停止支持会产生旧散列 ID 的版本直升，且受支持的恢复、导入及历史回退入口均不会再选中 `eleckoi-creator-<64位散列>` | `migrateStoredPreset`、`legacyPresetId`、启动扫描、打开与编辑回退的转换调用、旧生成文件清理及专用迁移用例；保留当前选择读取、固定 `eleckoi-creator-active` 注册、全局预设重组及正常新旧会话回归 |
| [生成预设的旧插件标识](../packages/client/features/dsh-client-roleplay/src/host/preset-definition.mjs) | 全部受支持的生成预设已重新生成并使用当前包名，旧标识恢复回归确认不再需要 `eleckoi:agent-preset/*` 转换 | `resolveRuntimePlugin` 中的旧标识转换分支及专用旧标识用例；保留当前包名、嵌套组合遍历、语言资源及正常加载校验 |
| [旧预设的工具结果中段裁剪插件](../packages/client/features/dsh-client-roleplay/src/host/preset-definition.mjs) | 全部受支持的持久运行预设已重新生成且不含旧裁剪插件，旧会话升级恢复回归证明无需过滤仍能正常加载 | `currentPlugins` 中针对旧裁剪插件的过滤、`retiredPruner`、`retiredPrunerUrl` 及专用用例；另一项旧插件过滤仍保留时继续保留共用函数和调用，正常摘要压缩保留 |
| [旧预设挂载的图像生成处理器](../packages/client/features/dsh-client-roleplay/src/host/preset-definition.mjs) | 全部受支持的 Session 预设已重新生成且不含原预设级图像处理器 | `oldImage` 判断、对应过滤及专用用例；工具结果裁剪过滤仍需要时保留 `currentPlugins` 和调用，两项均退役后再一起移除共用过滤函数与调用 |
| [profile 内置 bundle 登记](../apps/desktop-host/src/desktopPluginBundles.ts)、[Tavily 首次选择](../apps/desktop-host/src/desktopPluginHost.ts) | 支持的升级和 profile 恢复入口分别已完成 `bundles-v9`、`tavily-bundle-v1` 登记 | 各自的一次性函数、调用及旧 profile 用例；保留新 profile 初始化和用户启停选择 |
| [Android 前端 bundle 登记](../apps/android-host/src/androidPluginBundles.ts) | 受支持升级及 profile 恢复来源均已完成 `frontend-bundles-v2`、`frontend-bundles-v3`；不能以某台手机已升级为依据 | 删除 `registerAndroidFrontendBundles`、`frontendUpgrades`、启动调用和仅验证旧 profile 的用例；保留新 profile 初始化、用户选择及正常的 `registerAndroidMobileBundle` 平台必需项约束 |
| [旧 HTML 资源组合替换](../packages/client/features/dsh-client-html-resources/src/profile.ts) | 桌面及 Android 的受支持旧 profile、备份恢复均不再选择两个已移除的资源 bundle | 删除 `replaceHtmlResourceBundles`、`obsoleteBundles`、两端一次性登记中的调用和专用用例；保留当前资源 bundle、正常初始化及用户主动停用选择 |
| [旧请求投影缓存清理](../packages/client/features/dsh-client-roleplay/src/host/request-cache-retirement.mjs) | 停止支持携带 `eleckoiRequestContexts`／`eleckoiRequestInput` 缓存行的旧版本直升，且受支持恢复样本不再含这些行 | 删除 `retireRequestContextCache`、roleplay 启动调用与专用回归；保留官方投影缓存及其他检查点。此入口只删除旧派生行，不改 Session 日志和产品业务表 |
| [Session 配置废字段过滤](../packages/client/features/dsh-client-roleplay/src/host/session-snapshot.mjs) | 受支持升级、备份及恢复来源均已重新生成不含旧文件中转字段的配置快照 | 删除 `retiredRuntimeFields`、`configuration`、读写中的过滤调用和专用回归；保留当前快照读写、原子提交、子会话继承及每轮模型配置。字段清理不能作为恢复旧正文或旧文件的入口 |
| [自动插画配置 v4/v5 → v6](../packages/host/product-data/src/domain/agentPresets/autoIllustrationUpgrade.ts)、[存储入口](../packages/host/product-data/src/domain/agentPresets/AgentPresetRepository.ts)、[导入入口](../packages/host/product-data/src/domain/agentPresets/AgentPresetImportCodec.ts) | 受支持的存量预设、保存版本和导入文件均不再携带旧工具组自有的插画配置；存储升级与导入兼容分别确认 | 删除 `upgradeIllustrationConfiguration` 及启动调用、`illustrationFromPortable` 的旧分支、共用升级函数和各自专用回归；保留当前插件插画配置及其他预设读写 |
| [旧预设缺少必需提示词的启动补齐](../packages/host/product-data/src/domain/agentPresets/AgentPresetRepository.ts) | 所有受支持的存储预设、保存版本及备份恢复均已有当前必需提示词和位置，旧来源直升已退役 | 删除 `ensureRequiredEntries`、初始化调用和仅验证启动补齐的用例；保留正常读取、保存、导入使用的 `normalizeAgentPresetPrompts` 及当前必需提示词定义 |
| [旧开发 v9/v10、v12/v13/v14 整理与正则列补齐](../packages/host/product-data/src/storage/sqlite/installSchema.ts) | 分别停止支持带生成结果废表的开发 v9/v10、缺正则整体开关的开发 v12、带旧状态表的开发 v12/v13/v14，以及缺 `optionsJson` 列的结构；各来源独立判断 | 删除对应分支、专用旧 SQL／校验参数和用例。正则列补齐随其启动调用及缺列校验宽容分支一起删除；保留当前 SQL、当前完整性校验和仍受支持的正式升级链 |
| [v13→v14 默认创作能力补齐](../packages/host/product-data/src/storage/sqlite/migrations/0014CreatorWorkspace.ts) | 正式停止支持 v13 及更早数据库直接升级，剩余支持版本仍有连续迁移链 | 删除 0014、登记与专用旧库回归；保留当前创作工具默认值、自定义预设及全局选择 |
| [聊天归档 v1 状态转换](../packages/host/product-data/src/domain/conversations/ConversationArchiveRepository.ts)、[共用旧账本解码](../packages/host/product-data/src/domain/conversations/legacyConversationStates.ts) | 归档 v1 导入停止支持后可删归档分支；共用解码器还须等待 v11 及更早数据库及相关开发库升级来源退役 | 删除 v1 白名单、转换及旧设定状态分支和归档专用回归；共用解码器须与 [0012 状态转换](../packages/host/product-data/src/storage/sqlite/migrations/conversationStateStorage.ts) 的最后调用一起清理。当前归档 v2、消息身份和状态存储保留 |
| [ElecKoi 预设 v1 导入](../packages/host/product-data/src/domain/agentPresets/AgentPresetImportCodec.ts) | 正式停止支持 ElecKoi 预设 v1 文件导入；该条件与模型配置 schema v1、插画配置 v4/v5 相互独立 | 删除白名单中的 v1、无需 `purpose` 的旧文件分支及专用回归；v2/v3 必须校验用途，其他受支持的外部预设格式保留；共用创作转换按上行等待最后调用退役 |
| [角色卡 v1 开场白提取](../packages/host/product-data/src/domain/characterTransfer/legacyOpeningSnapshot.ts)、[导入调用](../packages/host/product-data/src/domain/characterTransfer/CharacterTransferService.ts)、[共用旧条目解码](../packages/shared/src/foundation/legacySettingOpenings.ts) | 停止导入不含独立开场白的 v1 角色卡；共用条目解码还须等待 schema v12 及更早升级来源退役 | 删除 v1 卡的开场白转换及专用回归；共用解码器和 [0013 开场白提取](../packages/host/product-data/src/storage/sqlite/migrations/characterOpenings.ts) 的最后调用一起清理，保留当前独立开场白配置 |
| [早期 v2 角色卡开场白版本结构](../packages/shared/src/foundation/characterOpenings.ts)、[导入分支](../packages/host/product-data/src/domain/characterTransfer/CharacterTransferService.ts) | 正式停止支持含开场白 `versions` 的早期未发布 v2 角色卡 | 删除旧结构 schema、`decodeLegacyCharacterOpeningVersions`、导入识别及专用回归；保留当前消息合并与独立开场白列表 |
| [v3 设定库内嵌开场白导入](../apps/web/src/modules/settingLibraries/model/settingLibraryTransfer.js)、[Client 分流](../packages/client/features/dsh-client-character-configuration/src/client.js)、[Remote](../packages/host/product-api/src/index.ts)、[Host](../packages/host/product-data/src/index.ts) | 正式停止支持含固定开场白条目的 v3 设定库文件导入 | 一起删除旧条目解码、`openingImport`、追加分支、`importSettingLibrary` Remote 和 Host 方法及专用用例；保留普通设定库文件导入及当前独立开场白读写 |
| [旧 DeepSeek 扩展选择整理](../packages/client/features/dsh-client-web-search/src/profile.js) | 受支持 profile 和恢复入口均不再引用 `eleckoi-deepseek-api` | 删除 `retireDeepSeekExtensionSelection`、桌面／Android 启动调用和旧选择回归；保留用户凭据及未使用的配置。当前官方 Search／Fetch 选择与 Messages 模式不随之删除 |
| [六个旧产品错误码](../packages/shared/src/foundation/DesktopError.ts)、[防御映射](../packages/shared/src/foundation/failure.ts) | 所有生产 `DESKTOP_ERROR_CODES` 抛出点均已按真实语义改成契约码，并完成其边界和用户错误呈现回归 | 删除旧六码、`DesktopErrorCode`、联合类型旧分支、映射及专用回归；保留 `DesktopError` 当前契约码承载和统一失败折叠。当前创作项目 Repository 仍有实际旧码调用，条件尚未满足 |
| [Android 文件发布适配](../native/android-runtime/README.md) | 锁定官方 JSONL／附件实现在 Android 应用沙箱通过独占发布、冲突、失败恢复及持久化，且不再需要硬链接替换与应用路径适配 | 删除对应锁与归档替换；两者都无引用后才删除共用发布模块和原生入口。当前版本摘要锁定及 APK 资源校验仍保留；此适配不迁移用户库或 Session 格式 |
| [请求上下文记录修复](../packages/host/runtime/src/sessionRequestContextRepair.ts) | 对应旧版本直升已退役，且支持的 Session 恢复和导入入口已有转换缺失可忽略标记的能力 | 修复模块、启动扫描、导出与专用用例；旧事件保留，新预览不落盘，见 [ADR 0029](adr/0029-ephemeral-request-context-preview.md) |
| [旧聊天独立输入补回](../packages/host/runtime/src/sessionHistoryRecovery.ts)、[启动调用](../packages/host/runtime/src/sessionStartupRecovery.ts) | 对应旧聊天直升已退役，且支持的恢复和导入入口已把缺失输入写为正式 Session 消息 | 补回模块、归档读取、启动调用、导出与专用用例；保留逐会话错误隔离、投影重放、数据库状态历史和正常重新生成 |
| [已补回聊天的统计标记](../packages/client/features/dsh-client-roleplay/src/host/history-stats-projection.mjs) | 支持恢复的已迁移日志完成等价统计转换，重放结果保持正确 | 仅旧标记分支、专用状态与旧日志用例；保留当前已有输入续接的统计及投影登记 |
| [旧请求投影信封过滤](../packages/client/features/dsh-client-roleplay/src/host/conversation-context.mjs)、[轨迹过滤](../packages/host/runtime/src/trajectory.ts) | 支持恢复和导入的旧日志均已不含该插件消息 | 按正式插件来源标识排除旧信封；新请求仅在内存装配，不生产新信封 |
| [v3 → v4 系统开头补丁](adr/0026-legacy-session-system-head-migration.md) | 锁定上游的正式相邻迁移能通过同一组旧日志用例 | 版本补丁、`patchedDependencies` 登记和锁文件；保留官方格式目录与完整迁移链 |

正式 SQL 步骤逐一受上表的升级下限约束：[0002](../packages/host/product-data/src/storage/sqlite/migrations/0002RuntimeClean.ts)、[0003](../packages/host/product-data/src/storage/sqlite/migrations/0003SettingPlacements.ts)、[0004](../packages/host/product-data/src/storage/sqlite/migrations/0004DshTurnBinding.ts)、[0005](../packages/host/product-data/src/storage/sqlite/migrations/0005RemoveRichMessageHeights.ts)、[0006](../packages/host/product-data/src/storage/sqlite/migrations/0006RemoveDshOwnedConfiguration.ts)、[0007](../packages/host/product-data/src/storage/sqlite/migrations/0007RemovePresetSubagentModelSelection.ts)、[0008](../packages/host/product-data/src/storage/sqlite/migrations/0008RemoveHistoryUserMessageCount.ts)、[0009](../packages/host/product-data/src/storage/sqlite/migrations/0009OpeningVariableVersion.ts)、[0010](../packages/host/product-data/src/storage/sqlite/migrations/0010ScriptLibraries.ts)、[0011](../packages/host/product-data/src/storage/sqlite/migrations/0011PresetPurposes.ts)、[0012](../packages/host/product-data/src/storage/sqlite/migrations/0012EditorConfiguration.ts)、[0013](../packages/host/product-data/src/storage/sqlite/migrations/0013RemoveDisplayTemplates.ts)。[旧设定格式辅助](../packages/host/product-data/src/storage/sqlite/migrations/settingEntryFormat.ts) 随 0004 清理；[正则目标清理](../packages/host/product-data/src/storage/sqlite/migrations/removedRegexTargets.ts)、[正则整体开关转换](../packages/host/product-data/src/storage/sqlite/migrations/regexLibraryEnablement.ts) 须等 0012 及相关开发库调用全部退役。0014、0015 的额外数据条件见上表。

历史 Session 的只读轨迹通过 [官方格式目录接入](../packages/host/runtime/src/trajectory.ts) 解码，不写回旧日志。停止支持须转换的历史日志、归档预览及子会话事实来源后，才能一并删除历史分支、`collectHistoricalChildren` 与专用旧日志回归；当前格式读取、损坏检测、尾部恢复和有界缓存保留。此支持边界与 SQLite 数据库版本独立。

DSH 精确版本补丁的完整清单及每项删除条件以 [pnpm-workspace.yaml](../pnpm-workspace.yaml) 为唯一登记源，当前 24 项。它们是源码或平台适配，和用户数据的一次性迁移分开核对：本轮新增的 `agent/prepare-step` 时机适配、官方语言／更新入口复用，字体组移除内部折叠的展示补丁，以及构建器 ULMO 格式和 pnpm 去重生产依赖收集补丁，均在该文件逐项注明上游提供何种等价能力后退役；删除时同时移除补丁文件、登记及锁文件引用，保留仍验证当前产品功能的回归。依赖收集修正回接 [electron-builder 官方修复 #10323](https://github.com/electron-userland/electron-builder/pull/10323)，只修复构建期依赖闭包，不增加产品数据转换。

0.2.2-rc.1 升级没有新增产品 SQL 迁移步骤，仍为 v15。模型选择与工具执行器的变化已直接按新版公开合同改装当前源码；产品不再使用旧 `tools.mode` 或 `DSH_TOOLS_MODE`，没有增加运行时猜测旧配置并自动改写的兼容层。用户自建组合里的旧执行配置应按同版官方指南改成显式执行器插件，不能据此删除仍支持的产品数据升级入口。

本次审计已退役的旧架构残余包括未装配的 Electron 目录／文件适配器、旧网页作者会话／输入桥及事件接收端、旧作者运行库内联加载器与构建插件、闲置聊天等待／拖入组件及鲸鱼资源、闲置轨迹标题和独立行组件、未使用的预设模型绑定与旧预设投影模块、未使用的消息媒体拆分模块；相应只覆盖孤立实现的测试和样式同步删除。脚本资源调用链现只抛契约错误码，已删除接口中孤立的旧 `CONFLICT` 判断。当前作者 SDK、HTML 静态资源、外部格式兼容、官方输入与轨迹组件保留。旧 `SqliteDatabase` 自主管理实现没有生产消费者，已移至 `tests/helpers/SqliteDatabase.ts`，27 个回归的构造入口随之更新；生产目录只保留 DSH Host Repository 使用的存储类型合同。

本次审计还退役聊天 Hook 的旧双订阅兜底：正式服务及主窗口、独立聊天入口都已提供 `getChatSnapshot`／`subscribeChat`，故移除 `getLegacyChatSnapshot`、`createLegacyChatSubscription` 及选择旧接口的分支；既有流式、取消、删除、重新生成与会话隔离回归改用当前接口继续保留。服务的独立详情／流快照仍有作者运行时等正式消费者，不随这项 Hook 兜底一起删除。

删除恢复或迁移入口时只移除其专用用例；新建、重开、备份、完整性、当前模型请求、预设重组和重新生成等正常路径的验证继续保留。异常退出后的响应状态恢复是当前运行职责，仍由 [启动恢复](../packages/host/product-data/src/storage/sqlite/recoverInterruptedState.ts) 执行。

角色对话只生成、注册固定的 `eleckoi-active`，切换全局预设、模型和工具配置时更新同一个生成文件。Host 启动按正式会话头识别旧实体化预设，恢复前通过官方 Session Persistence 追加当前全局预设选择，并将仍引用旧 ID 的运行快照切到当前 ID；不注册旧声明或别名，不读取、删除历史生成文件，也不新增数据库迁移。打开准备和关闭写入句柄后的编辑边界复用同一入口，覆盖首轮删除、重新生成或失败回滚重新暴露旧头部选择的情况；转换不会删除或替换原消息、会话身份及产品数据。不支持或损坏的单个历史日志明确记录转换失败，不阻断其他会话启动；后续访问仍报告原错误。

创作工作室旧散列预设整理在 Host 启动发现旧生成目录时执行；打开或编辑回退到旧预设选择的会话也调用同一转换。通过官方 Session Persistence 追加当前预设选择，保留原 Session ID、消息、标题和编辑目标；确认转换成功后，只删除对应的生成 `preset.json` 与空目录。第一轮删除或重新生成可能回退掉全部事件，只允许使用本次编辑前已校验的工作室状态补回标记，并在恢复 Agent 前持久追加当前预设选择；普通打开与启动转换仍要求存在工作室标记，不依据旧预设名称猜测编辑目标。没有产品数据库结构变更，不删除用户创作预设或聊天。历史回退仍可能重新暴露旧选择，因此本机完成一次整理不能单独作为移除代码的依据；本次补回随同表中该转换入口一起退役。

生成预设中的旧 `eleckoi:agent-preset/*` 标识由 [preset-definition.mjs](../packages/client/features/dsh-client-roleplay/src/host/preset-definition.mjs) 在内存中转换为当前包名，不修改产品数据库或历史声明。全部受支持生成文件重新生成、旧标识恢复回归确认不再需要转换后，删除该分支及对应旧标识用例；当前包名及语言资源校验继续保留。

## 删除与文件

- 删除角色时级联删除其产品关系和聊天索引。
- 删除聊天或清空记录时，产品索引与对应 DSH Session 使用同一聊天标识处理，不创建分叉会话。
- 工作室的工作区会话删除通过现有 Host 编辑服务处理：一并删除关联子会话、日志及投影目录、运行快照与工具结果，解除官方工作区成员、置顶和归档记录；共享图片仍有其他引用时保留，项目目录文件不删除。清理失败保留日志供重试，并向调用方报告失败。
- 媒体文件由 Host 的 `LocalMediaStore` 写入；数据库只保存稳定媒体引用。Electron 的媒体协议只负责只读响应。
- 不再使用数据库清理任务表。DSH Session 文件生命周期交给正式 Session API，产品媒体删除由拥有该文件的 Host 操作在业务事务边界内执行。

## 验证

- `pnpm check:database-schema`：49 张公共表、2 个视图与生成文件一致。
- `pnpm test`：覆盖 v1 至 v15 迁移、未发布开发库整理、失败回滚、外键、重启持久化、角色与媒体、设定、变量、正则、预设、脚本库、聊天索引和 Remote 写入。
- `pnpm rebuild:electron && pnpm check:electron-sqlite`：使用 Electron 的真实原生 SQLite ABI 创建公共结构，核对 49 张业务表、2 个视图、`user_version = 15`、冗余列缺失、外键和完整性。

架构决策见 [ADR 0018](adr/0018-dsh-host-owns-product-data.md)。

数据库 v12→v13 删除独立显示模板表及其编辑器版本，并将角色多开场白提取为独立存储；正则与脚本版本逐行保留。旧模板不转换为正则，运行时不提供旧配置读写入口。历史升级步骤保留以支持受支持数据库连续升级。

## v13 到 v14：默认创作能力

`0014CreatorWorkspace` 在同一事务中为仍使用原始单一创作工具组的默认创作预设及其对应保存版本补齐创造模式所需的开发工具组。只更新未修改的默认创作指引；自定义预设、修改过的指引、全局选择和已有会话不改。物理表结构保持 49 表、2 视图，版本提升用于一次性数据转换。停止支持 v13 及更早数据库直接升级后，才能连同登记和回归删除该迁移；运行时仅维护当前配置。

## v14 到 v15：开场白与变量初值

[`0015OpeningVariableState`](../packages/host/product-data/src/storage/sqlite/migrations/0015OpeningVariableState.ts) 仅在升级事务执行一次：移除角色开场白及设定／预设原稿中已退役的独立初值字段；根据保存的变量定义重建各版本静态初值，同时保留动态字典的具体条目，修复“默认值已改、开局仍读旧值”的存量配置。变量版本编号、开场白绑定、其他原稿和现有聊天的绑定、初始／当前／轮次状态不重写。失败整步回滚，重启不会重复整理；表数与视图数保持不变。该步骤保留用于受支持旧数据库的连续升级，不属于正常读写的兼容分支。
