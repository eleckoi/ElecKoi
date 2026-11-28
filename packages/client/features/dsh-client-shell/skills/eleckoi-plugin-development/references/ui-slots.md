<!-- Generated from docs/plugins/ui-slots.md; run pnpm generate:plugin-docs. -->

# 界面插槽

界面插槽是 DSH Client 提供的可组合 UI 接入点。父组件声明 slot 并传入 owner props，插件向 slot 注册 React 组件。插件只获得合同声明的数据和操作，不需要复制页面，也不应查询页面 DOM。

当前登记的 UI Slot 及数量以自动生成的[开发接口总表](api-reference.md)为准。

安卓插件页保留锁定 DSH 的完整标题、说明、响应式按钮及滚动收缩；`plugins.header.leading` 仅在同一标题中提供返回入口，调用当前移动路由的返回操作。该入口由既有精确版本插件页补丁暴露，不查询页面 DOM 或复制官方页头。补丁同时将页头测量还原为布局像素，避免移动抽屉缩放动画影响固定坐标；测量通知按帧合并并随页面卸载取消。官方提供同类入口及缩放安全测量后，连同原产品分组能力一起删除该补丁、登记和锁引用。

## 四种 Slot kind

| kind | 插件中心 mode | 行为 |
| --- | --- | --- |
| `single` | `replace` | 同一位置选择一个占位组件；高优先级项可以覆盖低优先级 fallback |
| `list` | `append` | 按注册顺序/显式顺序渲染多个条目 |
| `keyed` | `register` | 每个唯一 key 注册一个组件，例如一个主页面 |
| `chain` | `replace` | 每项用 `select(owner)` 判断是否接管；选中项收到 `matched`，可渲染 `matched.fallback` 包装原界面 |

`package.json` 中的 `mode` 是目录说明；真实 kind 由 `@deepseek-ai/dsh-client-ui-slots` 的 `SlotMap` 决定。

## 注册示例

### 包装 chain slot

```js
ctx.slots.inject('eleckoi.character.editor.card', () => ctx.slots.register({
  name: 'eleckoi.character.editor.card',
  priority: 10,
  select: owner => owner?.characterId ? owner : null,
  registrant: 'example-plugin'
}, ({ matched }) => React.createElement(
  React.Fragment,
  null,
  matched.fallback,
  React.createElement('button', { onClick: matched.onSave }, '保存')
)))
```

chain 必须提供 `select`。返回 `null` 表示本插件不接管本次渲染；返回 owner 或派生值表示选中。不要无条件吞掉 `fallback`，除非插件明确要替换完整区域。

### 向 list slot 增加条目

```js
ctx.slots.inject('eleckoi.roleplay.message.actions', () => ctx.slots.register({
  name: 'eleckoi.roleplay.message.actions',
  id: 'example-copy-action',
  order: 20,
  registrant: 'example-plugin'
}, ({ messageId }) => React.createElement('button', {
  type: 'button',
  onClick: () => copyMessage(messageId)
}, '复制')))
```

### 注册 keyed 主页面

```js
ctx.slots.inject('main', () => ctx.slots.register({
  name: 'main',
  key: 'example',
  registrant: 'example-plugin'
}, ExamplePage))
```

通常还要向 `sidebar.panellist` 注册同 ID 的导航入口。key 必须唯一。

在 PC 上，官方 DSH 接口注册的插件页面入口由创作工作区的 DSH 侧栏呈现，位于「新会话」和「工作区」之间。`order` 决定排列顺序，官方「自动化任务」的 `order` 为 `10`。在 Android 上，插件入口仍由产品导航呈现。

在 PC 工作区侧栏取消固定插件入口后，可以在同一栏的「更多」打开它，或把它固定回原位置。固定状态由 DSH 管理，在侧栏插件重新加载时重置。插件贡献菜单操作时使用 `sidebar.panellist.actions` 提供的 `entries`、`onOpen`、`onPinnedChange` 和 `onDismiss`。最左侧图标导航的「插件」打开 ElecKoi 插件中心。

## 类型使用

