<!-- Generated from docs/plugins/character-frontends.md; run pnpm generate:plugin-docs. -->

# 角色卡界面创作

常规角色卡沿用宿主的聊天楼层和输入框。“做前端”通常是在楼层内显示状态栏、正文美化或交互页面：正则把消息中的标记或文本区块替换成 HTML，富消息运行环境再显示页面并执行页面 JavaScript。后台脚本可以同时维护变量、监听事件、提供按钮和打开面板。这些能力可以在同一张卡里协作。

独立前端项目用于需要自定义整套聊天内容区交互结构的任务，例如以地图、操作面板或模拟系统为主体、接入 AI 的网页游戏。它是专门的选择，不是常规楼层界面的前置步骤。是否需要独立项目取决于交互结构，而不是代码多少、是否有按钮或是否使用了多个 HTML／JS 文件；有游戏机制的卡也可以继续采用楼层界面。

## 先判断页面组织，再选择实现机制

| 页面组织 | 主要界面归属 | 常用实现与保存位置 |
| --- | --- | --- |
| 常规楼层聊天 | 每条消息自己的展示区域；脚本可提供配套面板 | 正则 replacement 生成 HTML，或消息正文直接包含 HTML；后台逻辑和面板入口在脚本库 |
| 独立前端项目 | 当前角色的聊天内容区由项目组织 | 项目 HTML／JS／CSS、资源文件和清单，通过 frontends 管理 |

这里区分的是页面组织范围。正则是文本转换入口，HTML／JavaScript 是页面程序，脚本库提供持续运行逻辑和自己的界面入口；它们不是互斥的三种前端。脚本弹窗也不能仅因显示在楼层外，就被归为接管聊天内容区的独立项目。

创作时先读取相关开场白、正则和脚本；已有独立项目时再读取对应项目。常规需求沿已有楼层结构实现，只有用户目标或现有工程确实需要另一套内容区交互结构时才使用独立项目。需要澄清时询问可见效果和影响范围，由 AI 依据已有实现选择具体技术入口。

## 常规楼层界面：正则入口与页面渲染

常见处理链为“消息原文或稳定占位符 → 显示正则替换 → HTML → 富消息页面”。修改 regex 的 pattern/replacement 时，原文与展示源码分别保存；显示规则通常使用 displayOnly=true、promptOnly=false。正则本身只产生替换文本，实际页面执行由富消息运行环境负责。请求侧隐藏标记与显示侧生成界面是不同用途，应分别核对规则范围。

替换内容可以包含完整页面，也可以包含加载页面资源的入口。页面代码在外部文件、通过 URL 加载或使用前端框架，并不改变它所属的楼层。资源加载方式、源码保存位置和页面展示范围应分别判断。

作者已控制正文且正文直接包含展示 HTML 时，也可以由富消息渲染器装配；这仍是楼层界面，不必补一个无实际作用的正则。修改角色开场白原稿使用 character.read_openings/save_openings，并保留其他开场白及关联字段；已有聊天消息的修改属于相应聊天接口。单个普通 HTML 标签不一定被识别为富消息，应遵循现有完整 HTML 文档或明确富消息片段的识别合同。

直接 HTML 与正则输出使用相同的资产解析、富消息容器和页面 SDK。需要 SDK 时仍须明确声明版本并等待 ElecKoiReady。

### 正则选区与程序处理

正则负责找到稳定的标记或一个有明确边界的内容块，再把它替换为展示源码。复杂结构、可变数量、业务判断和交互由 EJS 或页面程序处理。优先用简单、可解释的表达式，不用一条巨大的正则同时解析任意 HTML、嵌套 JSON 和完整故事状态。

“匹配范围较大”指足够容纳目标数据块，不表示不加判断地吞掉整条消息。确认要保留的叙事正文、多个区块的处理方式、是否跨行、是否全局匹配，以及未闭合区块在流式阶段的表现。原文先定义清晰格式，再选择一个稳定入口；没有实际标记时先补相应输出约定，不能假定产品自动追加某个占位符。

一般展示规则选择 `targets=["AiOutput"]`、`displayOnly=true`、`promptOnly=false`。匹配示例为 `/<panel-data>[\s\S]*?<\/panel-data>/`；此例针对一个明确区块，不处理递归嵌套。精确解析放到程序里。

### 页面程序读取所属消息

互动页面输出完整 HTML，在 head 放唯一 SDK 声明，等待 ElecKoiReady 后从 context.current().messageId 读取所属消息。历史消息不能用 messages.current() 猜身份：它取当前列表末条，可能属于另一楼层。

```html
<!doctype html>
<html><head><meta name="eleckoi-author-api" content="0.1.0"></head>
<body><output id="status"></output>
<script type="module">
const output = document.querySelector('#status');
try {
  const api = await window.ElecKoiReady;
  const context = await api.context.current();
  const message = await api.messages.get(context.messageId);
  const match = /<panel-data>([\s\S]*?)<\/panel-data>/.exec(message.content);
  if (!match) throw new Error('缺少面板数据');
  const data = JSON.parse(match[1]);
  if (!data || typeof data !== 'object' || typeof data.label !== 'string') {
    throw new Error('面板数据格式无效');
  }
  output.textContent = data.label;
} catch (error) {
  output.textContent = error.message;
}
</script></body></html>
```

这段 HTML 可作为上述规则的完整 replacement。页面读取原文再解析数据，不将 `$1` 捕获的任意引号、反引号或 `</script>` 直接拼进 JavaScript。普通文字用 textContent；确需插入 HTML 时自行确定可信内容边界，不对叙事原文使用 eval。

### 区分三个执行阶段

