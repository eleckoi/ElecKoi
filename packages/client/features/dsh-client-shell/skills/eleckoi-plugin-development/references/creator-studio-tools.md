<!-- Generated from docs/plugins/creator-studio-tools.md; run pnpm generate:plugin-docs. -->

# AI 创作工作室工具

工作室在主窗口中打开，左侧直接装配官方 Workspace 会话浏览器；新建按明确选择的工作区建立 Session，未指定时沿用当前工作区及官方活动时间语义。角色扮演会话及其子会话继续与创作列表隔离。插件菜单保留官方两项，「创建你的插件」在工作室准备官方草稿，不发送消息。

会话菜单在「归档会话」下方提供「删除会话」，使用官方菜单与确认弹窗。确认后关闭该会话及关联子会话的运行句柄，清理日志目录、运行快照、工具结果、工作区成员、置顶与归档记录；仅删除不再被其他会话引用的图片附件，保留工作区项目文件。清理失败时保留日志与错误提示供重试，不把不完整清理报告为成功。工作区中的普通旧会话也可删除，角色对话及其后代仍由角色消息列表管理。

创作会话始终采用当前全局创作预设，通过同一个 `eleckoi-creator-active` 身份在轮次边界重组，保留原 Session、历史、工作目录及编辑目标；不会改为每个对话固定选择四种模式。组合以锁定版本声明的 `cordis` 创造模式为基础，加入产品创作能力与上传文件读取，保留插件管理、技能、文件、终端和子代理能力，并遵循当前预设的工具组配置。权限入口使用官方三项，作用范围遵循各工具的正式权限合同。

默认创作预设同时启用「本地工作区」「任务与工作流」「多代理协作」「联网搜索」「插件发现」与 ElecKoi「创作能力」。自定义创作预设继续遵循各自的工具选择，不因进入工作室强制打开编程工具；Windows 与其他平台的命令工具仍沿用官方启用条件。

PC 空会话显示居中的新会话首页，共用原来的官方输入框与工作区选择器。是否为空以官方 Session 的 `blank` 状态为准；选择工作区后可以提前创建空会话及日志，首次对话轮次开始才进入正文和视图标签。首页的预设菜单只列出 `purpose=creator` 的产品预设，选择仍修改全局创作预设。同工作区重复新建会复用当前空会话，创建新会话通过正式 `workspaceId` 挂入工作区，不以工作目录相同推断成员归属。切换工作区沿各会话保存各自的输入草稿。

工具可以新建空角色并设为编辑目标；已有角色的资料与原稿工具绑定工作室选定的角色。开发插件不要求选择角色。共享全局配置不要求先选择角色；创作工具不开放预设修改，presetPrompts 只读当前创作预设。角色不是工作室要扮演的身份。角色扮演的分支设定和聊天变量不通过这些原稿工具修改。

工作室的请求配置和工具执行只作用于所属 DSH 预设作用域中的 Agent。共享模型事件先按正式作用域链核对请求归属，其他角色会话和工作室预设直接继续原请求。会话属于当前作用域时，再校验其正式创作预设绑定；绑定异常明确报错，不套用其他会话的预设或目标。

工作室子代理沿用 DSH 的正式创建与恢复流程。独立创建及尚无完成轮次的 fork 没有父会话事件，在 `agent/created` 阶段按 `origin="subagent"` 与 `parentSession` 核对所属父会话，追加现有的工作室绑定事件，再开始任务。已有绑定的子会话恢复不重复追加；子代理保留官方选择的预设组合、模型和权限，不参与主工作室的全局预设重组，也不作为独立工作室对话列入历史。

工作室保留 DSH 原生 Session 上下文，包括历史用户消息、回复、推理块、工具调用、结果和 Provider replay state；退出重进恢复同一会话。不套用角色扮演的历史裁剪。请求只追加当前创作预设与编辑目标，上下文压缩仍遵循 DSH 和所选模型的正式合同。重新生成替换选定输入所在回合及之后的事件，保留同一 Session 与输入身份，旧过程不会作为额外完成回合残留。