DSH 官方 slot 类型由对应官方 Client 包的 `./client` 入口提供。ElecKoi 业务 slot 的 owner 类型由各包的 `./slots` 入口提供：

```ts
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { CharacterEditorCardOwner } from '@eleckoi/dsh-client-characters/slots'

type CardProps = PropsRuntime<'eleckoi.character.editor.card'>
```

导入 `./slots` 会把该包的 SlotMap 声明合并到 DSH 类型系统。不要在插件中复制 owner interface；升级时复制类型不会得到编译错误。

## 桌面壳与设置入口（15）

| Slot ID | kind / scope | owner 类型或注册数据 | 用途 |
| --- | --- | --- | --- |
| `sidebar.brand.mark` | single / root | `SidebarBrandMarkOwnerProps` | 品牌图标 |
| `sidebar.brand.name` | single / root | `SidebarBrandNameOwnerProps` | 品牌名称 |
| `sidebar.toggle.badge` | single / root | 空 owner | 收起按钮附加内容 |
| `sidebar.panellist` | list / root | `SidebarPanelIconOwnerProps`；options 使用 `id/order/label` | 主导航入口 |
| `sidebar.workspaces` | single / root | `SidebarSectionOwnerProps` | 工作区区域 |
| `sidebar.settings` | single / root | `SidebarSettingsOwnerProps` | 设置入口 |
| `sidebar.footer.action` | list / root | `SidebarFooterActionOwnerProps` | PC 创作工作区侧栏底部，沿 DSH 传入实际 `wide`；Android 沿现有抽屉 |
| `sidebar` | single / root | `SidebarOwnerProps` | 替换整列侧栏 |
| `main` | keyed / root | options 使用 `key` | 注册主页面 |
| `rightbar` | single / root | `RightbarOwnerProps` | 右侧面板 |
| `shell.overlay` | list / root | 空 owner | 全局浮层；组件自行恢复 pointer events |
| `shell.leading` | single / root | 空 owner | 窗口左上前置区域 |
| `settings.section` | list / root | `SettingsSectionOwnerProps`；options 使用 `id/order/label` | 设置分区 |
| `settings.general.item` | list / root | `SettingsGeneralItemOwnerProps`；options 使用 `id/order` | 通用设置行 |
| `eleckoi.roleplay` | chain / root | `{ component, props }` | 包装或替换整个角色聊天页面 |

官方类型入口：

- `@deepseek-ai/dsh-client-ui-sidebar/client`
- `@deepseek-ai/dsh-client-ui-layout/client`
- `@deepseek-ai/dsh-client-ui-settings/client`

`eleckoi.roleplay` 是 ElecKoi 根页面接入点；普通聊天扩展优先使用下方更窄的消息或输入区 slot，减少与其他插件冲突。

## 角色与角色卡入口（23）

类型入口：`@eleckoi/dsh-client-characters/slots`

