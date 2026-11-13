<!-- Generated from docs/plugins/author-sdk.md; run pnpm generate:plugin-docs. -->

# ElecKoi 原生作者 SDK

状态：预览。本文是 ElecKoi 原生作者开发教程，按下述已接通合同创作。可直接打开 [开发文档页面](../../eleckoi-plugin-development/references/author-sdk.html)，查询 [完整接口参考](author-sdk-reference.md)，或使用 [可导入的原生示例](../../packages/examples/native-author/README.md)。预览合同与当前能力边界在本文中明确列出，不代表所有插件管理接口都开放给作者页面。

## 从这里开始

后台脚本与 HTML 页面使用同一个 SDK，承担不同职责：脚本持续注册规则、按钮和监听，页面负责显示和用户交互。常规角色卡保留聊天楼层，通常通过显示正则生成楼层 HTML，也可以直接显示正文中的 HTML；后台脚本可以配套提供按钮和面板。后台脚本不需要附在每条消息里，页面也不需要启动另一套变量引擎。

1. **创建脚本**：角色配置的“脚本”包含全局和角色库；预设编辑的“脚本”包含同一全局库和选中预设库。在需要的归属中新建脚本，源码默认留空且脚本停用，可保存空白草稿。在源码区或「沉浸编辑」填写 JavaScript，使用 `export default` 导出启动函数，再启用库及脚本并保存。
2. **创建页面**：先按展示目标确定归属。常规楼层页面保存在正则 replacement 或消息正文；脚本面板由所属脚本打开。需要自定义整套聊天内容区交互时，才在角色配置的“前端”新建或导入独立 HTML / ZIP 项目并明确启用。原生页面需要唯一的版本声明和 `await window.ElecKoiReady`。楼层页面固定所属消息；独立角色项目接管聊天内容区，当前保留官方输入框和应用外壳。选择与保存入口见 [界面创作](../../eleckoi-plugin-development/references/character-frontends.md)。
3. **运行交互**：脚本用 `ui.registerButton` 注册聊天菜单中的按钮；按钮可以打开作者设置弹窗。页面可以修改变量、填写草稿或直接发送用户消息，三者是不同操作。
4. **调试**：先看角色配置中的脚本运行错误、聊天菜单中的按钮错误、前端或设置页面的错误。编辑后保存会重新启动程序；仅保存脚本设置不会重启。调用返回 Promise 时使用 `await` 和 `try/catch`，不要以按钮点击或 Promise 创建当作成功。

最小后台脚本如下。注册发生在启动时，返回的清理函数在停用、程序变化、聊天切换或退出时执行：

```js
export default ({ api }) => {
  const stop = api.ui.registerButton({
    id: 'fill-draft', label: '填写输入框',
    async onClick({ api }) { await api.input.set('开始探索'); },
  });
  return stop;
};
```

把 [原生示例角色](../../packages/examples/native-author/example.character.json) 按 ElecKoi 格式导入，即可获得后台规则、设置弹窗、辅助模块、两个开场白及原生 HTML 页面。导入脚本保持停用，用户明确启用；不凭卡容器格式或脚本名称改写程序。完整步骤见 [示例说明](../../packages/examples/native-author/README.md)。

## 输入与发送


正则及脚本的分组标题开关批量设置整个库及全部条目：开启全部启用，关闭全部停用，包含搜索隐藏的条目、脚本文件夹和子脚本；条目开关仍可单独修改，修改后统一保存。运行时要求库、条目及所属文件夹均启用，停用的名称置灰。SDK 保存提交调用者提供的完整配置，不自动改写条目状态；需要批量启停时同时设置库与全部条目的 `enabled`。`editorVersions.read/save` 管理完整命名版本，正则 content 为 `{enabled,rules}`，脚本包含 `{enabled,trees,variables,files}`；版本恢复包含整体开关。正则配置正文使用 `globalEnabled`、`agentPresetEnabled`、`characterEnabled` 表达对应归属的整体状态，编辑入口仅提交全局与自身归属。

`input.set(text)` 只填写实际输入框；`input.append(text)` 追加，`input.clear()` 清空。`input.send()` 请求官方输入框提交当前草稿和附件，返回 `{ submitted }`，不是 AI 完成回执。

`chat.send(text, options?)` 直接发送作者提供的用户消息，不替换输入框草稿，等待当前正式生成流程结束。成功返回 `{ accepted: true, conversationId, runId, messageId }`；生成失败或取消会拒绝 Promise。`runId` 是正式 Session 编号，`messageId` 是本次用户消息编号，不是猜测的最新 AI 回复。

```js
const api = await window.ElecKoiReady;
try {
  const accepted = await api.variables.merge({ score: 12 });
  await api.chat.send(`继续探索，积分为 ${accepted.score}。`);
} catch (error) {
  document.querySelector('output').textContent = error.message;
}
```

变量失败时不会执行后面的发送。发送失败时，不自动撤回此前已保存的变量；它们不是一起回滚的事务。`chat.stopGeneration()` 请求停止，正式停止结果由现有运行流程及取消事件提供。

## 页面能力与错误

```js
const api = await window.ElecKoiReady;
const methods = await api.app.getCapabilities();
const context = await api.context.current();
```

`methods` 只列本页实际接通的业务方法；后台规则注册、按钮注册和事件监听是本地函数能力，不在通用请求目录中。普通消息和项目页面没有脚本设置、后台规则及聊天按钮注册身份；设置弹窗可以读写所属脚本设置，但不能重复启动后台规则。

多数调用遵循页面绑定的聊天；全局预设选择、模型选择与共用脚本设置保留其真实产品作用域，不能称为当前聊天私有修改。固定消息和角色页面关闭后，旧 SDK 不会转去操作后来选中的聊天；应用级前端可以随当前聊天变化，新调用使用新的选择。

设置 → 聊天显示 → 富消息提供可选的运行楼层限制，默认关闭。开启后，按最近的已完成 AI 消息计数（默认 10 楼，数量为作者填写的正整数），更早的富消息需要点击加载，同时最多额外运行一个旧楼层。超出范围或停止手动楼层会移除网页并释放其 SDK 绑定；重新加载会重新执行页面，未保存的页面内部状态可能重置。需要持续运行的规则应放在后台脚本中，需持久保存的数据应通过正式 SDK 保存。聊天阅读定位继续使用当前 DSH 的消息锚点机制，不持久保存网页高度或运行状态。

富消息 iframe 按内容自动调整高度。其行内样式与可读取样式表中的 `vh`、`svh`、`lvh`、`dvh` 以宿主窗口对应视口高度计算；`vmin`／`vmax` 及其变体使用消息宽度与该高度，避免内容尺寸与 iframe 高度互相依赖。窗口变化、媒体加载及动态样式继续触发测量，适配只作用于运行文档，不改写保存的源码。浏览器禁止读取的跨域样式表无法进行声明适配，影响布局的视口长度应放在页面可读取的样式中。独立项目不使用这套楼层测高适配。