角色对话与工作室的请求处理按正式 Agent 作用域隔离。自动配图只处理所属预设或 Agent 的请求，在读取角色运行快照前检查归属；工作室不依赖角色快照文件。模型请求失败只结束当前轮次，工作室列表仍可删除该会话、新建或打开其他会话。打开、选择目标和消息编辑后的恢复使用官方 `resolveAgent`，保留原 Session 身份，不调用新建入口替代恢复。

创作预设内置「自动压缩摘要模板」，保留创作目标、编辑对象编号、已保存修改与未完成事项；现有预设和命名版本缺少该条目时自动补齐，已有自定义内容与启停状态保留。自动压缩与添加面板中的「压缩」指令共用该模板和所用模型的思考档位，模板不进入普通创作请求。停用模板后使用 DSH 默认摘要要求；压缩的输出预算独立于普通回复。摘要通过正式 Session 压缩事件保存，退出重进继续使用；失败保留原上下文并记录原因。

## 查询与修改

`eleckoi_list_toolsets` 列出领域；`eleckoi_describe_toolset` 返回领域的 `guide`、`examples` 和操作参数；`eleckoi_call_capability` 执行准确操作编号。模型在修改前读取对应说明和 `inputSchema`，再读取已有数据。说明随运行版本提供，已有创作预设也能查询当前合同。

领域目录同时给出对应技能名称。常驻指令只路由任务，领域 guide 保持简短；详细知识通过正式 DSH `skill` 工具加载，再按需读取技能 references。分层与分发见 [创作设计](../CREATOR_AUTHORING_DESIGN.md)。角色配置及脚本按钮面板使用 eleckoi-character-authoring，资产使用 eleckoi-character-assets。常规楼层界面通常由正则生成 HTML，也可直接使用正文 HTML，加载 eleckoi-message-frontends；需要自定义整套内容区交互的独立项目才加载 eleckoi-character-frontends。

| 领域 | 操作 |
| --- | --- |
| `character` | `create`、`read`、`update`（含所属分组 `group`） |
| `settings` | `list`、`read`、`create`、`update`、`update_many`、`edit`、`remove`、`create_group`、`update_group`、`remove_group`；角色完整配置另有 `read_library`、`save_library`；全局库另有 `create_library`、`update_library`、`remove_library` |
| `variables` | `list`、`read`、`create`、`update`、`remove`、`create_object`、`update_object`、`remove_object`、`update_schema`、`validate_schema` |
| `scripts` | `list`、`read`、`create`、`update`、`remove`、`create_folder`、`update_folder`、`remove_folder`、`move`、`configure` |
| `regex` | `list`、`read`、`create`、`update`、`remove`、`configure`、`test` |
| `editorVersions` | `read`、`save`；原子保存正则、脚本与完整命名版本 |
| `assets` | `list`、`read`、`read_content`、`import`、`import_file`、`rename`、`duplicate`、`delete`、`create_folder`、`rename_folder`、`move`；当前角色资产 |
| `frontends` | `list`、`read_file`、`import`、`import_file`、`write_files`、`update`、`select`、`configure`、`delete`、`export`；当前角色独立项目 |

操作完整编号由领域和操作组成，例如 `scripts.create`。编号精确匹配；更新只发送要改的字段。查询参数时同时指定 `operation_ids` 和 `include_schema=true`。

### 读写范围

全局配置有直接读写入口，无需先选择角色，也无需绕到命名版本。三组均沿用 `eleckoi_call_capability`，不增加独立 AI 工具或工具组。

| 内容 | 列表调用的 `capability_id` | `arguments` |
| --- | --- | --- |
| 全局设定库目录 | `settings.list` | `{"target":{"scope":"global"}}` |
| 全局设定原稿 | `settings.read` | `{"target":{"scope":"global","libraryId":"准确库编号"},"id":"准确条目编号"}` |
| 全局正则完整规则 | `regex.list` | `{"target":{"scope":"global"}}` |
| 全局脚本目录与库设置 | `scripts.list` | `{"target":{"scope":"global"}}` |
| 全局脚本完整源码 | `scripts.read` | `{"target":{"scope":"global"},"id":"准确脚本编号"}` |

