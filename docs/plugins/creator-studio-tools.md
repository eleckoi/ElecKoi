# AI 创作工作室工具

创作预设默认只启用「创作能力」。工具可以新建空角色并设为编辑目标；已有角色的资料与原稿工具绑定工作室选定的角色。共享全局配置和明确 presetId 的预设配置不要求先选择角色。角色不是工作室要扮演的身份。角色扮演的分支设定和聊天变量不通过这些原稿工具修改。

工作室的请求配置和工具执行只作用于所属 DSH 预设作用域中的 Agent。共享模型事件先按正式作用域链核对请求归属，其他角色会话和工作室预设直接继续原请求。会话属于当前作用域时，再校验其正式创作预设绑定；绑定异常明确报错，不套用其他会话的预设或目标。

工作室子代理沿用 DSH 的正式创建与恢复流程。独立创建及尚无完成轮次的 fork 没有父会话事件，在 `agent/created` 阶段按 `origin="subagent"` 与 `parentSession` 核对所属父会话，追加现有的工作室绑定事件，再开始任务。已有绑定的子会话恢复不重复追加；子代理保留官方选择的预设组合、模型和权限，不参与主工作室的全局预设重组，也不作为独立工作室对话列入历史。

工作室保留 DSH 原生 Session 上下文，包括历史用户消息、回复、推理块、工具调用、结果和 Provider replay state；退出重进恢复同一会话。不套用角色扮演的历史裁剪。请求只追加当前创作预设与编辑目标，上下文压缩仍遵循 DSH 和所选模型的正式合同。重新生成替换选定输入所在回合及之后的事件，保留同一 Session 与输入身份，旧过程不会作为额外完成回合残留。

角色对话与工作室的请求处理按正式 Agent 作用域隔离。自动配图只处理所属预设或 Agent 的请求，在读取角色运行快照前检查归属；工作室不依赖角色快照文件。模型请求失败只结束当前轮次，工作室列表仍可删除该会话、新建或打开其他会话。打开、选择目标和消息编辑后的恢复使用官方 `resolveAgent`，保留原 Session 身份，不调用新建入口替代恢复。

创作预设内置「自动压缩摘要模板」，保留创作目标、编辑对象编号、已保存修改与未完成事项；现有预设和命名版本缺少该条目时自动补齐，已有自定义内容与启停状态保留。自动压缩与添加面板中的「压缩」指令共用该模板和所用模型的思考档位，模板不进入普通创作请求。停用模板后使用 DSH 默认摘要要求；压缩的输出预算独立于普通回复。摘要通过正式 Session 压缩事件保存，退出重进继续使用；失败保留原上下文并记录原因。

## 查询与修改

`eleckoi_list_toolsets` 列出领域；`eleckoi_describe_toolset` 返回领域的 `guide`、`examples` 和操作参数；`eleckoi_call_capability` 执行准确操作编号。模型在修改前读取对应说明和 `inputSchema`，再读取已有数据。说明随运行版本提供，已有创作预设也能查询当前合同。

| 领域 | 操作 |
| --- | --- |
| `character` | `create`、`read`、`update`（含所属分组 `group`） |
| `settings` | `list`、`read`、`create`、`update`、`update_many`、`remove`、`create_group`、`update_group`、`remove_group` |
| `variables` | `list`、`read`、`create`、`update`、`remove`、`create_object`、`update_object`、`remove_object`、`update_schema`、`validate_schema` |
| `scripts` | `list`、`read`、`create`、`update`、`remove`、`create_folder`、`update_folder`、`remove_folder`、`move`、`configure` |
| `regex` | `list`、`read`、`create`、`update`、`remove`、`test` |
| `presetScripts` | `read`、`save`；明确提供 presetId |
| `editorVersions` | `read`、`save`；原子保存正则、脚本与完整命名版本 |

