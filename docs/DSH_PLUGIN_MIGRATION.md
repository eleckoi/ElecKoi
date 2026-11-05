# ElecKoi 插件归属与接入清单

本清单对照仓库锁定的 DSH `0.2.1-rc.5`（`b830ec950faba0a46dda564be3e2d854afed94f1`）。架构基准见 [DSH 桌面架构](DSH_DESKTOP_ARCHITECTURE.md)，当前跨端与数据边界决策见 [ADR 0017](adr/0017-dsh-remote-replaces-desktop-gateway.md)。

## 只有一个对外插件系统

面向用户和第三方开发者的安装、启用、停用、卸载与重启恢复统一使用 DSH 官方 profile、bundle、插件管理器和 Web Client 插件机制。ElecKoi 不再提供第二个插件商店、第二种安装包或另一套外部插件生命周期。

`apps/desktop/src/main/host/DesktopHost.ts` 中的 Cordis 装配只负责桌面壳、受管 DSH Host 进程、资源协议、窗口和更新，不是供用户安装扩展的插件系统。产品数据库与 Repository 在受管 DSH Host 的 `@eleckoi/dsh-product-data` 插件中运行。第三方扩展不能直接访问 SQLite、Electron 或内部服务；它通过 DSH Remote、Cordis 服务与 Client Slots 获得受控入口。

## 插件中心如何显示

插件中心沿用 DSH 官方插件管理页面和安装流程，左侧目录分为三组：

| 分组 | 内容 |
| --- | --- |
| DSH 官方插件 | 官方目录标记为 `official` 的包和官方固定插件项 |
| ElecKoi 内置插件 | ElecKoi 随客户端提供的角色、预设、模型、用户资料、角色聊天等能力、Tavily 组合包，以及本版本由 ElecKoi 打过兼容补丁的 DSH 包 |
| 用户安装插件 | 用户通过 DSH 插件管理器安装的其他 bundle，包括第三方 ElecKoi 扩展 |

DSH 设置中的官方“内置插件”页继续保留一份完整运行清单，统一展示官方、ElecKoi 和第三方插件在全局及各 Agent 预设中的实际装配状态。这里的数量是运行模块数量，不等于用户可安装的插件数量。安装、启用、停用、卸载以及按来源分类仍统一从主侧栏“插件”进入。

列表逐项显示实际登记的 DSH bundle，不再把不同插件拼成虚构的功能入口。包名、版本、启用状态及组件清单直接来自官方插件管理器。锁定批次中由 ElecKoi 修改的 DSH 包继续使用中文适配名称。

详情使用官方 SegmentedTabs 分别显示“运行组件”和“开发接口”，默认运行组件。组件数量来自真实包行，运行状态和启停操作来自官方 PluginManagerFace；不再把 Client 等执行位置当成运行状态。开发接口来自各 bundle 的 `package.json.eleckoi.developerInterfaces`，由官方 PluginManager 校验并通过现有 Remote 状态传给 Client。界面不再维护手写接口表。

开发接口按真实合同区分为 UI Slot、Cordis 服务、事件、远程接口和能力接入，并显示作用域、使用方式及公开成员。角色配置中的设定库、变量和正则服务，消息编辑的 Host 服务，以及 Tavily 对 DSH Web 搜索提供方注册点的接入都会按实际声明显示。详细决策见 [ADR 0016](adr/0016-plugin-developer-interface-catalog.md)。

当前十三个核心产品插件与一个可选 Tavily 插件统一登记为正式 bundle。核心组件通过官方管理器既有 protectedModules 规则保护，禁止停用或卸载破坏桌面运行链；Tavily 和用户插件继续使用原有权限。这个精确版本补丁及升级复核要求见 [ADR 0015](adr/0015-dsh-built-in-bundle-registration.md)。已有 profile 只补登记一次，保留用户配置和插件选择。

## 当前内置插件

同一锁定版本的官方可选 bundle 由桌面 Host 安装依赖直接携带，按当前 `OPTIONAL_BUNDLES` 合同显示在插件页，初始不选入 profile。启停继续通过官方插件管理器保存和装配。自动化任务已不属于官方可选 bundle，产品组合另按用户要求停用 schedule 与 ui-schedule，不提供自动化入口或任务触发。

| 中文名称 | 实际插件包 | 职责 |
| --- | --- | --- |
| 角色页面 | `@eleckoi/dsh-client-characters` | 角色目录、列表、资料与角色卡编辑入口 |
| 角色配置 | `@eleckoi/dsh-client-character-configuration` | 设定库、变量、正则和分支设定的读取保存 |
| 聊天记录 | `@eleckoi/dsh-client-conversations` | 对话目录、状态与历史读取 |
| 创作工作室 | `@eleckoi/dsh-client-creator-studio` | 创作项目目录、创建与删除 |
| 模型选择 | `@eleckoi/dsh-client-models` | DSH 官方模型目录投影与对话模型选择入口 |
| 用户资料 | `@eleckoi/dsh-client-persona` | 用户资料读取与编辑入口 |
| 联网搜索设置 | `@eleckoi/dsh-client-web-search` | 搜索与抓取方式、Tavily／DeepSeek Settings 与 Credentials 的 Client model；Host 入口挂载共用 DeepSeek Search、Fetch 提供器 |
| 显示偏好 | `@eleckoi/dsh-client-display-preferences` | DSH Settings 中的侧栏、聊天列表、消息显示与全局壁纸偏好 |
| Agent 预设 | `@eleckoi/dsh-client-presets` | 预设读取、页面与编辑入口 |
| 桌面界面 | `@eleckoi/dsh-client-shell` | root、main、sidebar、settings 与产品区域合同 |
| 角色聊天 | `@eleckoi/dsh-client-roleplay` | 聊天界面、Session 绑定、Host 预设桥接与聊天区域合同 |
| 消息编辑 | `@eleckoi/dsh-runtime` | 实际组件 `eleckoi-session-edit`，修改消息与回退轮次 |
| 产品数据接口 | `@eleckoi/dsh-product-api` | 生成的 Host/Client Typert Remote 合同 |
| Tavily 联网搜索 | `@eleckoi/dsh-web-search-tavily` | 联网搜索工具与配置 |