`settings.list` 返回全部全局库的编号、名称、启停、条目目录、文件夹与插入位置，可在 `target` 中加入 `libraryId` 只列一个库。不同库允许条目同名或同编号，读取时必须同时使用库编号和条目编号。`regex.read` 使用与 `regex.list` 相同的 `target` 并提供规则 `id`。`scope="character"` 或省略 `target` 读取当前编辑角色。正则和脚本的 `list/read` 返回 scope 与 ownerId；角色编号由工作室选择确定，不能在参数中改成其他角色。

创作读取包含停用项，返回已保存的原稿和配置；不以启用、关键词或聊天触发条件过滤，也不执行 EJS。设定和脚本的列表不包含各条正文或源码，必须继续 `read`；正则列表包含完整规则。工作室不会自动加载全局正文或脚本源码，`presetPrompts` 只读当前创作预设，两者分别归属。规则生效、显示被替换或读到目录都不能视作 AI 已读过源码。大结果沿原 `eleckoi_call_capability` 的 `result` 续读或搜索，按 `next_offset` 读至结束，不重新执行原操作。

条目、文件夹与库设置的普通写入使用与读取相同的 `target`。省略时操作当前角色；全局设定条目和文件夹必须同时提供 `libraryId`。不会通过条目名称猜测归属或自动改到另一范围。

| 内容 | 普通修改入口 | 并发检查 |
| --- | --- | --- |
| 全局设定条目／文件夹 | `settings.create/update/update_many/edit/remove` 和 `create_group/update_group/remove_group` | 最近同一全局集合的 `revision` 作为 `expectedRevision` |
| 全局设定库名称／启停 | `settings.update_library`，`changes` 中只填 `name` 或 `enabled` | 同上 |
| 全局脚本及文件夹 | `scripts.create/update/remove`、文件夹操作、`move`、`configure` | 最近该范围 `revision` 作为 `expectedRevision` |
| 全局正则及库启停 | `regex.create/update/remove/configure` | 最近该范围 `revision` 作为 `expectedRevision`，也可提供 `ownerRevision` 作为 `expectedOwnerRevision` |

例如读取全局设定条目后，只替换一段：

```json
{"capability_id":"settings.edit","arguments":{"target":{"scope":"global","libraryId":"读取返回的库编号"},"expectedRevision":3,"id":"读取返回的条目编号","old_string":"准确旧片段","new_string":"新片段"}}
```

修改全局脚本只传目标脚本和变化字段：

```json
{"capability_id":"scripts.update","arguments":{"target":{"scope":"global"},"expectedRevision":4,"id":"读取返回的脚本编号","changes":{"content":"export default context => { /* 完整新源码 */ }"}}}
```

修改全局正则只传目标规则和变化字段：

```json
{"capability_id":"regex.update","arguments":{"target":{"scope":"global"},"expectedRevision":5,"id":"读取返回的规则编号","changes":{"replacement":"新的替换内容"}}}
```

示例中的编号和版本必须使用实际读取结果。每次成功写入返回最新 `revision`，正则另返回 `ownerRevision`；下一次写入使用最新回执。冲突时重新读取并合并，失败不覆盖有效数据。角色脚本／正则遵循相同修订检查；角色设定仍使用原合同，不传 `expectedRevision`。

全局库新建用 `settings.create_library({target:{scope:"global"},expectedRevision,name})`，返回 `library.id`，初始为空且停用；`update_library` 修改准确库的名称或整体启停。`remove_library` 删除整个指定库和内容，只用于明确的整库删除需求。删除条目用 `remove`，删除文件夹及子树用 `remove_group`。

全局修改影响共享该库的角色。更新已有原稿或源码时，未提交的库和条目开关保持。新建全局库和脚本默认停用；新建设定条目沿原设定默认 `enabled=true`，起草时可明确 `enabled=false`，库开关不随条目保存改变。`scripts.configure` 和 `regex.configure` 只设置库开关，不批量改变条目开关。正则保存会同步当前启用组合与当前命名配置版本，脚本保存同步当前命名版本，其他命名版本保留。普通修改不需要重传整库正文、文件 base64 或版本 JSON；正则和脚本命名版本管理使用 `editorVersions`。全局设定库没有命名版本。

`regex.test` 与存储范围无关，无需选择角色；其 `target` 是 `AiOutput` 等消息作用对象，`surface` 是显示／提示词／保存范围，按该操作的 schema 传参，不传库范围对象。

