# 角色配置创作参考

本文是角色资料、设定、变量、脚本和正则配置的按需参考。准确参数从当前 eleckoi_describe_toolset 查询；角色卡和共享全局各自归属，当前创作预设只读。资产库与界面创作见对应专题。

## 配置版本

入口为角色卡对应编辑器的管理按钮；主界面多选处理条目，版本弹窗管理命名版本及导入导出。创作工具只操作共享全局和当前角色，不开放预设修改。

先 read(kind,target)，返回 library（版本库）和 document（当前配置对象）。scope="character" 绑定当前编辑角色；scope="global" 使用共享全局库，无需选择角色。versions 中每个 content 是正式配置 JSON，保留未修改版本。脚本版本包含 enabled、trees、variables、files（path 与 base64 data），正则版本包含 enabled、rules。编辑器分组标题开关批量设置整个库与全部条目的 enabled，包含脚本文件夹和子脚本；单个条目仍能单独修改。通过工具批量启停时同步提供这些明确状态。

save 提供 kind、配置对象数组 documents 和版本库数组 versions：把 read 返回的 document 和 library 分别放入对应数组；documents 是对象，不是 JSON 字符串。正文与当前命名版本必须一致，revision 和脚本 resourceRevision 必须来自最新读取。冲突不覆盖数据，重新读取后合并。只提交本次修改的库，保存正文与版本采用同一事务。脚本配置按明确 global 或 character 范围保存；正则 document 是当前角色编辑器，包含共享全局与该角色，保留未修改范围。未选择角色时可以读取全局正则版本，此时 document=null；普通全局正则读写仍使用 regex 的条目入口。

更名不改变编号，复制版本需生成新编号；创建和导入的配置库默认停用。版本文件格式为 eleckoi.editor-library-version、version=1、kind、name、content；不混用角色卡或预设整包格式。旧正则启用组合仍只保存规则启停组合，不代表源码版本。

## 角色资料

可以调用 character.create 提供 name 和可选 group，从零创建空角色并设为当前工作室编辑目标，不要求先选择角色；已有编辑目标时调用新建，也不会修改原角色。

读取和修改已有资料仍要求当前工作室明确选择角色，先读后改；不能按目录顺序或名称猜测编辑对象。character.update 的 group 是所属角色分组名称，空字符串表示未分组；修改它只调整当前角色归属，保留其他角色和资料。角色是编辑对象，不是工作室要扮演的身份。

开场白在角色编辑器的独立页面维护，通过 character.read_openings 读取、character.save_openings 保存。保存参数为 enabled、openingMessages、defaultOpeningMessageId；enabled 是保留字段，不控制显示，主开场白正文留空时新对话不显示开场白，有正文才显示。openingMessages 是全部不同开场白的列表，每项包含 id、title、content 和可选 variableVersionId，主开场由 defaultOpeningMessageId 指定。保留未修改的其他开场白和字段。开场白没有命名版本，不传 versions 或 activeVersionId，也不传由工作室选择确定的 characterId。

每条开场白可以分别关联变量版本，准确编号从 variables.list 的 versions 读取。开局使用所选开场白关联版本的初始值。清空 variableVersionId 可解除关联；无关联或版本缺失时不自动选择编辑器当前版本，也不填写开场白独立初值。版本缺失不阻断聊天，已存在的变量值和历史保留；恢复相同编号的版本后继续读取该配置。修改开场白不修改设定库，切换设定库版本不改变开场白。

## 设定库

先明确读取范围：list/read 省略 target 时只读当前编辑角色；全局设定先 settings.list({target:{scope:"global"}}) 获取全部库的准确 id、启停、条目和文件夹，再 settings.read({target:{scope:"global",libraryId:"准确库编号"},id:"准确条目编号"}) 读取完整原稿。list 可传 libraryId 只列一个全局库。全局读取无需选择角色，也包含停用的库和条目；不同库允许同名或同编号条目，必须按 libraryId 和 id 定位，不根据标题或排序猜测。

创作读取用于检查已保存的原稿：list 是目录，不含正文；read 返回完整正文和配置，EJS 也返回源码，不执行模板、关键词匹配或聊天注入。全局正文不会自动放进工作室请求，必须实际调用读取后才能引用。当前创作预设的提示词通过 presetPrompts 读取，与全局设定库、角色设定库分别归属，必读回执按该组说明核对本轮已前置的正文。结果较长时按 eleckoi_call_capability 的 result 提示续读或搜索，不能把目录或片段当作已读完整正文。