处理异常时保留错误 `code` 与 `message`。参数错误先修正参数，规则或 Zod 错误先修正候选，设置并发冲突先重新读取版本，再由作者决定如何合并。不要捕获所有错误后返回空对象或把失败当成成功；也不要无限自动重试已经可能产生外部副作用的操作。完整参数、返回值、事件字段及启动上下文见 [接口参考](author-sdk-reference.md)。

## 数据与运行位置

作者调用页面中的 `window.ElecKoi`。SDK 把业务操作交给原生服务，不在页面中另外保存一份聊天变量。

```text
作者页面的 ElecKoi.variables
  -> DSH 生成的 eleckoiAuthorVariables Remote
  -> 原生变量处理服务
  -> product-data 中的聊天变量
```

AI 使用现有变量工具，作者使用 SDK，两者共用变量处理服务。AI 不需要在回复正文中输出供旧引擎解析的变量命令。SDK 不改写请求中的设定位置或消息组装规则。

| 内容 | 位置与用途 |
| --- | --- |
| 全局、角色、预设脚本源码及启停 | 源码在 `author-scripts` 文件目录；归属和启停在正式产品脚本库，管理入口分别在角色配置和预设编辑；共享全局库在两处均可修改 |
| 角色变量配置及各开场白初始数据 | 原生角色变量领域 |
| 当前聊天变量 | 原生聊天变量，所有明确当前状态操作使用这一份 |
| 一次修改过程中尚未接受的结果 | 临时候选，成功才保存，失败后丢弃 |
| 历史消息变量 | 按明确消息身份查询，不以当前变量或列表顺序代替 |

三类脚本是归属范围，不是三个 SDK。角色编辑器只展示全局和角色库，预设编辑器只展示同一全局库和选中预设库。修改全局会通知已打开的编辑器及聊天；未保存草稿遇到版本冲突时拒绝覆盖。全局脚本被所有角色共享；角色脚本属于指定角色；预设脚本属于指定预设。将旧脚本保存或导出成原生卡容器，不会改变脚本使用的接口，也不会自动成为原生 SDK 程序。

## 脚本按钮与作者面板

脚本可以在常规楼层聊天中提供自己的按钮和 HTML 面板，与正则生成的楼层界面共同使用，无需创建独立前端项目。消息前端与脚本的自定义调用见下方「前端调用脚本」：菜单按钮与消息网页里的按钮可以调用同一个脚本操作。

聊天的扮演菜单提供“脚本”展开项，只列出当前运行程序实际注册的按钮。角色配置仍管理源码、启停和“显示脚本按钮”总开关；原生按钮由代码注册，不从旧按钮名称或排列顺序推断回调。不同库或脚本可以使用相同按钮编号，同一脚本重复编号会报告冲突。

```js
export default ({ api }) => {
  return api.ui.registerButton({
    id: 'settings',
    label: '设置',
    async onClick({ api, signal }) {
      signal.throwIfAborted();
      await api.ui.openPanel({
        id: 'settings',
        title: '设置',
        html: '<html><head><meta name="eleckoi-author-api" content="0.1.0"></head><body><script type="module" src="../settings.js"></script></body></html>',
      });
    },
  });
};
```

`registerButton` 同步返回撤回函数，只在运行脚本安装；不通过通用 `call` 传递函数。点击回调获得本次操作的 `api` 与取消信号，业务调用应使用回调参数的 API 并等待完成。它的变量调用始终经过 Host 正式处理链，不加入同一脚本当时可能正在执行的规则候选。回调完成后该操作 API 结束；持续监听在脚本启动阶段注册，返回清理函数撤回。

`ui.openPanel({ id, title, html })` 返回 Promise；成功说明已接受显示，不表示面板代码执行完成。HTML 必须显式声明原生版本，面板代码等待 `window.ElecKoiReady` 后调用 SDK。相对脚本、图片与样式按所属脚本入口文件解析，支持普通辅助文件；当前只显示一个作者面板，新面板替换旧面板。面板提供所属脚本的 `script` 设置接口，但不能再次注册后台规则或聊天按钮。`ui.closePanel(id)` 只关闭调用者所属脚本且编号相同的面板，未匹配返回 `{ closed: false }`。

关闭弹窗结束该页面 SDK，不停用后台脚本；停用脚本、修改程序或切换聊天则撤回旧按钮并关闭旧面板。新聊天启动自己的可用脚本，全局脚本仍可使用，但旧页面不能误写新聊天。按钮执行中拒绝重复点击；作者失败显示在菜单并可再次执行，不把整个原生脚本运行状态变成启动失败。面板加载失败显示原因，提供重新加载和关闭。作者外部副作用不能被强制回滚。

## 前端调用脚本

消息网页、正则 EJS 输出的原生网页、角色或应用前端、脚本面板都可调用当前聊天的运行脚本。无需把命令塞进剧情变量或聊天正文；EJS 计算阶段本身没有 SDK，调用写在输出 HTML 的页面脚本中。

后台脚本在启动时登记明确操作。处理函数获得本次 `api`、`signal`、请求数据 `data` 和实际来源 `caller`；业务调用使用这次的 API：

```js
export default ({ api }) => {
  return api.scripts.registerHandler('fill-draft', async ({ api, signal, data, caller }) => {
    if (typeof data !== 'string') throw new Error('请提供要填写的文字');
    signal.throwIfAborted();
    const result = await api.input.set(data);
    return { text: result.text, messageId: caller.messageId };
  });
};
```

前端按钮取得 SDK 后，按作者约定的完整脚本身份发起调用：

```js
const api = await window.ElecKoiReady;
const { characterId } = await api.context.current();
const target = { scope: 'character', ownerId: characterId, scriptId: 'my-draft-script' };
document.querySelector('#fill-draft').onclick = async () => {
  try {
    const result = await api.scripts.request(target, 'fill-draft', '继续探索');
    document.querySelector('output').textContent = `已填写：${result.text}`;
  } catch (error) {
    document.querySelector('output').textContent = `${error.code}: ${error.message}`;
  }
};
```

`my-draft-script` 必须是实际保存的脚本编号。`scripts.list()` 返回 `{items: [{identity, name, actions}]}`，可用于让用户明确选择目标，再把选中项的 `identity` 传给 request；不得取同名、第一个或最后一个脚本作为猜测目标。全局身份的 ownerId 固定为空字符串，角色和预设身份使用各自明确编号。`caller` 由运行服务填写，包含聊天、消息编号、页面类型及脚本或项目来源，不能由请求数据伪造。登记函数只向正在运行的脚本开放，普通消息和面板不能冒充另一个脚本登记操作。