设定库、变量配置和用户资料已经由 DSH Host 持有数据服务，并通过生成的 Typert Remote 合同读写现有数据库；创作项目的文件索引与项目目录也由 Host Remote 读写。模型配置已经迁入 DSH：提供商与 profile 由官方 settings 管理，密钥由 `ctx.credentials` 管理，Client 只读取官方模型目录并保存当前模型选择。旧模型 Gateway、SQLite 表、连接测试和本地参数编辑器已经删除。联网搜索方式保存在 profile，Tavily 配置使用官方 Settings，密钥使用官方 Credentials；旧搜索 Gateway、Main 仓库和 SQLite 配置表已删除。按用户决定，旧 Tavily 配置不导入 DSH，升级后重新填写。

当前正式能力只有 DSH LLM 目录中的对话模型。旧界面曾列出绘画提供商，但没有对应的 Host 运行能力，现已随旧模型编辑器删除。将来增加图片、语音或其他模型时，应建立独立的 DSH Host bundle 和设置命名空间，通过通用 `ctx.credentials` 保存密钥，并按需要公开 Remote 或 Contribution；不得把它们伪装成 LLM 目录条目，也不得恢复产品 SQLite 密钥表。

## 已开放的真实开发接口

除下表的界面接入点外，插件中心还会列出可注入调用的 Cordis 服务：`eleckoiCharacters`、`eleckoiSettingLibraries`、`eleckoiVariables`、`eleckoiRegexRules`、`eleckoiConversations`、`eleckoiCreatorStudio`、`eleckoiModels`、`eleckoiPersona`、`eleckoiPresets`、`eleckoiWebSearch`、`eleckoiDisplayPreferences`、`layout` 和 `eleckoiSessionEditor`。具体公开成员以对应 bundle 的 manifest 为准；未列入目录的 Gateway、SQLite、Electron 或内部协作服务不构成第三方接口。

这些接入点位于用户实际使用的页面。没有第三方扩展时显示原来的 ElecKoi 界面；扩展停用或卸载后自动恢复原界面。

| 产品区域 | 接入点 |
| --- | --- |
| 角色列表与角色简介 | `eleckoi.character.page.list`、`eleckoi.character.page.profile` |
| 角色卡编辑 | `eleckoi.character.editor.card`、`.lore`、`.variables`、`.regex`、`.dynamic` |
| 角色卡管理器 | `eleckoi.character.manager` |
| 用户资料编辑 | `eleckoi.persona.editor` |
| 对话列表 | `eleckoi.conversation.list` |
| 预设编辑 | `eleckoi.preset.editor.profile`、`.introduction`、`.prompts`、`.tools`、`.regex` |
| 预设管理器 | `eleckoi.preset.manager` |
| 角色聊天 | `eleckoi.roleplay.message.*`、`eleckoi.roleplay.conversation.*`、`eleckoi.roleplay.trajectory*` |
| DSH 原生区域 | `main`、`sidebar.*`、`settings.section`、`shell.overlay` 等同版本官方 Slots |

角色卡、用户资料和预设编辑入口会把当前数据、保存状态以及受控的修改、保存、取消等操作交给扩展。扩展可以包装原界面、替换该区域，或在保存前调整提交内容；用户资料写入使用 `ctx.remote.eleckoiPersona.save()`，其他领域按迁移状态使用各自的公开操作。模型配置使用 DSH 官方设置页，不另开 ElecKoi 编辑 slot。聊天扩展使用 Session 作用域，随当前 DSH Session 创建和释放。

公开类型分别位于各包的 `./slots` 导出。开发说明见 [ElecKoi 插件开发](plugins/README.md)。

## 已验证的安装生命周期

`node scripts/probe-dsh-desktop-plugin-install.mjs` 每次在系统临时目录创建一个最小扩展，不在仓库保留演示插件。它通过 DSH 官方插件管理器完成：

1. 安装本地 bundle；
2. 读取中文名称；
3. 把客户端代码接到真实的角色卡编辑入口；
4. 重启后确认仍然启用；
5. 停用、重新启用；
6. 卸载并确认不再安装。

内置 bundle 使用 `node scripts/probe-eleckoi-built-in-bundles.mjs` 验证正式登记、真实运行状态、核心保护与 Tavily 启停持久化。桌面 Host 升级行为由 `node scripts/probe-dsh-desktop-plugin-host.mjs` 验证。

## 保留在 Electron Main 的职责

Electron Main 只保留窗口、更新、本机资源协议、受限 preload，以及受管 DSH Host 进程的启动和故障处理。SQLite 迁移、启动校验与产品领域仓库已经迁入 DSH Host。

这些壳职责不能成为第三方扩展入口。旧 Desktop Gateway、业务 Preload bridge 与 `window.eleckoi` 已删除。新增对外扩展能力必须进入同版本 DSH Host/Client 的公开插件体系，并使用 Remote、Connection 数据协议或官方 Client Slots。

## 仍需随上游升级复核的部分

仓库仍有少量同版本 DSH 补丁和 Agent 创建/恢复桥接。它们有自动检查和运行探针，但会在升级 DSH 时逐项复核。是否存在这些适配代码不改变插件平台的归属：外部插件仍只由 DSH 管理，产品数据仍只有一个写入来源。