读取策略只有必读和选读。agentReadStrategy="required" 是必读；"normal" 是选读并关闭关键词匹配；"keyword" 是选读并开启关键词匹配，与编辑器的关键词命中开关相同，不是第三个读取档位。只填写 keywords 不会开启匹配；开启时把 agentReadStrategy 设为 keyword，关闭时设为 normal，保留原关键词和其他条件。

enabled 是条目开关。普通设定 dynamicMode="standard"；triggerMode="agent_tool" 交由设定工具读取，"always" 按插入位置注入。必读正文、always 正文都用 contentMode="plain_text"。

只有 agent_tool 下的选读普通设定可以用 contentMode="ejs"。EJS 正文是执行的模板，代码写在 <% ... %>，输出表达式用 <%= ... %> 或 <%- ... %>；这里两种输出标记都输出文字。模板外的文字原样输出。不是把 EJS 代码当提示词交给 AI 执行。

角色聊天运行时的 EJS 控制器按当前变量和聊天计算，输出为空表示本轮没有触发，非空输出列为本轮要读取的正文；聊天的设定工具返回执行后的文字。本组 settings.read 则返回可编辑的原稿源码。不要用 SDK 脚本、HTML 页面或 Zod Schema 冒充 EJS 设定。

getvar("组.变量", { defaults: 0 }) 读取当前聊天变量；variables/stat_data 是同一份状态，lastUserMessage 是最近用户正文。只有取回的状态用于判断，不修改它来结算变量。

代码与设定文字可混写，也可分离：分离时先创建 dynamicMode="ejs_reference"、contentMode="plain_text" 的文字条目，再在 EJS 控制器里用 <%- await getwi("文件夹/引用标题") %> 输出它。getwi 只读取已启用的 EJS 引用正文，不执行引用里的模板标记；引用不单独进入 AI 选读目录。

getwi 按准确引用标题或完整设定路径匹配；标题重复时用完整路径。不可引用另一个普通/EJS 控制器，也不要用 EJS 标准 include() 代替本产品的 getwi。

条目和文件夹的 create/update/update_many/edit/remove/create_group/update_group/remove_group 与读取使用同一 target。修改全局库时必须传 target={scope:"global",libraryId:"准确库编号"}，并以最近 list/read 或成功写入返回的 revision 作为 expectedRevision；冲突后重新读取、合并，不覆盖他人的修改。省略 target 或 scope="character" 仍修改当前角色，角色设定不传 expectedRevision；不能提交其他角色编号。全局成功 update/update_many 返回 entries、revision 和 source，角色仍返回条目数组。

新建全局库用 create_library({target:{scope:"global"},expectedRevision,name})，默认停用且为空；返回 library.id。update_library({target:{scope:"global",libraryId},expectedRevision,changes:{name或enabled}}) 修改名称或库开关，保留条目开关；remove_library 删除整个指定库及内容，只在用户要求删除整个库时调用。修改一个条目或文件夹不删除库。全局写入影响所有使用该共享库的角色；更新已有条目保留未提交的 enabled，新建条目沿原设定默认 enabled=true，起草时可明确 enabled=false，库开关不随条目保存改变。独立开场白通过 character.read_openings、character.save_openings 管理。

只修改正文中的一段时，先 read 确认准确原文，再优先 settings.edit({id,old_string,new_string})，只提交旧片段与新片段，无需重传整条正文。其余文字、目录、启停和读取配置保留。匹配按字面量进行，不执行正则、EJS 或 $ 替换标记；new_string 为空可删除片段。原文为空、找不到、默认匹配多处或新旧相同时不保存；匹配多处先补充上下文，只有明确替换全部时传 replace_all=true。成功只返回编号、替换次数和修改回执，不能把未读取的长正文凭空重写。settings.update 的 content 仍表示完整正文，update_many 是按条目批量修改，不是正文片段替换。

多条设定使用 settings.update_many({updates:[{id,changes},...]}) 在同一事务提交，例如批量开启时每项 changes={agentReadStrategy:"keyword"}。任一编号、格式或保存失败整批不提交。文件夹通过 create_group/update_group/remove_group 管理；update_group 可改 name、parentId、order、treeViewOrder，编号和条目归属不变；remove_group 会删除该文件夹、其子文件夹和条目，不能用于只改名字。