数据与返回值支持完整 JSON：对象、数组、字符串、有限数字、布尔和 null。无参数或无结果时明确使用 null；undefined、函数、循环引用、特殊对象及会丢失属性的值会报错，不截断或静默删除。重复登记、未就绪、目标不存在、未登记操作和处理失败有独立错误原因。每次请求独立等待结果，不因按钮名称相同、显示按钮被隐藏或窗口数量而改变目标。

页面关闭、聊天切换、脚本停用或更新、处理函数撤回都会取消进行中的调用；处理函数应在异步操作后检查 signal，并始终使用本次回调 API。处理完成后不能继续使用该调用 API。此通道只属于当前客户端的实时运行状态，不会落库、进入模型提示词或在重开后重放；已经成功保存的数据不会因后续取消自动回滚，也不自动重试可能已执行的操作。关闭脚本面板不会停止仍启用的后台程序。

可导入示例的角色脚本还登记了 `calculate-score`：目标 scriptId 为 `example-score-rule`，传入 `{score: 12}` 可得到按脚本倍率计算的积分结果，不修改剧情变量。示例步骤见 [原生作者示例](../../packages/examples/native-author/README.md)。

## 当前变量接口

这些方法返回 Promise，修改必须等待结果。成功返回的是规则处理后的实际结果，不一定等于传入内容。

| 方法 | 行为 |
| --- | --- |
| `variables.getState()` | 读取当前聊天变量 |
| `variables.getConfig()` | 读取该聊天绑定的变量配置，没有配置时返回 null |
| `variables.setState(state)` | 用完整对象替换当前状态 |
| `variables.merge(state)` | 递归合并对象，数组与标量替换对应字段 |
| `variables.applyPatch(operations)` | 使用 add、replace、remove 和 JSON Pointer 修改候选 |
| `variables.reset()` | 使用该聊天绑定的初始变量重新执行一次修改 |

变量必须是 JSON 对象。`setState` 不是合并，不应使用它只更新一个字段；`reset` 也不是跳过规则的原始恢复操作。`variables.getState({ messageId })` 通过已加载消息的正式原生快照读取历史，不进入当前状态 Remote；没有准确快照时只拒绝这次历史查询，不改变当前变量或结束聊天。

原生变量补丁不是 Agent 工具的操作格式。路径 `/profile/score` 指向嵌套字段；`/items/0` 指向数组首项；`~1` 和 `~0` 分别表示字段名中的 `/` 和 `~`。`replace` 与 `remove` 的目标必须存在；补丁中任意一步失败，不保存前面已应用的部分。

以下是供作者页面调用的合成示例，不包含外部卡内容：

```js
async function updateMode() {
  const accepted = await ElecKoi.variables.merge({ mode: 'exploration' });
  return accepted.mode;
}

async function replaceScore() {
  return ElecKoi.variables.applyPatch([
    { op: 'replace', path: '/score', value: 20 },
  ]);
}
```

## 规则与失败

普通修改先读取原状态，在独立候选上执行修改和适用的作者规则，等待处理完成后保存一次。合并和补丁作用于开始阶段处理后的候选，不在规则外提前拼出另一份状态。

现有原生变量配置中的 Zod 代码可以校验、补默认值及执行作者明确声明的 preprocess、transform。例如：

```js
z.looseObject({ score: z.number().min(0) }).transform(state => ({
  ...state,
  level: Math.floor(state.score / 10) + 1,
}))
```

这里的 `level` 由作者程序计算，不由导入器猜测。`looseObject` 明确保留额外字段；使用其他对象结构时按 Zod 本身的合同处理，不自动放宽作者声明。

规则失败，SDK 调用拒绝 Promise，原变量不保存。AI 工具收到错误后可以修正再调用，新调用是新尝试；保存已接受的结果时不再重复执行规则。处理期间变量或配置被另一方修改时，本次候选不覆盖较新的数据，调用者需要重新读取后再尝试。

页面关闭或取消操作时，SDK 结束未完成调用并将取消传给 Host。已经开始的作者 JavaScript 不能被强行终止；它迟到返回的结果也不能被接受保存。网络请求或页面操作等外部副作用不属于变量事务，不能宣称一起回滚。

## 聊天、角色与模型

原生 Client 已接通以下方法，数据来自现有产品服务，不在作者页面另建目录或存档：

| 方法 | 行为 |
| --- | --- |
| `chat.current()` | 返回固定所属聊天的摘要 |
| `chat.list()` | 刷新目录，按明确角色编号返回同一角色的聊天；无角色聊天只返回无角色的目录项 |
| `character.current()` | 按聊天绑定编号读取角色库当前资料；未绑定角色时返回 null，绑定角色缺失时报告错误 |
| `chat.create({ title })` | 使用绑定角色的当前人设创建聊天，等待产品创建流程完成后返回摘要，不自动打开新聊天 |
| `chat.open(conversationId)` | 按明确编号打开同一角色的聊天，等待现有聊天服务实际加载后返回摘要；切换被后续操作替代时报告错误 |
| `chat.delete(conversationId)` | 按明确编号删除同一角色的聊天，等待现有删除流程完成；删除当前聊天后不自动打开其他聊天或创建新聊天 |
| `chat.getGenerationState()` | 读取当前聊天的生成状态和现有统计投影，不混入其他聊天的状态 |
| `chat.getModels()` | 刷新现有模型目录并读取全局选择，只提供作者所需字段，不提供密钥、请求头或凭据引用 |
| `chat.selectModel({ configId, model, reasoningEffort })` | 通过现有模型服务选择全局模型及可选档位；由正式适配器校验，返回实际选择结果 |

模型选择仍是产品已有的全局选择，不是角色私有配置，对后续请求的生效时机沿用现有模型服务。推理档位和图像能力仅携带目录明确声明的值，未声明时不推断。`reasoningEfforts` 的键是实际档位编号，值保留目录声明；`false` 表示目录明确声明没有可选档位。`enabled` 若存在，说明该配置当前的启用状态。

统计未提供的部分保持缺失，不填造的零值；没有当前聊天统计时 `stats` 为 null。已有统计中的实际零值会保留。上下文压力和组成是显示参考，不是单次请求的计费事实。返回的角色、模型能力及统计不与产品缓存共享可修改对象。

聊天编号是产品聊天编号，不是 DSH Session 编号；通用 `call` 的打开／删除参数使用 `{ id: conversationId }`。先刷新目录并核对唯一编号与同一角色归属，无角色聊天只操作其他无角色聊天。删除返回 `{ deletedId, chat }`，`chat` 是仍已加载的当前聊天摘要，没有当前聊天时为 null，不根据目录顺序选择替代项。