角色的 `group` 是所属分组名称，空字符串表示未分组；`settings.update_group` 修改设定库文件夹名称或上级；`variables.update_object` 修改变量组。三者按各自的准确归属和编号操作。文件夹与变量组的 remove 操作删除整棵子树及其中条目，不用于重命名；变量运行配置保留，父级不存在或形成循环时不保存。

正则／脚本命名版本只允许共享全局和当前角色。`editorVersions.read` 的 `scope="global"` 无需选择角色，`scope="character"` 绑定当前编辑角色。`read` 返回版本库 `library` 和当前配置对象 `document`；`save` 的 `documents` 为配置对象数组，`versions` 为版本库数组，参数直接声明角色卡／全局范围，不提供预设选项。角色编号仍沿现有归属校验。正则的完整 documents 使用当前角色编辑器，包含共享全局与该角色，须保留未修改范围；未选择角色时读取全局正则版本的 `document=null`，全局正则仍用普通条目入口修改。

角色设定的自定义位置和命名版本使用 `settings.read_library`、`settings.save_library`。读取返回完整 `library`、`libraryRevision` 和角色 `source`；保存提供 `expectedLibraryRevision` 与修改后的 `library`，不接受 `characterId`、`presetId` 或 `target`。此入口只保存当前角色。普通条目修改继续用 `update/edit/update_many`，无需重传整库。

自定义位置在 `promptPositions` 中管理：每项有唯一 `id`、`name`、`anchor`、`side`、`order`，准确枚举从 schema 读取。条目的 `promptPositionId` 必须属于同一配置，`position` 必须与位置的 `anchor` 一致。删除位置时清空关联条目的 `promptPositionId` 并保留 `position`。切换设定版本时把所选版本的 `name/entries/groups/promptPositions/listAllExpanded/expandedGroupIds` 放到 library 顶层，同时设置 `activeVersionId`；只改编号不会自动加载正文。保留其他版本，过期修订、无效引用、重复版本及跨角色快照均拒绝保存。

移动设定到文件夹使用 `settings.update({id,changes:{groupId}})`；移动文件夹用 `update_group` 的 `parentId`。脚本移动用 `scripts.move({id,expectedRevision,folderId})`；空字符串表示根目录，目标必须属于同一库。保留这些移动操作，不新增专门的前后排序操作。

脚本 `update` 覆盖名称、源码、信息、启停、设置 `data`、完整按钮配置 `button` 和导出选项 `export_with`。按钮有 `enabled` 和 `buttons` 的 `name/visible`；`export_with.data/button` 仅控制导出是否携带对应配置。未提交字段保持原值。已有兼容脚本按原格式编辑保存，新建仍为原生 SDK 模块，不随保存自动转换格式。文件夹可通过 `update_folder` 更名和修改启停、图标、颜色；库设置和库开关使用 `configure`。

模型请求发出后若用户切换编辑角色，该请求中的角色写入会被拒绝；下一次请求取得新目标后再读取和修改，避免旧请求写进刚选中的角色。明确全局操作仍按全局归属执行。

正则的 replacement 可填写 EJS；regex.test 统一测试最终结果，可提供 variables。执行范围、语法及示例见 [正则中的 EJS](regex-ejs.md)。

## 设定读取与 EJS

读取策略只有必读和选读：`agentReadStrategy="required"` 是必读，`"normal"` 是选读并关闭关键词匹配，`"keyword"` 是选读并开启关键词匹配，与界面中的关键词命中开关相同，不是第三个读取档位。只填写 `keywords` 不会开启匹配。`enabled` 控制条目启停。

多条修改使用 `settings.update_many`，一次提交准确编号与要改的字段。例如：

```json
{"updates":[{"id":"entry-a","changes":{"agentReadStrategy":"keyword"}},{"id":"entry-b","changes":{"agentReadStrategy":"keyword"}}]}
```

关闭关键词匹配时将该字段设回 `normal`，关键词内容和其他条件保留。批量修改同步当前设定版本，任一编号、格式或保存失败整批回滚。

主开场白和备用开场白通过 `character.read_openings` 读取、`character.save_openings` 保存。`openingMessages` 接收完整列表，可以新增、修改、删除、调整顺序，并修改每项的标题、正文与 `variableVersionId` 变量版本绑定；未要求修改的项目和字段应保留。`defaultOpeningMessageId` 指定主开场，删除原主开场时必须同时给出有效的新编号。