移动设定到文件夹用 update 的 changes.groupId，移到根目录填空字符串；移动文件夹用 update_group 的 changes.parentId，父级必须属于同一库，不跨角色或全局库。无需为普通移动重传正文。

角色卡的自定义插入位置和设定命名版本用 read_library/save_library：先读完整 library 和 libraryRevision，再传 expectedLibraryRevision 与修改后的 library；归属固定为当前角色，不接受 characterId、target 或 presetId。普通条目优先 update/edit。新增位置须给唯一 id、name、anchor、side、order，条目用 promptPositionId 关联并将 position 设为同一 anchor；删除位置时清空关联条目的 promptPositionId，保留其 position。修改主配置同时保留未修改的命名版本；切换版本时将选中版本的 entries、groups、promptPositions、listAllExpanded、expandedGroupIds、name 一并放到 library 顶层，并设置 activeVersionId。只改 activeVersionId 不会自动加载版本正文。完整保存有修订冲突检查，失败重新读取合并。

### 代码和文字混写

```json
{
  "title": "代码和文字混写",
  "content": "<% if (getvar(\"阶段\", { defaults: 0 }) >= 2) { %>场景进入第二阶段。<% } %>"
}
```

### 代码与文字分离

```json
{
  "title": "代码与文字分离",
  "reference": {
    "title": "阶段素材",
    "dynamicMode": "ejs_reference",
    "contentMode": "plain_text",
    "content": "场景进入第二阶段。"
  },
  "controller": {
    "title": "阶段控制器",
    "agentReadStrategy": "normal",
    "contentMode": "ejs",
    "content": "<% if (getvar(\"阶段\", { defaults: 0 }) >= 2) { %><%- await getwi(\"阶段素材\") %><% } %>"
  }
}
```

## 变量库

变量配置是素材库中的作者配置，编辑器选中版本只决定编辑对象，不切换已有聊天的关联版本。聊天变量工具每次读取关联版本的最新已保存目录、类型、默认值、说明、更新规则和校验；当前值属于聊天，开局值和历史快照不作为实时默认值来源，也不随配置保存重写。objects 表示嵌套组，variables 用 objectId 关联组。变量和组的 title/name 决定实际 JSON 键，必须与 EJS 和 Schema 使用的键一致。list 返回 activeVersionId 和 versions 的准确编号、名称，开场白关联变量版本时从这里查询，不根据名称猜编号。

变量组使用 create_object/update_object/remove_object。update_object 按准确 id 修改 name、parentId、enabled、description 等字段，保留子组和变量；不存在的父级、运行配置父级和循环关系拒绝保存。remove_object 会删除指定组及其子组、变量；固定变量运行配置不能修改或删除，校验源码使用 update_schema。

变量 readMode="required" 是必读，"on_demand" 是选读。defaultValue 是字符串：数字写 "0"，布尔写 "false"，对象/数组写合法 JSON。enabled=false 的项不参与初始状态。

schemaCode 对应变量运行配置的 Zod 校验框。运行时提供 Zod 4.1.11 的全局 z，直接填写 z.object({...}) 表达式，无需 import，也无需酒馆助手的注册函数。多语句可以用 const Schema=... 或 export default ...，最终必须产生当前 Zod Schema。

Schema 解析结果必须是可保存的 JSON 对象；不能返回 Promise、函数、undefined、循环对象或 NaN。使用同步 preprocess/transform/refine，错误会拒绝本次变量修改。

z.object 默认会移除没有声明的键。先读完整变量结构，声明所有应保留的键；有意保留额外键时使用 z.looseObject。动态字典用 z.record(z.string(), 值Schema)，Zod 4 需要键和值两个参数。

z.number().min(0).max(100) 会拒绝越界值；需要修正而非拒绝时明确使用 transform。z.coerce.number() 用于明确允许数字字符串的输入。prefault 在输入缺失时提供继续参与解析的值；default 直接提供默认输出，两者不要混淆。

Zod 适合结构、类型、范围、默认值和同步派生计算。异步或跨消息辅助计算放在本产品的原生脚本规则里。变量处理顺序：before → 应用修改 → after → Zod → afterSchema；afterSchema 的结果不会再经过 Zod。

保存前可调用 variables.validate_schema，用合成对象或实际配置初始状态检查解析结果；失败不保存。update_schema 也先验证初始状态，保留原有配置。

### 范围、动态字典与派生计算