| Slot ID | kind / scope | owner 类型 | 关键数据与操作 |
| --- | --- | --- | --- |
| `eleckoi.character.page.list` | chain / root | `CharacterListOwner` | PC 主角色页的完整列表及其操作 |
| `eleckoi.character.page.profile` | chain / root | `CharacterProfileOwner` | PC 与安卓角色详情、开始聊天、编辑和新建首个角色 |
| `eleckoi.character.editor.card` | chain / root | `CharacterEditorCardOwner` | 角色资料、dirty/saving/error、change/save/cancel |
| `eleckoi.character.editor.cast` | chain / root | `Pick<CharacterEditorCardOwner, 'fallback' \| 'characterId'>` | 登场角色编辑区 |
| `eleckoi.character.editor.openings` | chain / root | `CharacterEditorConfigurationOwner` | 主开场白、备用开场白、变量版本绑定 |
| `eleckoi.character.editor.lore` | chain / root | `CharacterEditorConfigurationOwner` | 设定库编辑状态与保存控制器 |
| `eleckoi.character.editor.variables` | chain / root | `CharacterEditorConfigurationOwner` | 变量编辑状态与保存控制器 |
| `eleckoi.character.editor.regex` | chain / root | `CharacterEditorConfigurationOwner` | 正则编辑状态与保存控制器 |
| `eleckoi.character.editor.scripts` | chain / root | `CharacterEditorConfigurationOwner` | 脚本库编辑状态与保存控制器 |
| `eleckoi.character.editor.frontend` | chain / root | `Omit<CharacterEditorConfigurationOwner, 'configuration'>` | 前端项目编辑、预览和启用 |
| `eleckoi.character.editor.dynamic` | chain / root | `CharacterEditorConfigurationOwner` | 分支设定编辑状态与保存控制器 |
| `eleckoi.character.manager` | chain / root | `CharacterManagerOwner` | PC 独立管理器的整块内容与刷新、分组、导入、导出、删除操作 |
| `eleckoi.character.editor.assets` | chain / root | `CharacterEditorAssetsOwner` | 包装或替换角色卡内的素材库 |
| `eleckoi.character.editor.navigation` | chain / root | `CharacterEditorNavigationOwner` | 包装或替换角色编辑器的分区导航 |
| `eleckoi.character.editor.toolbar` | chain / root | `CharacterEditorToolbarOwner` | 包装或替换角色编辑器顶部工具栏 |
| `eleckoi.character.library.list` | chain / root | `CharacterLibraryListOwner` | 包装或替换安卓角色库的瀑布流 |
| `eleckoi.character.library.item` | chain / root | `CharacterLibraryItemOwner` | 包装或替换列表中的角色行或卡片 |
| `eleckoi.character.library.search` | chain / root | `CharacterLibrarySearchOwner` | 扩展角色列表或管理器的搜索控件 |
| `eleckoi.character.library.sort` | chain / root | `CharacterLibrarySortOwner` | 扩展原有角色排序菜单及触发按钮 |
| `eleckoi.character.library.groups` | chain / root | `CharacterLibraryGroupsOwner` | 扩展角色列表及管理器的分组控件 |
| `eleckoi.character.library.selection` | chain / root | `CharacterLibrarySelectionOwner` | 扩展选中多张角色卡时的操作控件 |
| `eleckoi.character.library.menu.actions` | list / root | `CharacterLibraryMenuOwner` | 向角色库的新建、导入、排序或批量操作菜单追加菜单项 |
| `eleckoi.character.library.item.menu.actions` | list / root | `CharacterLibraryItemMenuOwner` | 向当前角色的操作菜单追加菜单项 |
| `eleckoi.character.library.group.menu.actions` | list / root | `CharacterLibraryGroupMenuOwner` | 向角色分组右键菜单追加菜单项 |

PC 和安卓共用编辑器的分区、素材库、导航及工具栏。工具栏的 `onSave()` 调用当前分区的保存流程，导航的 `onSelect()` 沿用未保存提醒。安卓的返回操作与原工具栏走同一守卫。

`character.page.list` 用于 PC 主角色页，`character.library.list` 用于安卓瀑布流。单卡、分组或菜单插件通过 `surface` 区分 `pc-sidebar`、`pc-manager` 和 `android`。安卓单卡操作菜单位于角色详情。排序槽位用于已有排序控件的 PC 管理器和安卓角色库。批量槽位按当前模式提供选中 ID 与原确认操作。

配置编辑区通过 `setController()` 接入统一保存和放弃流程。插件替换编辑器时应报告 dirty 状态。

## 聊天列表入口（1）

类型入口：`@eleckoi/dsh-client-conversations/slots`

| Slot ID | kind / scope | owner 类型 | 关键数据与操作 |
| --- | --- | --- | --- |
| `eleckoi.conversation.list` | chain / root | `ConversationListOwner` | 搜索词、聊天列表、置顶、打开、隐藏和跳转角色聊天 |

## 模型配置与插件列表

| Slot ID | kind / scope | 公开类型入口 | 可用内容与操作 |
| --- | --- | --- | --- |
| `eleckoi.model.page.list` | chain / root | `ModelPageListOwner`，`@eleckoi/dsh-client-models/client` | 模型配置页侧栏。提供按当前搜索词过滤的配置摘要、选中 ID、加载就绪状态和可新建的提供商。使用 `onQueryChange`、`onSelect`、`onCreate` 和 `onRequestDelete` 调用原有流程。删除先打开确认。列表只传配置摘要。 |
| `eleckoi.plugin.page.list` | chain / root | `PluginPageListOwner`，`@eleckoi/dsh-client-shell/client` | PC 插件中心左栏。提供按当前搜索词过滤的条目、当前选中键和加载状态。通过 `onSelect(kind, id)` 打开 DSH 原详情，`onAdd()` 打开原安装入口。选中键格式为 `item:<id>` 或 `package:<id>`，空字符串表示未选中。 |