普通调用在作者页面关闭时结束。打开／删除在目标核对完成、交给现有聊天服务后，单独等待真实结果，不因该操作关闭请求页面而误报失败；此时旧页面的其他调用和事件仍结束，新调用被拒绝。核对期间页面关闭则取消，不启动操作。应用项目页面继续存在时，后续调用使用新选择的聊天。

Host 拒绝删除时 Client 不提前关闭当前聊天；已经在 Host 完成的删除不因之后目录刷新失败或页面关闭而回滚。创建或模型修改也不自动回滚。

### 运行轨迹

`chat.getAgentTrajectory()` 通过现有聊天服务读取正式轨迹目标，返回当前已加载历史的副本，不读取兼容层、不另存轨迹，也不把当前配置当成旧请求。

| 字段 | 内容 |
| --- | --- |
| `conversationId`、`runtimeSessionId` | 产品聊天和对应正式 Session 的实际编号 |
| `history.hasMore`、`history.beforeSequence` | 现有聊天历史的加载状态与游标，不是全部记录总数 |
| `snapshot.events` | 按正式事件身份保留输入、设定、AI 内容、工具结果、重试、错误、命令和压缩等已投影节点；类型由 `kind` 区分 |
| `snapshot.requests` | 每次实际请求的身份、轮次、步骤与结果；`resultSeq` 若存在则明确关联结果，不按顺序或名字补关系 |
| `snapshot.locations` | 事件序号到轮次／步骤位置的 Map；只提供编号和已知状态，不把产品内部读写对象交给作者 |
| `snapshot.toolSchemas` | 调用编号到当次工具结构的 Map；调用时结构不在已加载窗口内时不会补造 |
| `snapshot.systemPrompts` | 若提供，保留请求头窗口之外已加载的系统设定 |
| `snapshot.partial`、`snapshot.runningTools` | 正在输出的内容与准备／执行中的工具；工具通过 `callId`、`parentCallId` 与 `subCalls` 保留嵌套关系 |

AI 内容块保留 `text`、`reasoning`、`tool-call`、`image`、`other` 类型，包括只在最终消息中出现的思考。工具结果的调用头不在加载窗口内时，`call` 和 `callTime` 保持 null，不套用另一条调用。原生类型位于 `@eleckoi/author-sdk`；作者页面不需要访问 DSH 服务或兼容全局对象。

```js
let trajectory = await ElecKoi.chat.getAgentTrajectory();
if (trajectory.history.hasMore) {
  trajectory = await ElecKoi.chat.getAgentTrajectory({
    beforeSequence: trajectory.history.beforeSequence,
  });
}
const location = trajectory.snapshot.locations.get(2);
```

带 `beforeSequence` 时先通过现有聊天历史服务加载更早一页，再读取轨迹；返回累计已加载窗口，不重复存一份历史。游标已失效、Session 不可用或读取失败时报告错误，较早内容不会自动补成空结果。读取期间关闭页面或切换聊天时，不交付旧聊天的迟到结果。

请求状态保持正式轨迹的 `running`／`complete`／`error`；不从耗时为空猜测正在执行，也不把取消误造为成功。已中断的 AI 前缀由 `interrupted` 标明。预览阶段不继续维护草稿中的 `beforeIndex`、`limit` 和虚构的全局记录计数。

## 角色设定库

| 方法 | 行为 |
| --- | --- |
| `settingLibrary.current()` | 读取所属角色的当前设定库原稿，没有绑定角色时返回 null |
| `settingLibrary.getSummary()` | 返回角色库的当前版本编号、条目和文件夹数量 |
| `settingLibrary.replace(library)` | 替换角色库当前内容，包括名称、条目、文件夹及插入位置定义；保留其他版本和管理设置 |
| `settingLibrary.getEntry(id)` | 按明确编号读取角色库的原始条目；不存在时报告错误 |
| `settingLibrary.updateEntry(id, changes)` | 修改指定普通条目的部分字段，保留其他最新字段 |
| `settingLibrary.updateEntries(updates)` | 按编号一次修改多个条目；整组成功或整组不保存，返回顺序对应输入顺序 |

读取的是没有展开角色名、用户名等占位符的原文，不是已经组装好的模型请求，不包含模型工具产生的聊天差异或预设临时投影条目。SDK 绑定页面所属角色，修改与角色配置页保存到同一产品设定库，同时同步当前版本；不是聊天私有副本。使用该角色原稿的后续请求会读取新值，正在发出的请求不改写。

角色编号不能改为另一角色；完整内容替换采用角色配置的正式保存规则，开场白配置通过完整库的 `openingMessages` 与默认编号保存，当前聊天开场白切换仍使用 `openings.select`。普通条目的触发、关键词、读取方式及插入位置引用可以编辑，不增加消息层数插入规则。无效结构、身份不匹配或写入失败时拒绝调用，保留已接受的数据。返回值为独立副本；只修改副本不会保存。关闭页面会取消未完成读取和待执行请求，已经在 Host 完成的同步保存不自动撤回。

模型设定修改工具仍只保存剧情发展的聊天差异，原有差异不因 SDK 修改角色库被删除、覆盖或改写。同一条目已有聊天覆盖时，后续请求仍按原规则使用该覆盖；SDK 的原稿读取不把聊天覆盖当成角色原稿。这两种数据用途不混用，也不向脚本开放绕过模型工具的新聊天差异写入接口。

部分修改使用 `{ id, changes }`，只修改普通条目；编号、类型、开场白数据与创建时间不是可修改字段，修改时间由 Host 保存。条目必须存在，不按标题、数组顺序或相似名称匹配；同一批次不得重复编号。空批次不保存或发送变更通知。`enabled` 只是已有请求规则的开关，打开不等于强制注入，仍由触发模式、必读策略、关键词及插入位置决定处理方式。

## 原生预设条目

| 方法 | 行为 |
| --- | --- |
| `presets.list()` | 返回目录与全局当前预设编号 |
| `presets.current()` | 返回全局当前预设的条目、分组与插入位置原文 |
| `presets.get(presetId)` | 按明确预设编号读取同样的内容 |
| `presets.getEntry(presetId, id)` | 按明确预设和条目编号读取一项 |
| `presets.updateEntry(presetId, id, changes)` | 修改指定预设原稿的部分条目字段 |
| `presets.updateEntries(presetId, updates)` | 原子修改指定预设的一组条目，并在同一事务同步其当前版本 |
| `presets.select(presetId)` | 选择全部聊天后续请求使用的预设，不是仅切换当前聊天 |

预设写入修改产品已有的共用预设原稿，会影响使用该预设的后续请求；不会创建聊天私有预设副本，也没有“一轮后自动恢复”的隐含语义。正在发出的请求不改写。未实现当前聊天独立预设开关或单次生成的临时预设接口，不应使用“改共用原稿，再改回去”模拟它们。普通条目的可编辑字段与设定库一致，固定条目及位置约束遵循正式预设模型；未满足时明确拒绝，不静默关闭或挪动条目。

