<!-- 此文件由 scripts/generate-plugin-developer-docs.mjs 生成，请勿手工编辑。 -->

# ElecKoi 插件开发接口总表

本表从桌面运行清单与各 bundle 的 `package.json.eleckoi.developerInterfaces` 生成。DSH 基准为 `0.2.0-rc.2`，提交 `c1b47e41fcd54d20a0f061df28683bfc29ee24e5`。

当前共 **16 个 bundle、92 个开发接口**：56 个界面插槽、16 个服务、0 个事件、1 个贡献点、19 个 Remote 合同。

接口标题和说明用于插件中心展示；真实调用合同以对应类型导出和实现为准。完整参数、返回值和数据字段见 [Client 参考](api-client.md)、[Host 参考](api-host.md) 与 [Remote 调用声明](api-remote.md)。使用方法见 [界面插槽](ui-slots.md)、[服务接口](services.md) 与 [能力贡献](contributions.md)。

## 汇总

| Bundle | 界面插槽 | 服务 | 事件 | 贡献点 | Remote | 合计 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `@eleckoi/dsh-client-characters` | 8 | 1 | 0 | 0 | 0 | 9 |
| `@eleckoi/dsh-client-character-configuration` | 0 | 3 | 0 | 0 | 0 | 3 |
| `@eleckoi/dsh-client-conversations` | 1 | 1 | 0 | 0 | 0 | 2 |
| `@eleckoi/dsh-client-creator-studio` | 0 | 1 | 0 | 0 | 0 | 1 |
| `@eleckoi/dsh-client-display-preferences` | 0 | 1 | 0 | 0 | 0 | 1 |
| `@eleckoi/dsh-client-models` | 0 | 1 | 0 | 0 | 0 | 1 |
| `@eleckoi/dsh-client-persona` | 1 | 1 | 0 | 0 | 0 | 2 |
| `@eleckoi/dsh-client-presets` | 6 | 1 | 0 | 0 | 0 | 7 |
| `@eleckoi/dsh-client-web-search` | 0 | 1 | 0 | 0 | 0 | 1 |
| `@eleckoi/dsh-client-shell` | 15 | 1 | 0 | 0 | 0 | 16 |
| `@eleckoi/dsh-client-roleplay` | 25 | 1 | 0 | 0 | 0 | 26 |
| `@eleckoi/dsh-client-tavern-shared` | 0 | 1 | 0 | 0 | 0 | 1 |
| `@eleckoi/dsh-compatibility-host` | 0 | 0 | 0 | 0 | 1 | 1 |
| `@eleckoi/dsh-product-api` | 0 | 1 | 0 | 0 | 18 | 19 |
| `@eleckoi/dsh-runtime` | 0 | 1 | 0 | 0 | 0 | 1 |
| `@eleckoi/dsh-web-search-tavily` | 0 | 0 | 0 | 1 | 0 | 1 |

## `@eleckoi/dsh-client-characters`

展示角色列表和资料，提供角色操作入口。

来源：`packages/dsh-client-characters/package.json`

| ID | 名称 | 类型 | 关系 | 模式 | 作用域 | 说明 | 公开成员/所属合同 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `eleckoiCharacters` | 角色目录服务 | 服务 | 提供 | `call` | `client` | 读取并维护角色目录，支持角色、分组、导入与导出操作。 | `getSnapshot`、`subscribe`、`refresh`、`create`、`update`、`select`、`saveGroups`、`delete`、`prepareImport`、`commitImport`、`discardImport`、`exportCharacters` |
| `eleckoi.character.page.list` | 角色列表区域 | 界面插槽 | 提供 | `replace` | `root` | 包装或替换角色列表。 | — |
| `eleckoi.character.page.profile` | 角色资料区域 | 界面插槽 | 提供 | `replace` | `root` | 包装或替换角色资料展示。 | — |
| `eleckoi.character.editor.card` | 角色基础资料编辑 | 界面插槽 | 提供 | `replace` | `root` | 扩展角色名称、头像和基础资料编辑。 | — |
| `eleckoi.character.editor.lore` | 设定库编辑 | 界面插槽 | 提供 | `replace` | `root` | 扩展角色设定库编辑。 | — |
| `eleckoi.character.editor.variables` | 变量编辑 | 界面插槽 | 提供 | `replace` | `root` | 扩展角色变量编辑。 | — |
| `eleckoi.character.editor.regex` | 正则编辑 | 界面插槽 | 提供 | `replace` | `root` | 扩展角色正则规则编辑。 | — |
| `eleckoi.character.editor.dynamic` | 分支设定编辑 | 界面插槽 | 提供 | `replace` | `root` | 扩展分支设定编辑。 | — |
| `eleckoi.character.manager` | 角色卡管理器 | 界面插槽 | 提供 | `replace` | `root` | 包装或替换角色卡导入、导出和批量管理界面。 | — |