两个都是产品列表的 `chain` 插槽。将 `owner.fallback` 渲染进组件可以保留原列表，也可以使用同一个 owner 提供的数据和回调呈现自己的列表。插件自身的配置表单继续使用官方 `plugins.bundle.config`。

## 用户资料入口（1）

| Slot ID | 类型入口 | owner 类型 | 关键数据与操作 |
| --- | --- | --- | --- |
| `eleckoi.persona.editor` | `@eleckoi/dsh-client-persona/slots` | `PersonaEditorOwner` | 用户名、头像、保存和头像管理 |

模型提供商、profile、API 地址和密钥使用 DSH 官方模型设置页，不提供第二个 ElecKoi 模型编辑 Slot。`eleckoiModels` 只把 DSH 官方模型目录投影给聊天和预设的模型选择器。

## Agent 预设入口（16）

类型入口：`@eleckoi/dsh-client-presets/slots`

| Slot ID | kind / scope | owner 类型 | 用途 |
| --- | --- | --- | --- |
| `eleckoi.preset.editor.profile` | chain / root | `PresetProfileEditorOwner` | 名称、分组与基础资料 |
| `eleckoi.preset.editor.introduction` | chain / root | `PresetEditorOwner` | 说明与开场内容 |
| `eleckoi.preset.editor.prompts` | chain / root | `PresetEditorOwner` | 提示词配置 |
| `eleckoi.preset.editor.tools` | chain / root | `PresetEditorOwner` | 工具策略 |
| `eleckoi.preset.editor.regex` | chain / root | `PresetEditorOwner` | 预设正则 |
| `eleckoi.preset.editor.scripts` | chain / root | `PresetEditorOwner` | 预设脚本 |
| `eleckoi.preset.manager` | chain / root | `PresetManagerOwner` | PC 独立管理器的整块内容、分组、选择、刷新、导入和导出 |
| `eleckoi.preset.page.list` | chain / root | `PresetPageListOwner` | 包装或替换主预设页的列表或安卓预设库的卡片区 |
| `eleckoi.preset.page.preview` | chain / root | `PresetPagePreviewOwner` | 包装或替换 PC 主预设页的预设预览 |
| `eleckoi.preset.library.item` | chain / root | `PresetLibraryItemOwner` | 包装或替换列表中的预设行或卡片 |
| `eleckoi.preset.library.search` | chain / root | `PresetLibrarySearchOwner` | 扩展主预设页或管理器的搜索控件 |
| `eleckoi.preset.library.groups` | chain / root | `PresetLibraryGroupsOwner` | 扩展预设列表及管理器的分组控件 |
| `eleckoi.preset.library.selection` | chain / root | `PresetLibrarySelectionOwner` | 扩展选中多项预设时的操作控件 |
| `eleckoi.preset.library.menu.actions` | list / root | `PresetLibraryMenuOwner` | 向新建、导入、导出或批量操作菜单追加菜单项 |
| `eleckoi.preset.library.item.menu.actions` | list / root | `PresetLibraryItemMenuOwner` | 向当前预设的操作菜单追加菜单项 |
| `eleckoi.preset.library.group.menu.actions` | list / root | `PresetLibraryGroupMenuOwner` | 向预设管理器的分组菜单追加菜单项 |

PC 独立预设编辑器和安卓预设编辑页共用编辑分区槽位。列表 owner 带当前用途与实际可见的预设。PC 常驻预览提供当前预设和原编辑、启用操作。PC 独立管理器和安卓预设库的批量工具栏在进入批量模式后渲染。