```json
{
  "title": "范围、动态字典与派生计算",
  "schemaCode": "z.object({ score: z.coerce.number().min(0).max(100).prefault(0), flags: z.record(z.string(), z.boolean()).prefault({}) }).transform(value => ({ ...value, level: Math.floor(value.score / 10) + 1 }))",
  "state": {
    "score": 20,
    "flags": {
      "ready": true
    }
  }
}
```

## 脚本

读取当前内容直接使用 scripts.list/read，不必读取命名版本。省略 target 或 target={scope:"character"} 读取当前编辑角色；target={scope:"global"} 读取共享全局库，无需选择角色。list 返回范围、目录、库设置和启停，不含单个脚本源码；read({target,id}) 返回完整源码或文件夹中的全部脚本。停用项仍可读取；保存或启用本身不会把源码自动发送给 AI，必须调用 read 才能检查源码。

唯一合同是 ElecKoi 作者 SDK：https://eleckoi.github.io/ElecKoi/docs/plugins/author-sdk.html 。原生脚本通过当前 SDK 调用，不依赖其他软件的脚本全局。

脚本主界面的新建菜单创建脚本或列表文件夹，管理入口可打开源码目录。数据中的 type="folder" 是脚本列表分组，与磁盘目录不同；create_folder/update_folder/remove_folder/move 操作管理该分组，不创建或移动磁盘目录。没有用户的分组要求时不创建分组，已有分组和所属脚本须保留。

普通增删改、文件夹、move 和 configure 与读取使用同一 target：全局传 {scope:"global"}，省略时为当前角色。每次写入用同一范围最近 list/read 或成功写入返回的 revision 作为 expectedRevision；冲突后重新读并合并。update 只提交 changes，保留其他脚本、设置、分组及源码资源，无需重传全库、文件 base64 或命名版本。新脚本和新库默认停用；configure 只改库开关／库设置，不自动更改每个脚本开关。全局修改影响共享该库的角色，启用须符合用户要求。命名版本管理才用 editorVersions。

update 可改 name、content、info、enabled、data、button 和 export_with；data 是脚本设置 JSON 对象，button 是完整按钮配置（enabled 与 buttons 的 name/visible），export_with 是导出时是否携带 data/button，不控制运行。未提交这些字段时原值保留。已有无 runtime 的兼容脚本按其原格式保存，不自动转换为原生模块；新建使用下述原生 SDK。move({id,folderId}) 只把脚本移到同一库的文件夹或根目录（空字符串），不接受位置索引，不跨库移动。

新脚本声明 runtime={kind:"eleckoi-module",apiVersion:1}，界面新建时 content 留空且 enabled=false，创作工具也允许保存空白、停用的草稿。启用前填写普通 JavaScript ES 模块，export default 启动函数，接收 context.api、signal、settings、librarySettings；可以返回清理函数。保存源码不会运行脚本，不自动补入源码。

SDK 通过 context.api 调用，不需要从 npm 裸包名导入 SDK。脚本在浏览器 realm 运行，不支持 Node 内置模块、TypeScript 语法或 npm 裸包名解析；相对模块导入必须先有对应真实文件。

类型和范围校验写 variables.update_schema。辅助计算用 api.variables.registerRule({id,stage,run})；run 可以异步，只修改 candidate.state，并检查 candidate.signal。before/after 的结果会经过 Zod，afterSchema 用于最终派生值，自己确保结果有效。注册返回取消函数，启动函数返回它或组合清理函数。

脚本可在常规楼层聊天中配套自己的界面：api.ui.registerButton({id,label,onClick}) 注册聊天脚本菜单里的按钮；按钮回调使用其参数中的 api 与 signal。api.ui.openPanel({id,title,html}) 打开脚本面板，closePanel(id) 关闭。正则楼层界面与脚本按钮面板可同时使用，此功能不创建角色前端项目。

脚本面板 HTML 必须在 head 放唯一 <meta name="eleckoi-author-api" content="0.1.0">；调用 SDK 前等待 window.ElecKoiReady，使用返回的 API。与直接访问 parent、应用 DOM 或酒馆助手全局对象无关。

设置放在 script.data 或所属库 variables，运行时通过 context.settings/librarySettings 读取。设置不是聊天变量；需要实时值时保留 context，不把启动时解构的设置副本当最新值。

源码由 Host 保存到 author-scripts 文件目录，数据库保存文件引用和管理记录。删除脚本清理其源码，不能因此删除别的脚本、全局库或角色前端。