变量绑定可以改为当前角色已有的准确变量版本编号，也可以填空字符串取消绑定。`variables.list` 返回各版本的 `id/name`，用于查询可选绑定；其 `activeVersionId` 只表示变量编辑器当前选择。新对话只加载所选开场白明确绑定的变量版本及其初值；未绑定或没有有效开场白时不启用变量配置，不自动选择版本。切换至未绑定开场白同时清空本次开局的变量绑定和初值。创作工具不提供开场白独立初值字段。修改原稿不会重写已有对话中的开场与变量。清空开场正文使用空字符串。

| 用途 | `dynamicMode` | `contentMode` | 限制 |
| --- | --- | --- | --- |
| 文字设定 | `standard` | `plain_text` | 必读和选读均可 |
| EJS 控制器 | `standard` | `ejs` | 只允许 `agent_tool` 的选读条目 |
| EJS 引用设定 | `ejs_reference` | `plain_text` | 只供控制器读取，选读、`agent_tool`，不单独进入选读目录 |

`triggerMode="always"` 按插入位置注入文字；`"agent_tool"` 由设定读取流程使用。必读和自动注入的正文使用文字。

以下 EJS 执行说明适用于角色聊天运行时；创作的 `settings.read` 返回原稿源码，`settings.edit/update` 修改原稿，不执行模板。角色聊天中，`<% ... %>` 写判断等代码，`<%= ... %>` 和 `<%- ... %>` 在本产品均输出文字，模板标记之外的文字原样输出。渲染为空表示本轮未触发；非空结果进入本轮需要读取的正文，聊天 AI 看到的是执行后的文字。

代码和文字可以混写：

```ejs
<% if (getvar("阶段", { defaults: 0 }) >= 2) { %>
场景进入第二阶段。
<% } %>
```

也可以把文字独立放进名为「阶段素材」的 EJS 引用设定，再写控制器：

```ejs
<% if (getvar("阶段", { defaults: 0 }) >= 2) { %>
<%- await getwi("阶段素材") %>
<% } %>
```

`getvar` 读取当前聊天变量；`variables/stat_data` 是同一份状态，`lastUserMessage` 是最近用户正文。不要在读取模板里修改状态来结算变量。

`getwi` 只读取已启用的 EJS 引用正文，正文里的模板标记仍是文字，不再次执行。它按准确标题或完整路径匹配。例如「城市/天气」和「乡村/天气」同名时，`getwi("天气")` 明确报错，改用 `getwi("城市/天气")` 即可。它不能引用普通设定或另一个 EJS 控制器，也不提供标准 EJS `include()`。

## 变量与 Zod

变量库定义角色原稿的初始结构。组通过 `objectId` 关联；组名、变量名决定 JSON 键，EJS 和 Schema 必须使用相同键。默认值是字符串：数字填 `"0"`，布尔填 `"false"`，对象和数组填合法 JSON。停用项不参与初始状态。

运行配置的 `schemaCode` 使用全局 `z`，当前版本为 Zod 4.1.11，无需 import 或外部脚本注册函数。可以直接填 Schema 表达式；多语句最终用 `const Schema=...` 或 `export default ...` 提供 Schema。

```js
z.object({
  score: z.coerce.number().min(0).max(100).prefault(0),
  flags: z.record(z.string(), z.boolean()).prefault({}),
}).transform(value => ({
  ...value,
  level: Math.floor(value.score / 10) + 1,
}))
```

`z.object` 默认删除未声明的键；先读取完整结构并声明应保留的键，有意保留额外键时用 `z.looseObject`。Zod 4 的 `z.record` 需要键和值两个参数。`min/max` 拒绝越界值，需要修正值时明确写 `transform`。`prefault` 提供继续参与解析的默认输入；`default` 直接提供默认输出。

Schema 必须同步解析为可保存的 JSON 对象。异步逻辑、非有限数字和不可序列化结果不允许保存。`variables.validate_schema` 预览解析结果，不写入；`update_schema` 在保存前校验当前初始状态，失败保留原配置。

## 脚本与自己的界面

