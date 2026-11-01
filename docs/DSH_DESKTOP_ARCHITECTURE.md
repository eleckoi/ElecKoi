# ElecKoi 的 DSH 官方客户端架构基准

状态：当前架构目标。本文记录 ElecKoi 如何对照官方源码；**DSH 官方客户端及其同版本源码是唯一架构基准**，本文不另立一套与其平行的客户端标准。决策见 [ADR 0012](adr/0012-dsh-official-client-baseline.md)。

## 权威来源

当前仓库锁定 `deepseek-ai/deepseek-harness` `0.2.1-rc.5`，提交 `b830ec950faba0a46dda564be3e2d854afed94f1`。核对架构和行为时使用这个**精确提交**的官方源码，而不是浮动的 `master`、旧版文档或 ElecKoi 的临时实现：

- [DSH 架构](https://github.com/deepseek-ai/deepseek-harness/blob/b830ec950faba0a46dda564be3e2d854afed94f1/docs/architecture.zh.md)：Cordis、profile、bundle 与插件树。
- [Web Client 架构](https://github.com/deepseek-ai/deepseek-harness/blob/b830ec950faba0a46dda564be3e2d854afed94f1/docs/subsystems/web-client.zh.md)：Host、Remote、Client model、Slots 与 React。
- [官方 Desktop](https://github.com/deepseek-ai/deepseek-harness/blob/b830ec950faba0a46dda564be3e2d854afed94f1/apps/desktop/README.zh.md)：Electron 壳、受管 profile、Web Host、客户端资源及插件管理。

升级时先锁定同一上游发布批次的提交、包和构建产物，再把上述引用与本仓库的依赖一起更新。不同版本的官方文件不能混作一次架构依据。

## 工作区目录

应用入口位于 `apps/desktop`、`apps/desktop-host`、`apps/web`；公共合同位于 `packages/shared`，现有产品功能插件位于 `packages/client/features`，Host 数据与运行包位于 `packages/host`，Windows 原生源码位于 `native/windows-frame`。后续 Android 工程进入 `apps/android`，使用独立的平台构建和本地数据。目录决策见 [ADR 0028](adr/0028-multi-application-workspace.md) 和 [ADR 0030](adr/0030-package-responsibility-groups.md)。

## 要达到的结构

1. Electron 负责官方桌面客户端所需的窗口、可信来源、受限 preload、本机资源、启动、恢复和更新；不另外发明一套与 DSH Web 应用竞争的客户端框架。
2. DSH 运行时通过官方 profile、bundle 和 patch 层装配。Agent、Session、模型、工具和官方插件由同版本 DSH Host 的正式能力负责。ElecKoi 的扩展优先作为独立的 DSH Host/Agent 插件进入该插件树。
3. 主界面使用官方 Web Client 的模块加载、Cordis 生命周期、Remote、Client model、Slots 和 Renderer。ElecKoi 的页面与角色聊天通过公开的客户端插件合同贡献；第三方插件在其声明的正式扩展位上生效。
4. 新增产品能力默认进入同版本 DSH 的 Host/Client 插件体系。每项能力都必须说明所有者、持久数据来源、公开扩展点、卸载行为和升级验证。需要 Electron 原生能力或产品独有持久数据时，先对照官方 Desktop/Host 的归属方式；无法纳入官方合同的例外必须有具体理由、明确边界和 ADR，不得把现有目录当作永久理由。
5. 不把“使用 Cordis”或“安装后出现在插件列表”当作架构对齐的证明。必须验证实际会话、界面、启停卸载、重启恢复及第三方插件效果。

产品页面的 Vite 入口共用官方 Web Client 已注册的 React、React DOM 与 UI Primitives 实例，只生成导出绑定，不再次打包基础控件及其 CSS。插件专用样式保留官方的层叠顺序；返回按钮、组合按钮等控件的尺寸与内边距由同版本官方组件及样式决定。

角色卡编辑器与预设的搜索框、操作按钮直接使用锁定版本 UI Primitives 的 `Input`、`Button`，边框、圆角及交互状态由组件原样式负责。按产品蓝白主题，编辑器和相关弹窗只将官方主按钮填充、悬停和前景三个主题变量映射为官方 DeepSeek 500、600 与白色；搜索框、次级按钮继续使用官方主题，侧边栏新增图标按钮保留原有外观与尺寸。其他产品样式只保留布局与移动触摸空间。前端编辑工作台位于 ShadowRoot，按实际组件类名复用当前文档已加载的组件规则，主题变量从编辑器继承；控件集合不变时不重复读取样式表，卸载时移除该根的样式节点，不另写一份按钮样式。

插件首页在官方实验性插件分组之后展示「ElecKoi 插件」。产品身份按运行清单声明的完整包名划分，首页固定角色页面、预设、创作工作室、模型选择和联网搜索五项；完整列表沿用官方「更多」、组合包详情与组件配置的导航和卡片。已安装分组仅显示非官方、非产品内置且实际由用户 profile 安装的包，包括安装文件缺失时的诊断项，不按包名前缀判断用户插件归属。此分组由锁定的插件页面补丁实现；官方提供随产品分发的独立分组、固定条目与完整列表导航，并覆盖现有组合声明及开发接口展示后，可移除该补丁，清理条件同列在 `pnpm-workspace.yaml`。

产品壳承接被替换的 `ui-layout` 入口时，其主题 DOM 投影必须与同版本 `theme-presenter.ts` 一致：读取 `ThemeSnapshot.fontSizes` 和 `fontFamilies` 中的 `text / code / terminal`，同步和释放各角色的正式 CSS 变量；不得继续读取旧的单值 `fontSize` 快照字段。全局字体使用官方 `--dsw-font-family`，插件页面与聊天统计保留官方的字体继承和次级字号计算。

PC 原生错误对话框与 Android 原生错误页面提供用户插件恢复入口，独立于无法启动的客户端插件树。壳先停止受管 Host，再调用同版本官方 `sanitizeProfile` 备份当前 profile 的 `cordis.patch.yml`，按各应用的内置组合清单恢复启动，并保留当前启用的官方 `OPTIONAL_BUNDLES`；用户安装的包和产品数据保留。客户端加载失败、Host 失败都必须到达这个原生入口，不能只写日志或要求进入尚未启动的插件中心。

Windows 安装器在应用启动前通过独立原生检查恢复随包可执行映像的正常完整性级别，覆盖主程序、锁定 Electron 运行库、卸载与更新辅助程序。检查器从安装器临时目录运行，只处理安装目录内明确列出的文件，拒绝链接文件与链接资源目录；不重设目录访问控制、不修改上级目录或用户数据，也不关闭浏览器沙箱。写入完整性标记所需的临时权限必须恢复，失败阻断安装完成。此修复不改变 DSH 的工作区授权语义，也不能阻止其他程序在安装后再次改写文件安全属性。

Windows 更新控制和 Electron HTTP 空闲超时采用同一锁定提交的官方 Desktop 实现，位于 `apps/desktop/src/main/modules/updates/dsh`；来源、精确提交和机械导入路径变更记录在该目录的 `provenance.json`，MIT 许可证随桌面资源分发。`UpdateService` 只连接现有更新界面、稳定版渠道与 Host 任务锁，GitHub API Provider 只负责本产品发布及附件定位，不另写下载或安装算法。先创建控制器，再配置发布源，确保元数据、增量和完整下载共用官方 HTTP 执行器。下载校验完成才发布就绪状态，用户确认后才交给 NSIS 安装；安装失败保留已下载文件并释放 Host 任务锁。正常退出不自动安装。升级 DSH 时一起核对这些源码、依赖、来源记录及真实 Electron 网络回归。

## 当前代码与目标的差距

以下是**现状记录，不是新的永久架构规定**：

| 现状 | 与官方基准的关系 | 后续核对 |
| --- | --- | --- |
| `apps/desktop-host` 启动同一个 DSH Web Host，并经官方 SessionController 驱动角色会话 | 已采用官方运行路径 | 按精确版本验证会话和插件生命周期 |
| `@eleckoi/dsh-product-data` 在 DSH Host 打开产品数据库、执行迁移并持有全部领域 Repository | 产品 Client 调用全部使用生成的 Typert Remote；数据库唯一写入权、迁移链与媒体写入均已移交 Host | 保持 Host 单一所有权，禁止把 Repository、迁移或第二套跨端业务协议放回 Main |
| `@eleckoi/dsh-client-*` 在官方 Web Client 运行代内贡献界面和受控产品接入点 | 已使用官方 Client model、Slots、Renderer 与 Session 作用域 | 按公开类型和安装探针持续验证第三方插件行为 |
| `patches/` 对锁定官方包进行最小适配；预设桥接通过官方 `agent/created` 生命周期装配顶层 Session 作用域，并以 `agent/request` waterfall 覆盖当前全局模型；子 Agent 模型只由 DSH 官方子智能体设置决定；Session 信息性记录补丁见 ADR 0019 | 与上游实现紧耦合，补丁清单以 `pnpm-workspace.yaml` 为准 | 对照同版本公开扩展点；可替代则迁移，不能替代则记录例外和升级测试 |
| Runtime Manifest 已将桌面对话主路径标为 Web Host，并区分旧 SDK 兼容组合 | 事实源已校正；仍不能仅凭静态检查认定全体产品插件迁移完成 | 用实际桌面 Host 探针和插件安装探针继续验收 |

聊天正文以 DSH Session 日志为持久来源；SQLite 只保存仍属于 ElecKoi 的关系型产品数据。已经废弃的模型、搜索配置和运行流水表只在版本化迁移中删除，不再有运行时读写路径。

设定工具、变量工具和请求组装通过角色 Host 插件拥有的 `eleckoiRuntimeContexts` 服务共享当前轮次数据，不再生成设定、变量或对话上下文的中转 JSON。聊天历史从官方 Session 的 `deriveMessages()` 取得，按正式消息身份处理重新生成保留的输入；关键词与 EJS 判断继续使用完整的本轮历史范围。设定目录和条件结果留在内存，变量状态替换会使条件缓存失效；设定修改成功提交数据库后才发布内存变化，变量补丁仍在本轮暂存，成功结束后按原有冲突检查提交。

每个已加载的角色 Session 只持有当前轮次，子会话按官方父会话身份共享同一状态；下一轮替换、会话释放、聊天删除和插件卸载会替换或释放对应引用。异步变量处理在提交前核对状态身份，拒绝覆盖期间发生的新修改。Agent 恢复时从产品 Repository 和正式 Session 重建临时上下文，不读取旧中转文件。Session 配置快照仅用于模型、预设和运行归属，不再保存完整设定基线、变量副本或聊天历史；正式数据库快照与官方 Session 日志的持久职责保持不变。

`session-snapshot.mjs` 在配置快照的读写边界剔除旧中转路径、设定基线和变量副本，避免模型配置刷新及子会话继承把旧大字段再次落盘。这是旧运行配置的单向字段清理，不读取旧运行正文、不修改产品数据库或 Session 日志；支持的升级来源全部不再携带这些字段后，按入口的 `RETIRE WHEN` 条件移除该清理。

启动导航由 ElecKoi 的角色聊天和创作工作室负责。共用的 `dsh-client-ui-workspace` 锁定补丁移除启动监听及自动工作区选择、创建与恢复流程，保留官方界面依赖的 `uiWorkspace` 服务、显式会话操作和卸载时的引用释放。PC 与 Android 使用同一补丁，Android 归档直接携带该依赖，不再单独改写导航脚本；升级 DSH 时须回归空数据启动、已有列表更新、显式打开会话和服务卸载。

角色聊天的 Session 引用由 `eleckoiConversations` 在发布已加载消息前准备完成；角色页面通过 `getSessionReference` 直接进入该就绪绑定的官方 Session 作用域，不再次等待异步打开。界面另外持有一份官方显示引用，在切换聊天及同一聊天回退、重新生成的绑定交接期间保留已有界面和输入框，待就绪绑定提交后释放旧引用；退出聊天或卸载页面也释放其引用。Host 删除当前角色或对话并清空目录选择后，页面同步清空本地选择、正文与草稿并关闭所属前端，作废未完成的打开操作；加载中和读取失败仍保留有效的当前选择。回退与重新生成保持原有聊天和 Session ID。模型重试沿正式 `model-retry` 节点的轮次、尝试编号和状态进入 AI 消息的处理过程，正文列表只保留最终失败等必要状态。

右侧栏按官方 `AppFrame` 的归属常驻外壳，独立于主页面的键、错误边界及 Suspense；插件页与聊天往返不重建 `rightbar` 根。各 Session 的右侧栏引用、保留标签和释放继续由官方 `SidebarSessionViews` 管理，不能把右侧栏放进页面加载占位或错误回退中，也不能绕过其引用归属校验。

角色与创作工作室的自定义压缩模板只替换官方压缩请求末尾的摘要指令，保留官方选择的历史消息、工具声明、工具历史、输出上限和取消信号。工具声明仍用于官方请求前缀及历史工具解析；禁止以摘要不执行工具为由删除这些声明。压缩请求仍由同版本官方压缩引擎选区、调用模型、校验及提交摘要；请求失败不能视为压缩成功。

大工具结果沿用同版本官方 `spill-policy` 的 Token 预算与完整文件存储。共用 Host 在官方 `LocalSpillStore` 扩展中为每个结果保存一份小型会话归属凭据，由现有 `eleckoi_read_setting_files`、`eleckoi_read_variables` 和 `eleckoi_call_capability` 的 `result` 参数提供按 UTF-8 字节续读及文字搜索，不新增 AI 工具或独立工具组；完整正文只保存一次，不建立结果索引数据库、不在每次模型请求中追加结果副本。删除聊天时，Host 按正式 Session 日志确定本会话及被一同删除的子会话，使用官方目录编码删除它们的完整结果、归属凭据及结果目录；删除角色卡沿用其关联聊天的同一流程，独立创作工作室会话由自己的删除操作清理。清理失败明确写入错误日志，不阻止聊天或角色卡删除；保留官方启动时按文件年龄回收的机制处理过期残留，不增加清理队列或迁移。结果失效后明确要求重新查询源数据。各入口只读取本工具组在当前会话产生的结果，或正式分叉继承的同组祖先结果；普通业务参数与 result 模式互斥，续读不重复执行原操作；上传文件读取仍使用原有附件授权，不接受结果路径。

该存储扩展由 PC 与 Android 共用的角色 bundle 停用官方 `spill-local` 项后，以独立配置项挂载。锁定版本的 patch `name` 字段只核对目标身份，不能替换插件；直接改写该字段会导致 patch 被跳过。回归须从正式 profile 加载 bundle、运行真实工具及输出策略，再恢复原会话和预设验证续读，不能用测试手动挂载存储服务代替正式装配。

锁定的 `spill-policy` 补丁通过 `pagedTools` 对现有三个入口正式返回的 `kind: tool_result_page` 分页结果免做二次溢出，普通大结果仍按官方预算溢出；`exemptTools` 仅保留原上传文件分页读取。原生工具结果与程序式工具日志使用相同合同。默认预设停止挂载 `compaction-tool-result-pruner`，已生成预设在恢复时移除同一正式插件标识；保留官方正常摘要压缩和用户阈值。此处不能用提高截断上限或在末端重新覆盖内容代替可恢复读取。

旧 Session 缺少空系统开头时，仅在锁定版本的官方 v3 到 v4 相邻迁移中补齐；通过正式校验后发布后继，保留旧文件，删除条件见 [ADR 0026](adr/0026-legacy-session-system-head-migration.md)。单个会话失败不阻断整个桌面 Host 启动。

## 数据放在哪里

联网搜索与抓取使用官方 `ctx.web` 和现有 `web_search`、`web_fetch` 工具。DeepSeek Messages、Search、Fetch 及 HTTP 抓取均沿用锁定官方提供器，只有 Tavily 保留扩展。工具弹窗通过正式插件导航打开 `web-search` 设置项，DeepSeek 密钥和参数只由官方表单及 Settings、Credentials 管理。旧扩展选择在 Loader 挂载前按精确编号退役；原有官方配置与凭据保留。完整输出补丁和退役边界见 [ADR 0039](adr/0039-deepseek-search-fetch.md)。

数据位置由它的权威所有者决定，不以“统一放数据库”为目标：

- DSH 已有正式领域使用 DSH 自己的持久化合同：模型配置使用 settings/profile，密钥使用 `ctx.credentials`，聊天正文使用 Session 日志，bundle 选择使用 profile。
- DSH 的 [`dsh-storage-sqlite`](https://github.com/deepseek-ai/deepseek-harness/blob/b830ec950faba0a46dda564be3e2d854afed94f1/packages/storage/storage-sqlite/README.zh.md) 是 Host 侧的文档型 KV 后端：每个键保存一行 JSON，配合 `ctx.storageDomain` 提供 schema 校验、持久写入和进程内变更事件。简单、独立且按键读写的新增 Host 状态应优先评估这套正式合同。
- ElecKoi 的角色关系、聊天索引等关系型产品数据，在领域迁入 DSH Host 后由 Host Repository 独占 SQLite 写入；Client 和 Electron Main 不直接写。
- 创作项目、导出文件和其他以目录为产品形态的数据保存在用户选择的文件目录；Host 只维护对应文件索引，不复制进 SQLite。
- 页面加载状态、当前选择和生成中的临时状态留在 Client 内存，除非存在明确的重启恢复需求。

同一份配置不同时写入 DSH 与 SQLite。旧 SQLite 字段只在领域迁移时转换到新的权威存储，验证成功后删除旧读写路径和废弃结构。

`dsh-storage-sqlite` 不提供跨表事务、二级索引、多段键或自动迁移。现有 ElecKoi 产品库依赖关系表、外键、排序、搜索和连续版本化迁移，因此不能机械改造成 JSON KV。保留关系型产品库是数据模型选择；它仍由 DSH Host 插件独占，并通过 Typert Remote 对 Client 提供能力。DSH Session 查询索引则继续使用官方 `dsh-session-query-sqlite`，三者各自拥有独立用途和数据库身份。

## 实施顺序

1. 建立逐功能对照：官方 owner、ElecKoi 现有 owner、数据来源、正式扩展点、升级风险和验证用例。当前清单见 [插件归属与接入清单](DSH_PLUGIN_MIGRATION.md)。
2. 校正过期的 Runtime Manifest、检查器和实施文档，让它们验证实际的 Web Host 与客户端插件组合。该项事实源已校正，后续仍需继续扩充动态验收。
3. 持续复核官方包补丁与 Agent 创建/恢复适配等高耦合点；可以使用公开扩展点时移除补丁，仍需补丁时保留精确版本校验和运行探针。
4. Main 只保留窗口、资源协议、更新与 Host 进程管理；新业务进入 DSH Host/Client，现有数据库由 `@eleckoi/dsh-product-data` 独占。
5. 以真实官方/第三方插件验收安装、启用、界面效果、停用、卸载、会话恢复和上游批次升级。当前临时插件探针已覆盖安装、中文元数据、真实角色卡编辑入口、重启、停用、启用和卸载。

当前 `pnpm check:architecture` 检查目录、进程边界，并阻止已删除的 Desktop Gateway 业务桥回流；它仍不能代替真实 Host、Session 与插件生命周期验收。旧的 [桌面架构说明](history/ARCHITECTURE.md) 和私有知识库中的《ElecKoi Desktop 架构最终总纲》仅作历史索引。

## 0.2.1-rc.5 对齐

共用 Host、Web Client、SDK、Session format、LLM 适配器、插件组合和运行清单统一锁定到 DSH `0.2.1-rc.5`，提交 `b830ec950faba0a46dda564be3e2d854afed94f1`。Cordis 4.0.5、pi-ai 1.1.0 和 Electron 44.7.0 与该批次的官方依赖合同一致，保持精确锁定。19 个 DSH 补丁按新版实际发布包重新生成，退役条件仍在 `pnpm-workspace.yaml` 各入口维护；没有新增产品数据迁移。

思考展示直接使用新版官方实现。`conversation.chat.reasoning.body` 的 `rawText` 保留模型原文，`text` 是官方处理后的展示文本；`conversation.chat.reasoning.content` 工厂渲染调用方传入的 Markdown。产品没有额外复制一套处理规则，也不把展示处理写回 Session。上游同时修复溢出标签提示与 MCP／ACP 标准输出中的诊断日志。合同见同提交的 [思考 Body 属性升级指南](https://github.com/deepseek-ai/deepseek-harness/blob/b830ec950faba0a46dda564be3e2d854afed94f1/docs/upgrade-guide/v0.2.1-rc.4/reasoning-body-props/guide.zh.md)。

Android 只同步共用源码版本和锁定清单，不代表已重新生成运行资源、APK 或完成真机验收。

Android 的 JSONL 发布和附件适配只更新版本及来源提交，实际安装包依赖中的两个源码摘要与既有锁定摘要一致；没有新增归档改写。已有适配仍按 [Android 运行时说明](../native/android-runtime/README.md) 的 `RETIRE WHEN` 条件保留：上游完成应用沙箱中的独占发布、目标冲突、失败恢复与持久化验收，不再需要硬链接替换或应用目录边界适配后，删除对应锁和替换。DSH 产品补丁分别在上游提供各入口注明的等价公开能力并通过对应行为回归后退役。

本轮完成 339 个文件、2374 项 JS／TS 回归。初次失败的 7 个文件涉及旧配图依赖断言、缺少公开 `get()` 的模拟上下文，以及 Electron 下只读附件的同步清理；对齐当前可选插件合同和异步清理后，对应 49 项复核通过。完整桌面源码构建、Electron SQLite 校验、实际 Host 启动／重开／重新生成，以及构建后的角色、预设、脚本、前端和异步 EJS 客户端探针通过。未生成安装包或发布更新。

## 0.2.1-rc.3 对齐记录

当前批次同步 Cordis 4.0.5、DSH 0.2.1-rc.3、pi-ai 1.1.0 与官方 Desktop 使用的 Electron 44.7.0；依赖均锁定精确版本。角色聊天将根视图、正文 flow 与用户／输出图片分开的公开 Slots 映射到产品座位，保留官方滚动和 motion 合同。Remote 的进程内调用必须提供显式 Peer，并装配官方 RemoteAccessService。桌面及 Android Host 的启动自检使用短生命周期的 owner Peer，检查完成即释放；不改变网络调用的身份与授权。新版 `working_directory` 工具随现有工作区工具组启停，不新增工具组。

插件目录和安装详情采用官方 official、availability、installTarget、source 字段；不以包名前缀猜测官方身份。停用、安装和重启沿用官方生命周期。已停止发布的 schedule bundle、invariants 和 in-process subagent driver 不再声明。产品组合按用户要求停用 schedule 服务与 ui-schedule，不提供自动化任务入口、编辑、触发和 AI 提醒工具。

既有输入重新生成、忽略型产品记录、旧 Session 系统头恢复、完整工具续读和采样参数的版本补丁保留，精确退役条件记在 pnpm-workspace.yaml 的每个补丁入口。SDK 的打开已存在会话使用官方显式 resume，删除旧 create 失败后自动 resume 的补丁。不新增产品数据库迁移，不改写用户日志来绕过官方重复调用校验。

生成的 Client Remote 元数据使用官方 `remote-info` 纯运行模块，随产品客户端入口一起构建，不要求浏览器模块加载器另外提供该子路径。通用视图与专用角色 flow 分别拥有自己的子 Slots，避免重复声明。

新版官方 API-key 模型目录按凭据状态提供条目；ElecKoi 的模型读取入口明确报告缺少密钥，不把无条目视作读取成功。读取不写入设置或凭据。

上一批次（0.2.1-rc.2）验证记录：完整 JS／TS 回归 306 个文件、2006 项通过；后续角色 flow 归属修正通过 6 项专项回归，实际 Electron 的官方网页搜索页面、深浅主题、12 个官方可选组合启停及冷启动恢复、桌面更新流程通过。实际 Host 已验证原生存储、冷会话模型选择及角色／聊天删除，普通角色聊天发送、失败恢复、冷启动和连续重新生成检查通过；富消息完整切换未新增验收结论。Android 仅同步共用源码和锁定清单，不代表更新归档、APK 或真机验收。

0.2.1-rc.3 新增的插件入口通过官方 entry-customization 和公开 actions Slots 接入侧栏、角色聊天与创作工作室；右侧栏直接使用官方新版。产品侧栏的子槽位由侧栏所属 renderSlot 调用，聊天标题沿用各自 Session 投影座位。未新增数据库迁移；已有精确版本补丁随整批依赖重新核对并应用。

本批次实际桌面检查覆盖三处更多菜单、创建插件草稿不自动发送、普通聊天失败恢复／冷启动／连续重新生成及右侧栏、工作室连续新建与插件页往返。显式 layout.selectPanel(null) 按官方合同打开 conversation，初始产品消息页继续由独立的 messages 选择提供；工作室只切换中央内容，右侧栏常驻。32 项正式组合与完整结果续读集成通过；UI 分组先通过 164 个文件，余下 3 个文件的旧 Hook fixture 更新后 14 项复核通过，后续导航 9 项、工作室 5 项通过。未生成安装包或 Android 资源。