1. 正则匹配与捕获替换先运行；`$1`、`$&`、`{{match}}` 等属于这一阶段。
2. 替换产生的 EJS 在受限计算环境执行，能读 rawContent、message 和明确变量快照；没有 DOM 或浏览器 SDK。简单内容也可以直接由 EJS 精确解析并输出，输出文字用 `<%=` 转义。
3. 生成的 HTML 文档交给浏览器页面。页面 JavaScript 在 ElecKoiReady 后调用该页已接通的 SDK。API 不是 EJS 环境中的全局对象。

`regex.test` 验证匹配、捕获、条件和 EJS 文本输出，不启动浏览器页面，不证明按钮、媒体或 SDK 交互可用。流式分片暂不计算显示 EJS，完成后才计算；不要依赖未闭合 JSON 在每个分片都可解析。

查看历史状态时使用所属消息的历史变量快照，实时控制面板读取当前聊天状态，两者按任务明确选择。细节见 [正则 EJS](regex-ejs.md)、[作者 SDK](author-sdk.md) 和 [接口参考](author-sdk-reference.md)。

## 后台脚本、按钮和脚本面板

后台脚本的生命周期与每条楼层页面不同。持续规则、事件监听和共享操作放在脚本里；楼层页面负责所属消息的显示和交互。脚本可以注册聊天菜单按钮，点击后执行操作或打开 HTML 面板；楼层页面也可以通过 SDK 请求已登记的脚本操作。一个角色可以同时拥有正则界面、变量脚本和脚本面板，无需改成独立项目。

ElecKoi 原生脚本用 `api.ui.registerButton` 注册按钮，`api.ui.openPanel` 打开所属脚本的面板，`api.scripts.registerHandler` 提供可被页面调用的操作。面板代码等待 ElecKoiReady，页面与后台通过正式 SDK 协作；关闭面板不会停用后台脚本。具体身份、生命周期、辅助文件和调用方法见 [作者 SDK 的脚本面板与前端调用](author-sdk.md#脚本按钮与作者面板)。

入口与数据应保存在实际所属位置：显示转换在正则，持续逻辑及面板入口在脚本，角色开场白原稿在开场白。导入的酒馆脚本可能使用酒馆助手按钮事件、宿主 DOM 或其他外部接口；理解其用途后，新增原生功能按 ElecKoi SDK 实现，不能把这些外部接口直接写进原生页面，也不能仅因保存就假定已经转换。

## 独立前端项目：自定义内容区交互

需要自定义角色聊天内容区的整体组织时创建独立项目，保留 HTML、CSS、JS 的相对路径。页面可以提供自己的动作按钮、选择和输入控件，通过 SDK 读取消息与变量、发送用户操作并响应生成事件，不必把所有操作先填入宿主输入框。当前角色项目仍保留宿主输入框和应用外壳；项目自定义交互不代表已开放任意替换整个客户端。

独立项目改变的是展示与交互组织，底层仍沿正式聊天、消息和变量服务。编程工具可在工作区生成或维护工程；导入与更新必须经 frontends 能力，不能直接写产品内部目录或数据库。

1. `frontends.list` 获取当前角色项目与工作区 revision；`read_file` 读取准确项目、路径和源码。
2. `import_file` 导入真实 HTML／ZIP；`import` 接受 html、明确 files 或 ZIP base64。创作接口默认 select=false，保存草稿后再按用户需求 select。
3. `write_files` 原子写入本次修改的 files，可同时 deletePaths、修改 entryFile 或 manifest；没有提交的文件保留。清单通过 update／write_files 的 manifest 修改，不能把它当普通文件覆盖。
4. `update` 改名称、入口或清单；`select({projectId})` 启用指定项目，`projectId=null` 恢复默认内容区。
5. `configure` 控制默认聊天富消息渲染；`delete` 移除该项目，保留角色资产库；`export` 导出包含角色资产及文件夹的 ZIP。

所有写入带该角色最新工作区 `expectedRevision`，项目编号从回执读取，不能猜当前选中项或按名称定位。引用资产用 assets 返回的 reference。导出返回文件名和 base64，可沿工具结果续读；现有包导入导出仍在内存组装，不能宣称大 ZIP 的零内存流式处理。

项目清单使用 `scope="character"`、manifestVersion=1、sdkVersion="0.1.0"，显式 entryFile 必须存在。角色绑定目前为无 bindings（直接使用 entryFile），或一条 target=root、view 省略或为 chat 的绑定；应用级 page／slot 不属于此角色路线。

页面同样声明 SDK 并等待 ElecKoiReady。独立页用 messages.list/getPage/pageOlder、chat.send、input、variables 和正式 events 完成所需交互，准确字段按接口参考查阅。chat.send 等待实际生成结果，input.set 只改宿主草稿，input.send 请求宿主提交；不要混用成功含义。长历史按正式游标分页，不能把已加载窗口当完整聊天。

当前角色页面固定角色和聊天；切换聊天撤回旧 SDK。配置预览只有绑定到同角色聊天时才能调用聊天功能。事件与已挂载资源在页面结束时释放，不通过 parent、宿主 DOM、Node、外部全局对象或另一套通信协议操纵客户端。

## 共用资产与选择顺序

常规楼层界面加载 eleckoi-message-frontends，按实际任务读取正则或正文入口；涉及持续逻辑、按钮和面板时配合 eleckoi-character-authoring 的脚本参考。需要独立内容区项目时加载 eleckoi-character-frontends；导入、整理和引用素材加载 eleckoi-character-assets。只读取当前任务相关文件，不要求每次创作通读整个 SDK。

资产库分组不决定正则执行，也不决定项目入口。移动、改名不改 `asset://UUID`；删除会让引用失效。完整打包和导入行为见 [资产创作](character-assets.md)。