脚本界面可以把一个选项映射为多个明确条目的开关，无需整份预设读回再覆盖：

```js
const preset = await api.presets.current();
await api.presets.updateEntries(preset.id, [
  { id: 'option-short', changes: { enabled: true } },
  { id: 'option-long', changes: { enabled: false } },
]);
```

这个批次只更改指定字段，以 Host 事务开始时的最新数据为基准，不覆盖其他脚本已保存的正文、关键词等字段。任一编号不存在、修改无效或磁盘写入失败，整组不提交也不发布成功通知。条目删除与新增仍使用已有设定库整体编辑；预设 SDK 当前不开放创建或删除条目。

## 原生脚本合同

以下合同已实现，原生 Host 与 `eleckoiAuthorRuntime` Client 已加入默认装配。角色配置中新建脚本使用原生模块声明，源码留空且默认停用；运行状态按作用域、所有者和项目编号显示，不因编号相同混淆不同库的脚本。启用前由作者填写启动函数，空白草稿不会自动补入源码。

源码只保存为普通 `.js` 文件，数据库只保存文件引用、所属关系和管理设置。读取以文件内容为准，外部编辑使旧界面草稿失效，保存失败不覆盖有效源码。卡导入自动关联角色，不要求重新绑定；没有旧脚本库启动转换或数据库源码转换。

角色配置的三类脚本标题旁提供“打开目录”按钮，经正式 Remote 在 Host 本机打开所属目录，不保存界面草稿，不用系统默认程序直接执行 `.js`。入口文件位于该目录的 `scripts/` 下，由稳定编号登记。作者可以在所属目录内增加辅助模块，例如入口中使用 `import { derive } from '../helpers/derive.js'`。运行器通过原生 `/eleckoi/scripts` 路由加载普通浏览器 ES 模块，不改写 import，不提供 Node 内置模块、TypeScript 编译或 npm 裸包名解析。资源路径可使用 `new URL('../assets/config.json', import.meta.url)` 明确相对模块的位置。

Host 监听源码目录；外部保存或替换文件后，Client 读取内容版本，真实变化才清理旧程序并启动新程序，重复通知不重复启动。辅助模块也参与版本判定，旧版本资源请求在文件变化后返回冲突而非混用新旧代码。源码或模块加载错误仍显示在原管理入口，修正后可重新启动。

原生角色卡与预设的 JSON、PNG 导出携带所属脚本目录内的辅助模块与资源文件，保留相对路径和二进制内容。`script_library.trees` 保存入口程序及管理配置；`script_library.files` 是 `{ path, data }` 列表，`path` 是所属目录内的相对路径，`data` 是原始字节的 Base64。登记的入口不在附件列表重复保存，附件不能覆盖入口。导入自动关联新角色或预设，脚本库保持停用，由用户明确启用；文件与管理记录一起提交，失败一起恢复。全局脚本不复制到每张角色卡，预设脚本不复制到角色脚本库。删除所属角色或预设同时删除其脚本目录中的文件，不删除共享全局文件。

脚本附件及角色卡、预设容器不设置产品侧的固定大小上限。数据库单文件快照不包含这些源码目录，不是完整产品备份。

脚本项目使用明确的声明 `runtime: { kind: 'eleckoi-module', apiVersion: 1 }`。运行器不根据名称、源码含有某个词、文件位置或旧 API 全局对象判断它是原生程序。未声明的源码保留，不自动转换；已声明原生标准但版本不受支持时明确报告原因。

原生程序导出启动函数，启动时接收 SDK、取消信号、脚本设置、所属库的共享设置和明确作用域。可以返回异步清理函数。管理运行器按全局、当前预设、当前角色的库顺序及各库的树顺序启动；停用时逆序清理。程序在启动阶段完成规则注册，全部启动成功后才接受变量任务；不能在启动函数中等待需要这些规则处理的变量保存。

关闭时先取消候选与 SDK 调用，再等待清理函数完成，最后移除对应脚本页面。清理函数执行时页面仍存在，但不能继续通过已关闭的 SDK 保存变量。启动失败保留管理服务和错误状态；普通消息刷新不反复重启同一份失败源码，修改程序、启停或重新连接后才重新启动。

### 脚本设置

这些接口只提供给明确绑定身份的原生运行脚本，普通消息页面和前端项目不声明这项能力。调用者不能传另一脚本、角色或预设编号来改变归属。

| 方法 | 行为 |
| --- | --- |
| `script.getSettings()` | 读取本脚本设置，返回 `{ revision, values }` |
| `script.setSettings(values, expectedRevision)` | 用完整 JSON 对象保存本脚本设置，返回实际保存值与新版本 |
| `script.getLibrarySettings()` | 读取所属库共享设置，返回相同结构 |
| `script.setLibrarySettings(values, expectedRevision)` | 保存所属全局／角色／预设库的共享设置 |

`revision` 是所属库的管理修改版本，源码和其他管理编辑也会使旧版本失效。并发修改不覆盖较新内容；冲突后重新读取，由作者决定如何合并。设置保存在现有产品脚本记录，不新增表，不改源码或其他脚本设置，不作为聊天变量发送给模型。全局库共享设置影响所有使用该库的角色，预设库共享设置影响使用该预设的角色，角色库只属于指定角色。

仅保存设置不重启程序、不重新连接规则流。管理界面的设置编辑同样实时更新运行设置。启动函数的 `context.settings` 和 `context.librarySettings` 每次读取返回最新副本；解构或保存到局部变量的是当时的快照，不会自动更新。需要持续读取新设置时保留启动 `context`，例如：

```js
export default context => {
  const stop = context.api.variables.registerRule({
    id: 'calculate-score', stage: 'afterSchema',
    run(candidate) {
      candidate.state.total = Number(candidate.state.score)
        * Number(context.settings.multiplier ?? 1);
    },
  });
  return stop;
};

async function saveMultiplier(api, multiplier) {
  const current = await api.script.getSettings();
  return api.script.setSettings({ ...current.values, multiplier }, current.revision);
}
```

Host 为同一候选固定设置，并在开始阶段任务交付这份设置，不能因配置通知迟到而使用旧值。计算期间设置变化，只拒绝该次变量修改，脚本继续运行，下一次尝试读取新设置。设置保存不是变量候选事务的一部分，不能把失败的变量计算描述为会撤回已经保存的设置。页面关闭后拒绝新调用；Host 已完成的同步保存不自动回滚。