角色和预设的 `chain` 槽位都提供 `fallback`，包装时可以把原控件放回。搜索控件在 PC 使用 `value` 和 `onChange()`，在安卓使用 `onOpen()` 打开共用搜索。分组 owner 用 `allGroup` 表示「全部」的实际值。菜单 `list` 槽位在原菜单打开后渲染，追加项使用 `role="menuitem"`，执行动作前可调用 `onDismiss()`。单项或分组菜单提供当前目标，禁止从选中项或列表顺序推断菜单目标。

## 角色聊天入口

类型入口：`@eleckoi/dsh-client-roleplay/slots`

| Slot ID | kind / scope | owner 类型 | 用途 |
| --- | --- | --- | --- |
| `eleckoi.roleplay.message.content` | chain / session | `RoleplayMessageContentOwner` | 包装或替换消息正文 |
| `eleckoi.roleplay.message.editor` | single / session | `RoleplayMessageEditorOwner` | 替换点击铅笔打开的消息编辑区 |
| `eleckoi.roleplay.message.actions` | list / session | `RoleplayMessageOwner & { messageId: string }` | 消息旁操作 |
| `eleckoi.roleplay.message.after` | list / session | `RoleplayMessageOwner` | 消息下方内容 |
| `eleckoi.roleplay.conversation.input.menu.actions` | list / session | `{ onDismiss: () => void }` | 在底部三横线菜单第一层的「更多」之前追加操作 |
| `eleckoi.roleplay.header.menu` | list / session | `{ onOpen: () => void }` | 在底部菜单第二层「更多」追加操作，`onOpen` 打开自定义背景 |
| `eleckoi.roleplay.conversation.composer.bar` | single / session-maybe | `ComposerBarOwnerProps & ComposerBridgeOwner` | 替换整体输入框 |
| `eleckoi.roleplay.conversation.composer` | chain / session | `ComposerChainProps & ComposerBridgeOwner` | 按会话状态临时接管输入区 |
| `eleckoi.roleplay.conversation.input.left` | list / session | 空 owner | 左侧工具区追加控件 |
| `eleckoi.roleplay.conversation.input.right` | list / session | 空 owner | 模型选择器附近追加控件 |
| `eleckoi.roleplay.conversation.input.overlay` | list / session | 空 owner | 输入框内浮层 |
| `eleckoi.roleplay.conversation.input.dock` | list / session | `InputZone` | 输入框上方内容 |
| `eleckoi.roleplay.conversation.input.attachments` | single / session-maybe | `ComposerAttachmentsOwnerProps` | 原生附件展示与添加、移除、重试操作 |
| `eleckoi.roleplay.conversation.input.permission` | single / session | `InputControlOwnerProps` | 权限控件 |
| `eleckoi.roleplay.conversation.input.plan` | single / session | `InputControlOwnerProps` | 计划模式控件 |
| `eleckoi.roleplay.conversation.input.model` | single / session | `InputControlOwnerProps` | 供输入框皮肤调用的模型位置 |
| `eleckoi.roleplay.conversation.input.activity` | single / session | `InputActivityOwnerProps` | 可展开的工具栏活动区 |
| `eleckoi.roleplay.conversation.composer.dock` | list / session | 空 owner | 输入框下方追加内容 |
| `eleckoi.roleplay.conversation.approval.detail` | single / session | `Record<string, unknown>` | 审批接管组件内的详情 |
| `eleckoi.roleplay.conversation.plan-review.actions` | list / session | 空 owner | 计划审核接管组件内的操作 |
| `eleckoi.roleplay.trajectory.images` | single / session | `MessageImagesOwnerProps` | 轨迹详情图片预览 |
| `eleckoi.roleplay.trajectory` | single / session | `ConvViewOwnerProps & { component? }` | 轨迹视图与正式 Session 投影 |

`RoleplayMessageOwner` 提供 `conversationId`、产品消息 ID、DSH message ID 和角色；正文 owner 另外提供 `content` 与 `streaming`。输入区使用官方 Session 输入服务，不另传产品草稿或 `setInput`。`session-maybe` 表示组件支持没有选中会话的状态，插件必须处理会话相关服务暂不可用的情况。所有会话插槽都随当前 DSH Session 绑定，插件不得把一个 Session 的状态放进无 key 的全局单例。