操作完整编号由领域和操作组成，例如 `scripts.create`。编号精确匹配；更新只发送要改的字段。脚本与正则写入携带最近 `list/read` 返回的 `expectedRevision`，冲突后重新读取并合并。脚本和正则操作只编辑当前角色库，不改共享全局库或预设库。

角色的 `group` 是所属分组名称，空字符串表示未分组；`settings.update_group` 修改设定库文件夹名称、上级或排序；`variables.update_object` 修改变量组。三者按各自的准确归属和编号操作。文件夹与变量组的 remove 操作删除整棵子树及其中条目，不用于重命名；变量运行配置保留，父级不存在或形成循环时不保存。

配置版本的 `scope="global"`、`scope="preset"` 可以在未选择角色时操作，preset 必须给出准确 presetId；`scope="character"` 仍绑定当前编辑角色。版本保存中的角色文档与版本 ownerId 必须属于该角色，不能通过提交其他编号改变编辑目标。

正则的 replacement 可填写 EJS；regex.test 统一测试最终结果，可提供 variables。执行范围、语法及示例见 [正则中的 EJS](regex-ejs.md)。

## 设定读取与 EJS

读取策略只有必读和选读：`agentReadStrategy="required"` 是必读，`"normal"` 是选读并关闭关键词匹配，`"keyword"` 是选读并开启关键词匹配，与界面中的关键词命中开关相同，不是第三个读取档位。只填写 `keywords` 不会开启匹配。`enabled` 控制条目启停。

多条修改使用 `settings.update_many`，一次提交准确编号与要改的字段。例如：

```json
{"updates":[{"id":"entry-a","changes":{"agentReadStrategy":"keyword"}},{"id":"entry-b","changes":{"agentReadStrategy":"keyword"}}]}
```

关闭关键词匹配时将该字段设回 `normal`，关键词内容和其他条件保留。批量修改同步当前设定版本，任一编号、格式或保存失败整批回滚。

主开场白和备用开场白也通过 `settings.read/update/update_many` 编辑。先用 `settings.list` 获取 `kind="opening"` 的准确条目编号；单独修改 `content` 会更新当前主开场正文。`openingMessages` 接收完整列表，可以新增、修改、删除、调整顺序，并修改每项的标题、正文、`variableVersionId` 变量版本绑定及 `initialVariableStateJson` 初始变量；未要求修改的项目和字段应保留。`defaultOpeningMessageId` 指定主开场，删除原主开场时必须同时给出有效的新编号。

变量绑定可以改为当前角色已有的准确变量版本编号，也可以填空字符串取消绑定。`variables.list` 返回 `activeVersionId` 和各版本的 `id/name`，用于查询可选绑定。绑定时新对话使用所绑定版本的初始变量；未绑定时使用开场初始变量，留空则使用当前变量版本。修改原稿不会重写已有对话中的开场与变量。固定开场容器沿用角色编辑器的分类和显示配置，清空正文使用空字符串。

| 用途 | `dynamicMode` | `contentMode` | 限制 |
| --- | --- | --- | --- |
| 文字设定 | `standard` | `plain_text` | 必读和选读均可 |
| EJS 控制器 | `standard` | `ejs` | 只允许 `agent_tool` 的选读条目 |
| EJS 引用设定 | `ejs_reference` | `plain_text` | 只供控制器读取，选读、`agent_tool`，不单独进入选读目录 |

`triggerMode="always"` 按插入位置注入文字；`"agent_tool"` 由设定读取流程使用。必读和自动注入的正文使用文字。

EJS 正文是实际执行的模板。`<% ... %>` 写判断等代码，`<%= ... %>` 和 `<%- ... %>` 在本产品均输出文字，模板标记之外的文字原样输出。渲染为空表示本轮未触发；非空结果进入本轮需要读取的正文。AI 看到的是执行后的文字。

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

正则显示替换、脚本按钮面板和角色前端项目分别使用对应合同。当前创作工具不提供角色前端项目操作。
