<!-- Generated from docs/plugins/regex-ejs.md; run pnpm generate:plugin-docs. -->

# 正则替换中的 EJS

角色卡编辑与预设编辑统一使用「正则」入口。替换内容可以是普通文字、HTML 或标准 EJS 3.1.10；不另存显示模板，不提供消息前后插入选项。全局、当前扮演预设、角色的正则依次执行，启停、顺序、作用对象、深度、捕获组和宏配置沿用同一份正则规则。

## 配置与执行顺序

在「替换为」直接填写 EJS。先执行该范围适用的全部正则，再计算来自正则替换的 EJS（原文中的模板示例保留为文字），最后交给显示或模型请求；EJS 结果不会再递归执行。中间正则可以继续处理前一个规则的输出。

- 「仅修改显示内容」决定消息显示侧，不把显示 HTML 写回消息原文或送给模型。
- 「仅修改提示词内容」决定模型请求侧，不改消息显示或 Session 原文。
- 两项都开启时两侧分别计算；两项都关闭时沿用现有正则的保存／显示范围。
- 流式消息分片不计算显示 EJS，完成后再计算。修改或停用正则后，现有消息通过原正则刷新链重新计算。

正则测试区可明确选择测试对象、显示／提示词／保存范围，并提供测试变量 JSON。`null` 表示没有快照，不用当前聊天变量冒充测试数据。语法或执行失败显示错误并保留原文；模型请求计算失败则明确拒绝本次请求。

## 可变数量的选项

模型回复：

```text
<option>
进入大厅
沿河探索
回旅馆休息
</option>
```

匹配表达式填写 `/<option>[\s\S]*?<\/option>/g`，作用对象选 AI 回复，开启「仅修改显示内容」，替换为：

```ejs
<div class="choices">
<% const found = rawContent.match(/<option>([\s\S]*?)<\/option>/);
   const choices = found ? found[1].trim().split('\n').filter(line => line.trim()) : [];
   for (const choice of choices) { %>
  <button><%= choice %></button>
<% } %>
</div>
```

循环次数取决于实际选项数量。`$1`、`$<命名组>`、`$&`、`{{match}}`、`$$` 仍按正则合同先替换；将任意捕获文本直接拼进 EJS 的 JavaScript 字符串会受到引号影响，需要解析原文时可像示例一样从 `rawContent` 提取。

## 语法与上下文

| 语法 | 含义 |
| --- | --- |
| `<% JS代码 %>` | 执行，不直接输出 |
| `<%= 表达式 %>` | 输出并转义 HTML |
| `<%- 表达式 %>` | 原样输出 |
| `<%# 注释 %>` | 不执行、不输出 |
| `<%%`、`%%>` | 输出字面的模板标记 |
| `-%>`、`<%_`、`_%>` | 标准 EJS 换行和空白裁剪 |

支持判断、循环、函数、JavaScript 正则、计算及 `await`。使用标准符号并保留源码空白，不提供文件 include、DOM、Node 或业务 SDK。

| 名称 | 内容 |
| --- | --- |
| `content` | 当前范围全部正则替换后的内容 |
| `rawContent` | 显示侧为消息原文；请求侧为该请求文本块的输入内容 |
| `message` | `{id, conversationId, role, status, content}` |
| `surface` | `Display`、`Prompt` 或测试指定的 `Stored` |
| `variables` | 显示侧为该消息历史快照；提示词侧为本次请求读取的变量快照 |
| `getvar(path, {defaults})` | 按点分路径读取快照；defaults 只处理字段不存在 |

消息与变量只读。没有快照时调用 getvar 会报错；此处没有旧独立模板的 `match/captures/groups/index` 上下文，捕获替换仍使用正则本身的语法。

计算结果只存在于本次显示或请求内存中，不建立模板库或结果存档。显示计算在可撤回的 Web Worker，提示词计算在独立 Worker 的 JavaScript realm 中完成；结束或取消释放 Worker，不向作者代码传入 Host 对象。Worker 和独立 realm 不构成对任意不可信 JavaScript 的安全保证。

## 网页交互

生成的 HTML 沿用现有富消息渲染。需要按钮调用作者 SDK 时输出完整 HTML 文档，在 head 放唯一的 `<meta name="eleckoi-author-api" content="0.1.0">`，页面脚本等待 `window.ElecKoiReady`。EJS 计算本身没有 SDK；输出页面可以填写草稿、读取变量或[调用指定脚本](author-sdk.md#前端调用脚本)。

完整示例见 [原生作者示例](../../packages/examples/native-author/README.md)。正则随原来的角色卡、预设和正则版本格式保存与导入导出，不另携带显示模板字段；被移除的独立模板不转换为正则。