主菜单插件使用 `ctx.slots.inject` 和稳定 `id` 注册，建议用官方 `MenuItemButton` 提供图标、标签和键盘操作。执行动作前调用 `onDismiss()`，聚焦会回到原触发按钮。

消息编辑器插件使用 `draft` 和 `onDraftChange(text)` 呈现和更新同一份草稿，保存时调用 `onSave()`，取消时调用 `onCancel()`。已有编辑权限、消息归属和保存流程由会话控制。没有匹配的编辑器时使用内置编辑器，停用插件也会切回内置编辑器并显示当前草稿。可编辑开场白也调用该槽位，`messageId` 可能为 `null`。

当前只有一套官方 InputBar。原生“＋”、命令弹层和文件/图片上传由官方组件负责；产品通过 `leadingAccessory`、`dockAccessory` 装配扮演菜单和统计，模型选择使用原生 `input.model` 座位。`composer.bar` 皮肤接收这些参数及 `renderSlot`，可自行安排其位置。`modelAccessory` 是可选替换入口，产品会话不再传入独立模型浮层。审批详情与计划审核操作同样由相应接管组件调用。

官方 `conversation.*` 插槽贡献会投影到对应产品位置，保留注册优先级、注入与卸载行为。同一贡献只注册一处。输入框下方只保留 `conversation.composer.dock` 对应的一套入口，官方默认 `stats` 不投影；产品统计与其他插件内容共用下方区域。

模型名称扩展沿官方 `conversation.input.model.label` 投影到 `eleckoi.roleplay.conversation.input.model.label` 与 `eleckoi.creator-studio.model.label`。两者共用官方 `ModelLabelOwner`，只传提供商身份、模型目录项、显示位置和选中状态；模型入口、当前模型与选项行共同调用。产品只在 `placement: trigger` 的文字入口复用既有模型图标，使用所选模型 ID 和配置身份，不改变路由、能力或提供商分组身份。菜单当前值与选项行不加模型图标，保留目录名称和官方 Tag，第三方标签贡献继续优先于产品默认标签。手机沿官方输入区的文字／图标收纳，文字入口隐藏时其内部模型图标一并隐藏，不增加第二个收纳图标。提供商图标经补丁的 `conversation.input.model.provider.label` 放在分组标题旁，准确使用提供商身份，不根据各个模型名称识别该提供商。选择、搜索、推理等级和手机收纳由官方模型选择器负责，模型和推理等级选中即生效，不再使用独立保存步骤。停用或卸载标签插件后恢复目录名称。

输入菜单中的参数沿同版模型选择器补丁声明的 `conversation.input.model.parameters` 接入，随原模型座位投影到两种产品会话。参数编辑仅修改草稿，点击官方「保存」按钮才通过现有模型目录服务写入，「取消」丢弃该模型草稿；停输和失焦不写入。所有字段共用 `registerLeaveGuard`：关闭、返回或切换菜单页存在修改时显示「保存／不保存／取消」，仅保存成功后继续原离开动作；失败保留草稿并允许重试，校验失败禁止保存，取消离开继续编辑，全部还原后不提醒。自定义接口可在模型能力中明确声明支持的推理档位，Host 以声明更新官方目录；未声明能力时不虚构推理选项。官方提供对应提供商标题、根菜单扩展点、输入框键盘行为及关闭前草稿检查后，按 `pnpm-workspace.yaml` 的退役条件改用该扩展点并删除补丁，不保留两套菜单实现。

## 冲突与优先级

- `single` 和 `keyed` 的同一 cell 会按优先级选出有效项；崩溃项可让位给下一项。
- `list` 会保留多个条目，使用稳定 `id` 和 `order`。
- `chain` 按升序 `priority` 调用 `select`，第一个非 `null` 的条目获选。
- 一个组件只能渲染它在 `children` 中声明并拥有的子 slot。
- 注册未声明 slot、重复声明 child、错误 scope 或缺少 chain `select` 会在装载时失败。

这些规则由 DSH SlotRegistry 执行。不要在插件里另建 slot 总线或 React portal 注册表。