## `@eleckoi/dsh-client-character-configuration`

读取、保存并更新设定库、变量、正则和分支设定。

来源：`packages/dsh-client-character-configuration/package.json`

| ID | 名称 | 类型 | 关系 | 模式 | 作用域 | 说明 | 公开成员/所属合同 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `eleckoiSettingLibraries` | 设定库服务 | 服务 | 提供 | `call` | `client` | 读取、保存和订阅角色设定库及对话设定。 | `getSnapshot`、`subscribe`、`read`、`readUntracked`、`save`、`saveViewState`、`getConversationSnapshot`、`readConversations`、`saveConversation`、`resetConversation`、`saveConversationVersion` |
| `eleckoiVariables` | 角色变量服务 | 服务 | 提供 | `call` | `client` | 读取、保存和订阅角色变量配置。 | `getSnapshot`、`subscribe`、`read`、`readUntracked`、`save`、`saveViewState` |
| `eleckoiRegexRules` | 角色正则服务 | 服务 | 提供 | `call` | `client` | 读取、保存、导入、导出并测试角色正则。 | `getSnapshot`、`subscribe`、`read`、`readUntracked`、`save`、`import`、`export`、`test` |

## `@eleckoi/dsh-client-conversations`

管理聊天列表、历史消息和当前聊天状态。

来源：`packages/dsh-client-conversations/package.json`

| ID | 名称 | 类型 | 关系 | 模式 | 作用域 | 说明 | 公开成员/所属合同 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `eleckoiConversations` | 聊天记录服务 | 服务 | 提供 | `call` | `client` | 读取聊天列表、消息、轨迹和当前生成状态。 | `getSnapshot`、`subscribe`、`getDetailsSnapshot`、`subscribeDetails`、`getChatSnapshot`、`subscribeChat`、`getTimelineSnapshot`、`subscribeTimeline`、`getStreamSnapshot`、`subscribeStream`、`refresh`、`create`、`open`、`pageOlder`、`observeRequestPreviews`、`readRequestPreview`、`openTimeline`、`closeTimeline`、`uploadFile`、`prepareNativeInput`、`send`、`regenerate`、`cancelRequest`、`readSelection`、`saveSelection`、`readModelSelection`、`readTrajectory`、`exportArchive`、`importArchive`、`revealFile`、`selectModel`、`selectOpening`、`updateOpening`、`rememberSession`、`preferredSession`、`forgetSession`、`readAuthorState`、`replaceAuthorVariableState`、`editMessage`、`deleteMessagesFrom`、`delete`、`getModelSelectionSnapshot`、`subscribeModelSelection` |
| `eleckoi.conversation.list` | 聊天列表 | 界面插槽 | 提供 | `replace` | `root` | 包装或替换聊天列表。 | — |

## `@eleckoi/dsh-client-creator-studio`

管理创作工作室项目目录。

来源：`packages/dsh-client-creator-studio/package.json`

| ID | 名称 | 类型 | 关系 | 模式 | 作用域 | 说明 | 公开成员/所属合同 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `eleckoiCreatorStudio` | 创作项目服务 | 服务 | 提供 | `call` | `client` | 读取、创建、删除创作项目并订阅项目列表变化。 | `getSnapshot`、`subscribe`、`refresh`、`create`、`delete`、`selectDirectory` |

## `@eleckoi/dsh-client-display-preferences`

通过 DSH Settings 保存 ElecKoi 的显示偏好。

来源：`packages/dsh-client-display-preferences/package.json`