```js
export default ({ api, signal, settings }) => {
  const stop = api.variables.registerRule({
    id: 'calculate-level',
    stage: 'afterSchema',
    async run(context) {
      context.signal.throwIfAborted();
      context.state.level = Math.floor(Number(context.state.score) / 10) + 1;
    },
  });
  return () => { stop(); };
}
```

`variables.registerRule({ id, stage, run })` 是本地同步注册，返回取消函数，不通过 `call()` 发送函数。编号只要求在同一脚本内唯一；不同作用域中相同脚本编号、不同脚本中相同规则编号不会互相覆盖。关闭页面会自动撤回本页规则。

阶段顺序固定为 `before`、应用本次修改、`after`、原生变量配置中的 Zod、`afterSchema`。`run` 可以异步执行，修改 `context.state`，不返回另一个结果；`context.before` 是修改前的独立副本。规则内的 SDK 当前变量读取、替换、合并和补丁使用同一候选，不递归向 Host 保存。原生脚本不替换 Zod 处理入口，也不启动正文命令解析器。

一份候选固定当前规则与脚本版本。处理中修改注册、停用脚本、断开页面或编辑配置，本次结果不保存；迟到返回不能复活已取消的任务。运行错误与 Zod 错误都可以反馈给 Agent，新尝试仍能重新执行规则。运行状态、未接受的候选与回调只在内存，不另存一份业务状态。

## 原生 HTML 消息

“应用于 AI 回复”的正则在回复结束后处理整条 AI 文本回复，包含 `<FINAL>` 与 `</FINAL>` 标签及其前后内容，原始回复和编辑框原文保持完整。流式阶段直接显示普通正文，不运行正则替换；正文从 `<FINAL>` 开始，`</FINAL>` 后的文字继续显示。回复结束后，正则转换出的前端无论位于开始标签前还是后都保留。修改已保存的正则仍会重新计算已有消息。推理、工具调用和工具结果按 DSH 的结构化类型独立呈现，不进入 AI 文本正则。

文字显示与前端加载分别完成交接。前端文档就绪并返回首个高度前，保留已显示的文字；同条消息的前端全部就绪后一起切换显示。消息元数据刷新时保留已有前端，新的显示结果到达后再更新；文档加载失败显示具体错误。

普通脚本异常、未处理的 Promise 拒绝和附加资源加载错误保留页面，在“页面运行提示”中显示诊断；SDK 挂载失败仍明确显示加载失败。消息文档以当前视口高度开始布局，再测量正文及定位元素的实际范围；百分比全屏布局因此有确定的初始包含块，普通内容收敛到实际高度。多条正则可以逐步组装一份 HTML 围栏文档，闭合后才保护整份文档中的代码。

固定注入的设定正文、正则表达式、变量名称与路径、预设历史和介绍不按任意字数或条数截短。缺失的消息历史变量明确返回 `VARIABLE_HISTORY_NOT_AVAILABLE`，不会在后续刷新时把显示占位的 `{}` 当作保存记录；实际保存过的空对象仍是有效快照。

聊天中的 HTML 互动消息已接入独立原生入口。页面在 `head` 中用唯一的 `<meta name="eleckoi-author-api" content="0.1.0">` 声明 SDK 版本，作者代码先等待 `window.ElecKoiReady`，再使用返回的 SDK。声明以实际 HTML 元素读取，不根据源码含有 `ElecKoi`、脚本名称或字符串外观推断；未知版本或重复声明明确报错。没有声明的既有页面保留原路径，不自动转换。

```html
<!doctype html>
<html>
<head>
  <meta name="eleckoi-author-api" content="0.1.0">
  <script type="module">
    const api = await window.ElecKoiReady;
    document.querySelector('button').onclick = async () => {
      try {
        const accepted = await api.variables.merge({ score: 10 });
        await api.chat.send(`Selected score: ${accepted.score}`);
      } catch (error) {
        document.querySelector('output').textContent = error.message;
      }
    };
  </script>
</head>
<body><button>Confirm</button><output></output></body>
</html>
```

这里的变量修改先等待全部作者规则与原生校验成功；失败进入作者的错误处理，不发送后续消息。直接发送不覆盖输入框草稿。这不是变量与消息共同回滚的事务，发送失败也不会撤回已经接受的变量修改。

页面由现有消息渲染器创建，SDK 由注入的原生 Client 服务安装，业务仍通过生成的 Remote 调用。页面固定所属聊天与消息编号，普通消息刷新保留文档；源码变化、卸载或服务撤回结束该页面的 SDK 调用和监听，不把它转向后来选中的聊天。此入口不加载兼容脚本、浏览器库或旧全局对象，作者需要的额外库由其页面明确提供。

## 当前边界

### 前端项目与资源

Host 的前端项目、资源、清单、选择及消息渲染器设置已由原生 `eleckoiAuthorFrontends` Remote 提供。项目源码与素材保存为文件，Host 的文件索引保存登记，不新增 SQLite 表；已有项目按明确编号整理到这一所有者，不在旧存储保留另一份正常读写登记。原生 `/eleckoi/frontends` 资源路由不需要兼容服务，随正式 Host 插件卸载。

原生 Client 的 `eleckoiFrontendProjects` 使用上述生成 Remote 管理应用或明确角色的工作区，变更流只通知工作区版本，由 Client 合并通知后读取最新状态；切换所有者或卸载后不接收旧请求的迟到结果。现有应用前端工作台与控制器已通过注入的原生服务读取和保存项目，不要求兼容运行器存在；根页面、页面与插件声明的插槽仍使用官方 SlotCore 注册与清理，保留现有恢复入口。

应用项目中的原生页面使用与原生消息相同的版本声明，等待 `ElecKoiReady` 后调用 SDK。宿主补充入口目录的完整素材基址，不改写作者脚本，也不覆盖作者已声明的 base；脚本、样式及二进制素材通过原生资源路由加载。`context.current()` 返回 `application-frontend`、项目编号、入口文件、视图及当前聊天身份。没有选择聊天时页面仍存在，读取上下文可用，需要聊天的数据操作报告未选择聊天；切换聊天取消正在执行的旧聊天调用，随后新调用才使用新聊天。固定聊天消息页面不采用这一动态规则。

角色配置的“前端”入口导入完整 HTML / ZIP 包，并提供预览、使用、改名、导出、移除和恢复默认；界面导入后默认选择并启用。页面内不新建项目或文件、不编辑源码；源码可由工作室编程工具制作，再通过 frontends 创作能力导入或更新，创作接口默认 select=false 保存草稿，启用时明确 select。文件保存在原生项目目录，不新增 SQLite 表。预览返回后保留包与文件选择并释放预览实例；启用的项目只属于明确角色。包内目录及文件直接浏览，移除包需确认。两条创作路线见 [角色前端创作](../../eleckoi-plugin-development/references/character-frontends.md)。