### 辅助计算与按钮面板

```json
{
  "title": "辅助计算与按钮面板",
  "content": "export default context => {\n  const stopRule = context.api.variables.registerRule({ id: \"derive-level\", stage: \"afterSchema\", run(candidate) { candidate.signal.throwIfAborted(); const score = Number(candidate.state.score); if (!Number.isFinite(score)) throw new Error(\"score 必须是有限数字\"); candidate.state.level = Math.floor(score / 10) + 1; } });\n  const stopButton = context.api.ui.registerButton({ id: \"help\", label: \"查看说明\", async onClick({ api, signal }) { signal.throwIfAborted(); await api.ui.openPanel({ id: \"help\", title: \"计算说明\", html: '<html><head><meta name=\"eleckoi-author-api\" content=\"0.1.0\"></head><body><p>每十点积分提升一级。</p></body></html>' }); } });\n  return () => { stopButton(); stopRule(); };\n};"
}
```

## 正则规则

读取当前配置直接使用 regex.list/read，不必读取命名版本。省略 target 或 target={scope:"character"} 读取当前编辑角色；target={scope:"global"} 读取共享全局规则，无需选择角色。list 返回该范围全部规则的完整 pattern/replacement、库启停及 revision，read({target,id}) 返回一条完整规则；包含停用规则。规则生效不表示 AI 自动看过规则源码，显示替换与提示词替换的结果也不等于配置原稿。

create/update/remove/configure 与读取使用同一 target；省略时为当前角色。每次写入用同一范围最近 list/read 或成功写入返回的 revision 作为 expectedRevision，可同时传 ownerRevision 作为 expectedOwnerRevision。冲突后重新读并合并。create 生成编号，update 只提交 changes，保留其他规则与其他范围；configure 只改该范围的库开关，不改条目开关。修改同步当前命名配置版本与当前启用组合，保留非当前命名版本。普通修改无需 documents 或整份版本 JSON，命名版本管理才用 editorVersions。全局修改影响共享规则的角色。

pattern 可写 /表达式/标志 或表达式正文。g 才替换全部匹配；跨行可用 s 或 [\s\S]，不要凭名称猜目标。targets 明确选择 UserInput、AiOutput、SettingContent 或 Reasoning。

replacement 是替换内容，可包含文字、HTML 或标准 EJS 3.1.10。捕获组使用 $1、$2、$<命名组>；$& 或 {{match}} 是整个匹配，$$ 是字面美元号。trimStrings 从匹配和捕获组里去掉指定文字。

显示 HTML 通常选择 targets=["AiOutput"]、displayOnly=true、promptOnly=false。仅变更显示，不把 HTML 代码发送给模型或改写原始消息。promptOnly=true 用于模型请求处理；两者为 false 是正式保存/显示处理规则。不要把显示替换误当角色前端项目或脚本入口。

runOnEdit=false 时不处理编辑场景；minDepth/maxDepth 限制消息深度，null 表示不限。多个规则按 order 依次执行，后续规则可能处理前一个规则输出。

substituteRegex=0 不展开 pattern 宏，1 展开，2 展开后转义。需要宏时必须有真实宏上下文，测试不伪造它；替换里的 {{match}} 已在捕获阶段处理。

先 regex.test 传合成 text、target、surface、depth/isEdit；此操作无需角色，target 是 AiOutput 等消息作用对象，不是库范围对象。模板使用 getvar 时显式传 variables 合成对象。预览会等待异步 EJS 完成，不保存规则、消息或变量；确认结果后再保存。没有匹配与规则不适用是不同结果；语法错误明确报错。

正则替换完成后计算该范围结果中的 EJS，支持 <% JS %>、<%= HTML 转义 %>、<%- 原样输出 %>、判断、循环和 await。显示侧变量来自该消息历史快照；提示词侧来自本次请求变量快照，缺少快照时 getvar 报错。rawContent/content/message/variables/getvar 提供内容与只读上下文。

### 把标签显示为静态 HTML

```json
{
  "title": "把标签显示为静态 HTML",
  "rule": {
    "name": "展示数值",
    "pattern": "/<meter>(\\d+)<\\/meter>/g",
    "replacement": "<div class=\"meter\">数值：$1</div>",
    "targets": [
      "AiOutput"
    ],
    "displayOnly": true,
    "promptOnly": false
  },
  "text": "<meter>25</meter>"
}
```