| ID | 名称 | 类型 | 关系 | 模式 | 作用域 | 说明 | 公开成员/所属合同 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `eleckoiDisplayPreferences` | 显示偏好服务 | 服务 | 提供 | `call` | `client` | 读取和更新侧栏、会话列表与聊天显示偏好。 | `getSnapshot`、`subscribe`、`refresh`、`updateUi`、`setChatDisplay` |

## `@eleckoi/dsh-client-models`

通过 DSH Settings、Credentials 和 Remote 管理模型配置并提供模型选择。

来源：`packages/dsh-client-models/package.json`

| ID | 名称 | 类型 | 关系 | 模式 | 作用域 | 说明 | 公开成员/所属合同 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `eleckoiModels` | 模型目录服务 | 服务 | 提供 | `call` | `client` | 读取模型目录、管理官方 profile 和独立密钥、发现模型并测试工具调用。 | `getSnapshot`、`subscribe`、`refresh`、`save`、`deleteConfig`、`deleteProvider`、`discover`、`testConnection`、`revealApiKey` |

## `@eleckoi/dsh-client-persona`

管理用户名称、头像和角色扮演身份。

来源：`packages/dsh-client-persona/package.json`

| ID | 名称 | 类型 | 关系 | 模式 | 作用域 | 说明 | 公开成员/所属合同 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `eleckoiPersona` | 用户资料服务 | 服务 | 提供 | `call` | `client` | 读取用户资料、订阅变化并主动刷新。 | `getSnapshot`、`subscribe`、`refresh`、`save` |
| `eleckoi.persona.editor` | 用户资料编辑 | 界面插槽 | 提供 | `replace` | `root` | 包装或替换用户资料编辑器。 | — |

## `@eleckoi/dsh-client-presets`

管理预设内容、提示词、工具策略和正则。

来源：`packages/dsh-client-presets/package.json`

| ID | 名称 | 类型 | 关系 | 模式 | 作用域 | 说明 | 公开成员/所属合同 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `eleckoiPresets` | Agent 预设服务 | 服务 | 提供 | `call` | `client` | 读取预设目录与详情，并通过正式数据入口保存预设。 | `getSnapshot`、`subscribe`、`getDetailSnapshot`、`subscribeDetail`、`read`、`save`、`create`、`import`、`export`、`setActive`、`createGroup`、`renameGroup`、`assignGroup`、`deleteGroup`、`delete`、`refresh` |
| `eleckoi.preset.editor.profile` | 预设基础资料 | 界面插槽 | 提供 | `replace` | `root` | 扩展预设名称、分组和基础资料编辑。 | — |
| `eleckoi.preset.editor.introduction` | 预设说明 | 界面插槽 | 提供 | `replace` | `root` | 扩展预设说明和开场内容编辑。 | — |
| `eleckoi.preset.editor.prompts` | 提示词编辑 | 界面插槽 | 提供 | `replace` | `root` | 扩展预设提示词编辑。 | — |
| `eleckoi.preset.editor.tools` | 工具配置 | 界面插槽 | 提供 | `replace` | `root` | 扩展预设工具策略编辑。 | — |
| `eleckoi.preset.editor.regex` | 预设正则 | 界面插槽 | 提供 | `replace` | `root` | 扩展预设正则规则编辑。 | — |
| `eleckoi.preset.manager` | 预设管理器 | 界面插槽 | 提供 | `replace` | `root` | 包装或替换预设导入、导出和批量管理界面。 | — |

## `@eleckoi/dsh-client-web-search`

通过 DSH Settings、Credentials 与 Remote 管理联网搜索配置。

来源：`packages/dsh-client-web-search/package.json`

| ID | 名称 | 类型 | 关系 | 模式 | 作用域 | 说明 | 公开成员/所属合同 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `eleckoiWebSearch` | 联网搜索设置服务 | 服务 | 提供 | `call` | `client` | 读取并维护搜索提供商、Tavily 设置和凭据状态。 | `getSnapshot`、`subscribe`、`refresh`、`update`、`saveAndTest`、`test`、`removeKey` |

## `@eleckoi/dsh-client-shell`

提供主窗口、导航、设置和插件中心。

来源：`packages/dsh-client-shell/package.json`