角色项目当前接管聊天内容区，保留现有输入框、发送、历史与轨迹操作；不是整套应用界面替换。清单使用 `scope: "character"`，无绑定时运行明确的 `manifest.entryFile`；有绑定时只允许一条 `target: "root"` 且 `view` 省略或为 `"chat"` 的绑定，其他绑定明确报告未支持，不按项目顺序或文件名猜测入口。角色页面必须有原生 SDK 声明，不启用旧接口回退。`context.current()` 返回 `surface: "character-frontend"`、`scope: "current-character"` 和固定角色编号。实际聊天页面还固定聊天编号，切换聊天后关闭旧 SDK；配置预览只有在当前聊天属于该角色时才可调用聊天功能，否则上下文中的聊天编号为空，相关调用明确失败。恢复默认撤回页面，不删除项目文件。样式只进入角色页面自身，不注入应用外壳。

项目页面当前接通聊天作用域中已支持的方法、上述上下文读取，以及消息修改、生成与音频事件；未选择聊天时可读写共享音频设置。事件回调执行前再次核对当前聊天，取消订阅或切换聊天后不交付排队中的旧回调。聊天切换、删除和运行轨迹读取已接通。角色工作区服务、管理入口和聊天页面已接通。删除角色同时删除其全部前端项目、项目目录及选择记录，不删除应用级或其他角色项目；角色删除失败恢复原目录，中断后以实际角色提交状态恢复或完成清理，不根据当前选择猜测归属。项目管理使用角色配置中的前端包页面，不作为 `ElecKoi` 浏览器 SDK 的作者页面能力。当前正式管理服务的参数与返回值由 [Remote 参考](../../eleckoi-plugin-development/references/api-remote.md)中的 `eleckoiAuthorFrontends` 生成，不把内部同名入口当成作者已可使用的能力。

### 生成通知

原生脚本、消息与项目页面共用 `events.on()`。生成通知来自当前绑定的正式 DSH Session：实时追加与完整历史基线分别处理，分页或重新打开已经结束的聊天不会回放生成通知；正在执行的明确轮次可在页面接入时同步。卸载或 Session 重新绑定撤回旧观察，不把撤回谎报为取消。

每次观察有独立的 `generationId`，包括同一 Session 内的连续生成和重新生成。`runId` 是所属原生 Session，`turn` 是正式轮次，不单凭 Session 编号区分每次生成。`chat.getGenerationState()` 仍读取现有聊天快照，并补充当前观察编号及与正文通知一致的序号；尚无明确观察或轮次时对应身份字段为 `null`。

| 事件 | 行为 |
| --- | --- |
| `agent.state.changed` | 正式轮次开始、流式运行、结束或错误状态；停止请求的 Promise 与正式取消结束分别处理 |
| `agent.output.delta` | 当前最终正文变化；`operation` 区分追加与替换，`accumulated` 始终是本次完整正文，`sequence` 在本次观察内递增 |
| `agent.process.updated` | 同一处理项发生实际变化时通知，不重复发送未变项 |
| `agent.generation.stats` | 通知当前同一聊天、同一观察期间的正式统计变化；统计是现有 Session 累积值，不是本轮独立计数，旧的未变快照不会冒充本轮新通知 |
| `agent.run.finished` | 按正式结束原因区分 `completed`、`output-limit` 与 `blocked`；有正式回复时等待唯一的同 Session、同轮次及同事件位置的消息，零回复轮次或已明确结算而无可显示消息时，`message` 为 `null` |
| `agent.run.cancelled` | 正式取消或中断结束，不发布正常完成通知 |
| `agent.run.failed` | 传递正式结构化错误，或明确标明当前观察中的实时失败；通知处理失败不代替模型生成成功 |

生成通知只是观察，不是变量处理规则。作者规则仍必须通过既有异步规则流程完成，Agent 工具仍等待结果；监听生成事件不会自动再次执行变量规则。未进入可观察正式轮次的准备或提交错误，仍由调用的 Promise 返回，不制造虚拟轮次和回复。

原生消息能力已接入注入的聊天 Client 服务；正文仍来自正式 DSH Session，历史变量只使用明确的原生历史字段，不读取兼容显示变量或用当前值代替。

| 方法 | 已接入的行为 |
| --- | --- |
| `messages.list()`、`get(id)`、`current()` | 读取已加载的消息、指定消息或当前列表末条消息 |
| `messages.getPage()` | 返回已加载列表、`hasMore` 和 `beforeSequence` 游标 |
| `messages.pageOlder(beforeSequence)` | 按当前游标加载更早历史，返回扩展后的已加载窗口；游标失效时拒绝调用 |
| `messages.setContent(id, text)` | 保存指定正文，开场白与正式 Session 消息分别交给其现有所有者 |
| `messages.deleteFrom(id)` | 删除指定消息及后续消息，返回 Host 的完整删除与保留数量，不按已加载窗口推算 |
| `messages.regenerate(id)` | 指定 AI 消息，按正式输入关联或唯一的同 Session 轮次输入重新生成 |
| `messages.editAndRegenerate(id, text)` | 在同一 Session 修改指定用户输入并重新生成，不另发一条重复用户消息 |
| `media.getMessageAttachments(messageId?)`、`getMessageAttachment(messageId, attachmentId)` | 读取明确消息的附件；省略消息编号时，消息页面使用所属消息，聊天页面使用最新消息 |

消息的 `variableState` 为准确历史对象或 `null`，`null` 明确表示缺失，不能解释为变量为空。找不到尚未加载的消息时先分页，不自动选择相邻消息。读取到的变量与处理轨迹是作者本地副本，修改副本不保存业务数据。重新生成等待现有正式流程结束，再按保留输入的正式关联确定回复编号；失败或取消拒绝 Promise，不返回猜测的回复。

正式图片复用现有图片资源所有者。普通文件目前只提供编号、名称和字节数，`url` 与 `mimeType` 为 `null`，尚未接入浏览器下载；待入库图片未确认的媒体类型和字节数也为 `null`，不按文件名或数据外观猜测。正文保存或删除已经交给 Host 后，关闭作者页面不能将其描述为自动回滚；页面关闭会拒绝未完成的 SDK 调用，不将迟到结果交给新聊天。

原生音频的 11 个方法已由同一 Client 播放器提供，不依赖兼容运行器，也不另存播放业务数据：