原生标准见 [ElecKoi 作者 SDK](author-sdk.md)及其[完整网页参考](author-sdk.html)。新脚本声明 `runtime={kind:"eleckoi-module",apiVersion:1}`；源码为普通 JavaScript ES 模块，默认导出启动函数。保存不执行，新脚本默认停用。未声明原生合同的已有脚本不会自动转换。

脚本主界面的新建菜单创建脚本或列表文件夹，管理入口可打开源码目录。数据中的 `type="folder"` 表示列表分组；`create_folder/update_folder/remove_folder/move` 操作管理分组，不创建或移动磁盘目录。没有用户的分组要求时不创建分组，保留已有分组及其脚本。

```js
export default context => {
  const stopRule = context.api.variables.registerRule({
    id: "derive-level",
    stage: "afterSchema",
    run(candidate) {
      candidate.signal.throwIfAborted();
      const score = Number(candidate.state.score);
      if (!Number.isFinite(score)) throw new Error("score 必须是有限数字");
      candidate.state.level = Math.floor(score / 10) + 1;
    },
  });
  const stopButton = context.api.ui.registerButton({
    id: "help", label: "查看说明",
    async onClick({ api, signal }) {
      signal.throwIfAborted();
      await api.ui.openPanel({
        id: "help", title: "计算说明",
        html: '<html><head><meta name="eleckoi-author-api" content="0.1.0"></head><body><p>每十点积分提升一级。</p></body></html>',
      });
    },
  });
  return () => { stopButton(); stopRule(); };
};
```

处理顺序为 `before → 应用修改 → after → Zod → afterSchema`。规则可以异步计算，操作 `candidate.state` 并检查 `candidate.signal`；`afterSchema` 的结果不再次经过 Zod，要自行保证有效。结构和范围校验优先放到变量运行配置。

`api.ui.registerButton` 注册聊天脚本菜单按钮，`openPanel` 打开脚本面板，`closePanel(id)` 关闭。所有脚本面板 HTML 必须在 head 放唯一 `<meta name="eleckoi-author-api" content="0.1.0">`；调用 SDK 前等待 `window.ElecKoiReady`。设置存于脚本 `data` 或库 `variables`，通过实时 `context.settings/librarySettings` 读取，与聊天变量不同。

脚本在浏览器环境执行，SDK 由 `context.api` 提供，不支持 Node 内置模块、TypeScript 源码或 npm 裸包名自动解析。相对导入必须有真实文件。外部格式脚本中的助手全局对象不属于 ElecKoi SDK。

## 正则与 HTML 显示替换

`regex.test` 使用实际替换引擎，输入 `text`、完整 `rule`、`target`、`surface`，可带 `depth/isEdit`；返回替换正文、是否变化和范围是否适用，不保存。语法错误明确报错，需要宏时要求真实宏上下文。

例如 pattern 为 `/<meter>(\d+)<\/meter>/g`，replacement 为 `<div class="meter">数值：$1</div>`，输入 `<meter>25</meter>` 会得到 `<div class="meter">数值：25</div>`。`g` 替换全部匹配；跨行使用 `s` 或 `[\s\S]`。

捕获组使用 `$1`、`$2`、`$<命名组>`；`$&` 或 `{{match}}` 表示完整匹配，`$$` 是字面美元号。`trimStrings` 从匹配和捕获组去掉指定文字。规则按 `order` 依次执行，`runOnEdit` 与深度限制必须一起检查。

显示 HTML 通常用 `targets=["AiOutput"]`、`displayOnly=true`、`promptOnly=false`：只替换显示，不向模型发送 HTML 或改写原始消息。`promptOnly=true` 用于请求处理，两者均为 false 则参与正式保存和显示处理。互动 HTML 仍遵循自己的作者 SDK。

常规创作保留聊天楼层，正则生成的 HTML、正文 HTML 和配套脚本面板可在同一张卡中协作；它们分别沿自己的数据入口保存。脚本打开弹窗或页面从外部文件加载，不代表需要独立项目前端。需要自定义整套内容区交互时才通过 frontends 管理独立项目，底层仍使用正式聊天与变量服务；资产通过 assets 管理。具体边界见 [界面创作](character-frontends.md) 和 [资产创作](character-assets.md)。