| ID | 名称 | 类型 | 关系 | 模式 | 作用域 | 说明 | 公开成员/所属合同 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `layout` | 桌面布局服务 | 服务 | 提供 | `call` | `client` | 切换主面板并控制桌面导航和侧栏。 | `selectPanel`、`beginNavigation`、`toggleSidebar`、`openRightbar`、`closeRightbar` |
| `sidebar.brand.mark` | 品牌图标 | 界面插槽 | 提供 | `replace` | `root` | 提供侧边栏品牌图标。 | — |
| `sidebar.brand.name` | 品牌名称 | 界面插槽 | 提供 | `replace` | `root` | 提供侧边栏品牌名称。 | — |
| `sidebar.toggle.badge` | 侧栏收起按钮内容 | 界面插槽 | 提供 | `replace` | `root` | 提供侧栏收起按钮附加内容。 | — |
| `sidebar.panellist` | 导航入口 | 界面插槽 | 提供 | `append` | `root` | 向侧边栏增加主导航入口。 | — |
| `sidebar.workspaces` | 工作区入口 | 界面插槽 | 提供 | `replace` | `root` | 提供侧边栏工作区入口。 | — |
| `sidebar.settings` | 设置入口 | 界面插槽 | 提供 | `replace` | `root` | 提供侧边栏设置入口。 | — |
| `sidebar.footer.action` | 侧栏底部操作 | 界面插槽 | 提供 | `append` | `root` | 向侧边栏底部增加操作。 | — |
| `sidebar` | 侧边栏 | 界面插槽 | 提供 | `replace` | `root` | 替换桌面侧边栏。 | — |
| `main` | 主面板 | 界面插槽 | 提供 | `register` | `root` | 按面板键注册桌面主页面。 | — |
| `rightbar` | 右侧面板 | 界面插槽 | 提供 | `replace` | `root` | 提供桌面右侧面板。 | — |
| `shell.overlay` | 全局浮层 | 界面插槽 | 提供 | `append` | `root` | 在桌面界面上方增加浮层。 | — |
| `shell.leading` | 窗口前置区域 | 界面插槽 | 提供 | `replace` | `root` | 提供桌面窗口前置内容。 | — |
| `settings.section` | 设置分区 | 界面插槽 | 提供 | `append` | `root` | 向设置页增加分区。 | — |
| `settings.general.item` | 通用设置项 | 界面插槽 | 提供 | `append` | `root` | 向通用设置增加设置项。 | — |
| `eleckoi.roleplay` | 角色聊天页面 | 界面插槽 | 提供 | `replace` | `root` | 包装或替换角色聊天页面。 | — |

## `@eleckoi/dsh-client-roleplay`

提供角色聊天界面，并将角色配置接入 DSH 对话运行。

来源：`packages/dsh-client-roleplay/package.json`