| 方法 | 已接入的行为 |
| --- | --- |
| `audio.play(options)` | 在指定频道替换曲目，实际播放开始后完成；浏览器拒绝播放时拒绝 Promise |
| `audio.pause(channel?)`、`resume(channel?)`、`stop(channel?)` | 暂停、续播、停止；停止释放媒体资源但保留列表，随后续播从零开始 |
| `audio.seek(seconds, channel?)` | 设置位置并返回实际媒体状态；已知时长内限制位置，媒体完成定位后另发时间事件 |
| `audio.getState(channel?)`、`getPlaylist(channel?)` | 返回频道状态或列表副本；读取空频道不创建媒体元素，未知时长为 `null` |
| `audio.setPlaylist(channel, items, options?)`、`appendPlaylist(channel, items)` | 替换或追加曲目，按明确索引起播；顺序、循环或每轮不重复的随机播放 |
| `audio.getSettings()`、`setSettings(settings)` | 读取或部分修改同一 Client 的主音量、静音和频道设置，实际音量为主音量 × 频道音量 × 曲目音量 |

四个频道为 `bgm`、`ambient`、`voice`、`sfx`，省略频道使用 `bgm`。播放状态属于当前聊天，所有原生脚本和前端共用；关闭单个页面不会停止已经完成启动的播放，但其未完成的播放调用会取消并暂停。切换或取消选择聊天释放旧媒体；Client 卸载释放全部媒体、监听器及未完成调用。设置仅保存在本次 Client 内存，聊天切换保留，退出不恢复。替换曲目、列表或设置前验证输入，不因无效输入停止已接受的播放。相对音频 URL 按作者页面实际 `baseURI` 解析，不按宿主页面路径解析；Host 资源路由提供文件长度与单段字节范围读取，供浏览器定位播放位置。外部媒体服务的可播放、可定位行为仍以浏览器实际结果为准。

- `@eleckoi/author-sdk/browser` 提供原生安装器和 `createAuthorVariableBindings`，不依赖兼容包。后者仅将当前变量方法绑定到 DSH 生成的原生 Remote，不注册第二套跨端协议。
- 实际应用已使用上述绑定发送当前变量操作；现有兼容入口也转交同一原生服务，不另外实现合并或补丁。
- 合成回归使用实际生成的 DSH Client、Gateway、Host 与浏览器 SDK，不装配兼容服务或加载对应页面资源，覆盖变量读写、Zod、异步处理、失败重试、冲突和页面取消。
- `AuthorScriptSession` 与 `AuthorVariableRuleRegistry` 提供原生脚本运行和规则注册核心，不导入兼容包。Host 的 `ElecKoiAuthorScriptsApi` 从正式脚本库生成原生清单，使用 DSH 生成的双向 Remote 等待结果；已在不装配兼容服务的回归中验证。
- 原生脚本 Host/Client 已加入默认启动。默认变量规则由原生 Host 持有，不同时注册旧浏览器变量规则提供者；既有兼容运行器排除明确声明原生模块的脚本，不重复启动它们。
- 浏览器回归覆盖生产消息组件及应用前端控制器中的原生 HTML 页面、项目模块与样式及图片资源加载、异步辅助计算、规则失败后修正重试、按钮直接发送消息、启动错误后修改恢复、SDK 关闭及页面资源释放。脚本执行现使用版本化文件路由，不再从源码字符串建立 Blob 模块。应用项目回归覆盖桌面与窄窗口、未选择聊天时保留页面、切换聊天、服务撤回和恢复入口清理，并检查没有额外错误资源请求。浏览器回归只使用合成页面和受控服务；另有实际 DSH 生成 Client、Gateway、Host 的独立项目管理链路回归。这两类验证不能代替完整 Electron 应用验收。
- 原生输入框操作使用注入的官方 `conversation` 服务和当前绑定的 Session 上下文，读取与写入实际 `SessionInput`，不操作另一份页面草稿。`input.set` 只修改草稿；`input.send` 请求官方输入框提交当前草稿和附件，`submitted: true` 表示已请求提交，不是生成成功回执。空输入或正在裁决、提交时返回 false；其后处理、错误和草稿恢复仍由官方输入框管理。`chat.send` 不替换草稿，走现有正式发送流程并等待生成完成，返回以本次请求编号匹配的用户消息编号，不用显示列表末项或回复快照猜测。停止生成使用正式聊天服务，不依赖显示快照中可能为空的请求编号。
- 原生 product-api 不再隐式装配兼容服务；旧服务只由兼容 bundle 的明确子入口装配，默认兼容配置仍保留。实际桌面 Host 检查使用删除兼容 bundle 的独立配置，覆盖冷启动、重开、原生变量和单次 Zod 处理、失败重试、三种脚本归属及前端文件，确认兼容 Remote 不可用、兼容资源不存在。
- 实际 Electron Client 检查使用生产 Renderer、沙箱 Preload、受管 Host 和本地合成模型，覆盖角色配置新建、保存与明确启用，模块、样式和图片资源，三类脚本及异步规则，校验失败后重试，官方输入框读写、追加、清空和提交，以及按钮直接生成而保留草稿、生成通知、停用和退出清理。设定与预设的批量开关检查原稿与当前版本，并通过实际模型端收到的请求验证关闭项不发送、开启项按原规则发送。删除角色检查项目和角色脚本移除、运行页面撤回、旧 SDK 关闭及资源缺失，同时确认应用项目、其他角色项目和全局及预设脚本保留。这条检查纳入 `pnpm check:electron-dsh`，不加载兼容 bundle 或页面资源；只证明这些明确场景，不表示现有兼容代码或所有其他产品领域已删除。
- 可导入的原生作者示例也通过同一实际 Electron 检查：角色和预设导入、两个开场白各自绑定的初始变量版本、辅助模块、异步计算、设置保存、拒绝后重试、明确启用角色前端、预设条目开关、全局输入框命令及直接生成。开发文档页面从当前 SDK 合同生成接口与类型参考，桌面与窄窗口检查覆盖导航、搜索及资源显示。
- `mountDocument` 为同源作者页面安装固定聊天作用域的 SDK；切换到其他聊天后撤回，普通未完成调用取消，不改为操作新聊天；已正式交接的聊天切换或删除等待实际操作结果。`mountProjectDocument` 必须明确声明应用或角色作用域：应用调用固定开始时选中的聊天，角色调用还校验所属角色与可选固定聊天。当前通用请求方法表共 71 项：普通聊天页面已接通 65 项，4 项脚本设置及 2 项面板方法只在所属脚本与其面板提供；完整接口参考另含 `call` 和 4 项本地函数，共 76 项。生成事件已接通，原生作者阶段的独立运行已完成验收。能力查询只列本页已接通方法，未知操作明确报告未接通；现有兼容配置与有效数据仍保留。
- 原生作者运行环境与数据独立于外部格式转换；MVU 变量导入不改变原生 SDK 的创作合同。

Host 参数与返回类型见 [Remote 参考](../../eleckoi-plugin-development/references/api-remote.md)中的 `eleckoiAuthorVariables`。阶段验收、数据归属与明确边界见 [ADR 0032](../adr/0032-native-script-libraries.md)。