| ID | 名称 | 类型 | 关系 | 模式 | 作用域 | 说明 | 公开成员/所属合同 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `eleckoi.roleplay.chat` | 角色对话视图 | 界面插槽 | 提供 | `replace` | `session` | 以官方 ChatView 承接角色消息座位、历史分页、导航与阅读位置。 | — |
| `eleckoi.roleplay.chat.node` | 角色对话节点 | 界面插槽 | 提供 | `replace` | `session` | 按正式 ChatNodeKind 替换角色对话的节点呈现。 | — |
| `eleckoi.roleplay.chat.images` | 角色对话图片 | 界面插槽 | 提供 | `replace` | `session` | 呈现角色对话中使用正式授权加载器读取的消息图片。 | — |
| `eleckoi.roleplay.chat.before` | 角色对话开场区域 | 界面插槽 | 提供 | `replace` | `session` | 呈现 Session 消息之前的产品开场内容，不创建 Session 事件。 | — |
| `eleckoi.roleplay.chat.pending-input` | 角色对话发送回显 | 界面插槽 | 提供 | `replace` | `session` | 呈现官方等待正式 Session 消息接替的输入回显。 | — |
| `eleckoi.roleplay.message.content` | 消息正文 | 界面插槽 | 提供 | `replace` | `session` | 包装或替换角色聊天消息正文。 | — |
| `eleckoi.roleplay.message.actions` | 消息操作 | 界面插槽 | 提供 | `append` | `session` | 在消息旁增加操作。 | — |
| `eleckoi.roleplay.message.after` | 消息下方 | 界面插槽 | 提供 | `append` | `session` | 在消息下方增加内容。 | — |
| `eleckoi.roleplay.conversation.header.corner` | 对话标题栏角落 | 界面插槽 | 提供 | `replace` | `session` | 在新建对话按钮右侧承接官方会话标题栏角落控件。 | — |
| `eleckoi.roleplay.conversation.composer.bar` | 整体输入框 | 界面插槽 | 提供 | `replace` | `session-maybe` | 替换当前官方输入框，可读取扮演菜单、模型选择器和统计区的装配参数。 | — |
| `eleckoi.roleplay.conversation.composer` | 输入区临时接管 | 界面插槽 | 提供 | `replace` | `session` | 按当前会话的审批或计划等状态临时接管输入区，释放后恢复原输入框。 | — |
| `eleckoi.roleplay.conversation.input.left` | 输入框左侧 | 界面插槽 | 提供 | `append` | `session` | 在当前官方输入框的左侧工具区追加控件。 | — |
| `eleckoi.roleplay.conversation.input.right` | 输入框右侧 | 界面插槽 | 提供 | `append` | `session` | 在当前官方输入框的模型选择器附近追加控件。 | — |
| `eleckoi.roleplay.conversation.input.overlay` | 输入框浮层 | 界面插槽 | 提供 | `append` | `session` | 在当前官方输入框内追加浮层。 | — |
| `eleckoi.roleplay.conversation.input.dock` | 输入框上方 | 界面插槽 | 提供 | `append` | `session` | 在输入框上方追加内容，并读取当前会话和输入状态。 | — |
| `eleckoi.roleplay.conversation.input.attachments` | 附件展示 | 界面插槽 | 提供 | `replace` | `session-maybe` | 替换原生文件和图片附件的展示，继续使用官方添加、移除和上传重试操作。 | — |
| `eleckoi.roleplay.conversation.input.permission` | 权限控件 | 界面插槽 | 提供 | `replace` | `session` | 替换输入框中的权限控件。 | — |
| `eleckoi.roleplay.conversation.input.plan` | 计划控件 | 界面插槽 | 提供 | `replace` | `session` | 替换输入框中的计划模式控件。 | — |
| `eleckoi.roleplay.conversation.input.model` | 输入框皮肤模型位 | 界面插槽 | 提供 | `replace` | `session` | 供输入框皮肤调用的模型控件位置；默认输入框使用 ElecKoi 模型选择器。 | — |
| `eleckoi.roleplay.conversation.input.activity` | 输入框活动区 | 界面插槽 | 提供 | `replace` | `session` | 替换输入框右侧活动区，展开时占用工具栏空间。 | — |
| `eleckoi.roleplay.conversation.composer.dock` | 输入框下方 | 界面插槽 | 提供 | `append` | `session` | 在输入框下方的产品统计区域追加内容；默认官方统计不重复显示。 | — |
| `eleckoi.roleplay.conversation.approval.detail` | 审批详情 | 界面插槽 | 提供 | `replace` | `session` | 在输入区被审批组件接管时替换审批详情。 | — |
| `eleckoi.roleplay.conversation.plan-review.actions` | 计划审核操作 | 界面插槽 | 提供 | `append` | `session` | 在输入区被计划审核组件接管时追加操作。 | — |
| `eleckoi.roleplay.trajectory.images` | 轨迹图片预览 | 界面插槽 | 提供 | `replace` | `session` | 提供轨迹详情中的图片预览。 | — |
| `eleckoi.roleplay.trajectory` | 角色聊天轨迹 | 界面插槽 | 提供 | `replace` | `session` | 替换角色聊天轨迹视图，读取正式 Session 轨迹。 | — |
| `eleckoiRequestPreviews` | 运行期间请求预览 | 服务 | 提供 | `call` | `host` | 在实际发送位置捕获请求，运行期间共用未变化的消息内容；不写入日志、数据库或投影缓存。 | `capture`、`list`、`read`、`stream`、`forget`、`close` |

## `@eleckoi/dsh-client-tavern-shared`

来源：`packages/dsh-client-tavern-shared/package.json`

| ID | 名称 | 类型 | 关系 | 模式 | 作用域 | 说明 | 公开成员/所属合同 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `eleckoiTavernShared` | 应用共享插件运行时 | 服务 | 提供 | `call-and-listen` | `client` | 应用持有的 JS 共享环境，供脚本、聊天 HTML、插件面板互通，并接入同一宿主协议。 | `getSnapshot`、`subscribe`、`openPanel`、`registerChatUi`、`capturePresentation` |

## `@eleckoi/dsh-compatibility-host`

来源：`packages/dsh-compatibility-host/package.json`

| ID | 名称 | 类型 | 关系 | 模式 | 作用域 | 说明 | 公开成员/所属合同 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `eleckoiAuthorPlugins` | 共同插件宿主 | Remote 合同 | 提供 | `call-and-listen` | `host` | 通过同一 DSH Host 调用已公布的插件能力、读取能力清单及监听真实宿主变更；Android 与 Electron 共用。 | `capabilities`、`invoke`、`changes` |

## `@eleckoi/dsh-product-api`

ElecKoi 产品能力的 DSH Host Remote 接口。

来源：`packages/dsh-product-api/package.json`

| ID | 名称 | 类型 | 关系 | 模式 | 作用域 | 说明 | 公开成员/所属合同 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `eleckoiConversationLifecycle` | 聊天流程参与 | 服务 | 提供 | `call` | `host` | Host 插件注册生成前准备、保存后收尾及消息回退处理，回调完成后继续原流程。 | `register` |
| `eleckoiCompatibilityRemote` | 酒馆兼容产品能力 | Remote 合同 | 提供 | `call-and-listen` | `host` | 通过现有产品服务调用兼容命令、读取能力清单并订阅变更。 | `capabilities`、`invoke`、`changes` |
| `eleckoiSystem` | 桌面运行状态 | Remote 合同 | 提供 | `call` | `host` | 读取当前 ElecKoi DSH Host 的架构版本与 Remote 协议状态。 | `status` |
| `eleckoiCharactersRemote` | 角色数据 | Remote 合同 | 提供 | `call` | `host` | 通过 DSH Host 读取和维护角色、分组及角色卡导入导出。 | `list`、`create`、`update`、`select`、`saveGroups`、`delete`、`export`、`prepareImport`、`commitImport`、`discardImport` |
| `eleckoiCharacterChangesRemote` | 角色数据变更通知 | Remote 合同 | 提供 | `listen` | `host` | 通过 DSH Remote stream 通知角色、分组和当前角色发生变化。 | `changes` |
| `eleckoiPersonaRemote` | 用户资料数据 | Remote 合同 | 提供 | `call` | `host` | 通过 DSH Host 读取并保存用户名称与头像资料。 | `read`、`save` |
| `eleckoiPersonaChangesRemote` | 用户资料变更通知 | Remote 合同 | 提供 | `listen` | `host` | 通过 DSH Remote stream 通知用户资料发生变化。 | `changes` |
| `eleckoiCharacterConfiguration` | 角色配置数据 | Remote 合同 | 提供 | `call` | `host` | 通过 DSH Host 读取和保存设定库与变量配置。 | `readSettingLibrary`、`saveSettingLibrary`、`saveSettingLibraryViewState`、`readConversationSettingLibraries`、`saveConversationSettingLibrary`、`resetConversationSettingLibrary`、`saveConversationSettingLibraryVersion`、`readVariableConfig`、`saveVariableConfig`、`saveVariableConfigViewState`、`readRegexRules`、`saveRegexRules`、`importRegexRules`、`exportRegexRules`、`testRegexRule` |
| `eleckoiCharacterConfigurationChanges` | 角色配置变更通知 | Remote 合同 | 提供 | `listen` | `host` | 通过 DSH Remote stream 通知设定库、变量、正则和 Agent 预设变化。 | `changes` |
| `eleckoiAgentPresetsRemote` | Agent 预设数据 | Remote 合同 | 提供 | `call` | `host` | 通过 DSH Host 管理 Agent 预设、分组及导入导出。 | `catalog`、`read`、`save`、`create`、`import`、`export`、`setActive`、`createGroup`、`renameGroup`、`assignGroup`、`deleteGroup`、`delete` |
| `eleckoiCreatorStudioRemote` | 创作项目数据 | Remote 合同 | 提供 | `call` | `host` | 通过 DSH Host 读取、创建和删除创作工作室项目。 | `list`、`create`、`delete` |
| `eleckoiCreatorStudioChangesRemote` | 创作项目变更通知 | Remote 合同 | 提供 | `listen` | `host` | 通过 DSH Remote stream 通知创作项目目录发生变化。 | `changes` |
| `eleckoiDisplayPreferencesRemote` | 显示偏好配置 | Remote 合同 | 提供 | `call` | `host` | 通过 DSH Host 读取和保存显示偏好，并将本地壁纸写入媒体库。 | `read`、`updateUi`、`setChatDisplay` |
| `eleckoiConversationModelsRemote` | 全局模型选择 | Remote 合同 | 提供 | `call` | `host` | 读取并选择全部聊天下一轮共同使用的模型。 | `current`、`select` |
| `eleckoiConversationsRemote` | 聊天记录目录 | Remote 合同 | 提供 | `call` | `host` | 通过 DSH Host 读取聊天目录与角色关联元数据；消息正文、分页和运行状态由 DSH Session 协议提供。 | `list`、`details`、`requestPreview`、`projectDisplay`、`variableTimeline`、`authorState`、`replaceVariableState`、`exportArchive`、`importArchive`、`revealFile`、`create`、`delete`、`rename`、`fork`、`completeGroupRound`、`preparePrompt`、`waitForGeneration`、`editMessage`、`deleteMessagesFrom`、`regenerateMessage`、`selectOpening`、`updateOpening`、`startRegeneration` |
| `eleckoiConversationChangesRemote` | 聊天变更通知 | Remote 合同 | 提供 | `listen` | `host` | 通过 DSH Remote stream 通知聊天目录和消息投影发生变化；消息正文仍由 DSH Session 协议读取。 | `changes` |
| `eleckoiRequestPreviewsRemote` | 运行期间请求目录 | Remote 合同 | 提供 | `listen` | `host` | 订阅本次 Host 运行期间实际发起的请求；目录不含请求正文，关闭后不恢复。 | `requestPreviews` |
| `eleckoiWebSearchRemote` | 联网搜索配置 | Remote 合同 | 提供 | `call` | `host` | 通过 DSH Host 选择搜索提供商并验证 Tavily 连接。密钥由 DSH Credentials 独立管理。 | `selection`、`select`、`testTavily` |
| `eleckoiModelsRemote` | 模型连接测试 | Remote 合同 | 提供 | `call` | `host` | 通过官方 LLM 适配器测试工具调用，不创建聊天或 Session。 | `testConnection`、`discoverModels`、`revealApiKey` |

## `@eleckoi/dsh-runtime`

通过正式会话日志修改消息、回退轮次和重新生成。

来源：`packages/dsh-runtime/package.json`

| ID | 名称 | 类型 | 关系 | 模式 | 作用域 | 说明 | 公开成员/所属合同 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `eleckoiSessionEditor` | 消息编辑服务 | 服务 | 提供 | `call` | `host` | 通过正式 DSH 会话日志修改消息并回退轮次。 | `editMessage`、`rewind`、`mutateTimeline` |

## `@eleckoi/dsh-web-search-tavily`

ElecKoi Tavily search provider for the DSH web capability

来源：`packages/dsh-web-search-tavily/package.json`

| ID | 名称 | 类型 | 关系 | 模式 | 作用域 | 说明 | 公开成员/所属合同 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `dsh.web.search-provider:tavily` | Tavily 搜索提供器 | 贡献点 | 接入 | `register` | `host` | 向 DSH Web 注册 Tavily 联网搜索实现。 | `registerSearchProvider` |

## 完整性规则

- 桌面清单中的每个 ElecKoi bundle 必须声明 `eleckoi.developerInterfaces`。
- 接口 ID 在整个桌面组合内必须唯一。
- manifest 变化后必须运行 `pnpm generate:plugin-docs` 更新本表。
- `pnpm check:plugin-docs` 与 `pnpm build` 会拒绝过期或不完整的总表。

