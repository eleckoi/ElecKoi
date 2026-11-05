<!-- Generated from docs/plugins/lifecycle-and-data.md; run pnpm generate:plugin-docs. -->

# 生命周期、数据与安全

## Bundle 生命周期

| 操作 | 必须发生的行为 |
| --- | --- |
| 安装 | 校验包名、版本、DSH 兼容性、manifest 和依赖；不得执行浏览器登录 |
| 启用 | 应用 bundle patch，等待 `inject` 依赖，挂载 Host 与 Client 插件 |
| 重启 | 从 profile 与锁定依赖恢复同一装配，不依赖上次进程的全局变量 |
| 停用 | 撤销 slot、service、事件、provider、timer、网络请求和其他 fiber 副作用 |
| 卸载 | 先停用，再移除包与 profile 选择；保留不属于插件的产品数据 |

插件顶层模块只声明常量、类型和插件入口。需要释放的资源应放入 `ctx.effect()`，或使用 `ctx.on`、`ctx.provide`、Slots、DSH provider registry 等会自动绑定当前 fiber 的 helper。

```ts
ctx.effect(() => {
  const controller = new AbortController()
  const timer = setInterval(refresh, 30_000)
  return () => {
    controller.abort()
    clearInterval(timer)
  }
}, 'example refresh loop')
```

当多个资源有 teardown 顺序要求时，把它们放在同一个 effect 中并由一个 disposer 反向释放。

## 数据所有权

| 数据 | 权威 owner | 插件访问方式 |
| --- | --- | --- |
| 角色、角色卡 | ElecKoi personas/characters 模块 | 角色 service 与 UI owner actions |
| 设定库、变量、正则 | 对应 ElecKoi 配置模块 | 配置 service 与编辑 slot |
| 用户资料 | ElecKoi persona 模块 | `eleckoiPersona` 与资料编辑 slot |
| Agent 预设 | ElecKoi preset 模块 + DSH preset 生命周期 | `eleckoiPresets` 与 preset slots |
| LLM 提供商、profile 与密钥 | DSH settings/profile/credentials | DSH 官方模型设置；Client 只读取 `eleckoiModels` 目录投影 |
| 聊天目录和产品消息 | ElecKoi conversations 模块 | `eleckoiConversations` |
| DSH Session 日志 | DSH Session/format/persistence | 正式 Session API；消息编辑 service |
| 插件私有设置 | 插件或 DSH Settings/Storage | 插件自己的命名空间 |

第三方插件禁止：

- 直接打开 ElecKoi SQLite；
- 直接读写 DSH JSONL 文件；
- 导入 `apps/desktop/src/main` Repository；
- 恢复或调用已经删除的 Desktop Gateway、业务 Preload bridge 或 `window.eleckoi`；
- 通过 DOM 查询或修改另一个插件的内部状态；
- 修改 `ctx.llm`、`ctx.tools` 等 service 的内部注册表。

## Session 数据

需要在重启、恢复、fork 或模型上下文中保持的事实必须使用 DSH 正式 Session 事件和格式。实时流式 UI 可以消费结构化运行事件，但不能把尚未 settlement 的临时片段伪装成持久消息。

消息编辑与回退必须通过 `eleckoiSessionEditor`，它会先关闭活动写句柄并使用当前 Session 格式处理；插件不得自行查找或改写 `session.vN.jsonl`。

角色聊天保持一条聊天对应同一个 Session。消息编辑、删除、回退和重新生成均不分叉、不切换 Session ID。

角色扮演请求只让旧轮次的用户输入和最终回复进入模型上下文，旧推理、工具流程和 Provider replay state 不参与后续轮次；当前轮次的完整推理、工具调用和工具结果继续顺承。这是请求投影规则，历史轨迹仍保存在正式 Session 日志中。

### 请求上下文与统计

轨迹视图从 DSH 官方 `trajectory` 数据源读取事件和分页，界面扩展位为 `eleckoi.roleplay.trajectory`。输入菜单的“请求上下文预览”使用独立大弹窗，左侧列本次运行的轮次和请求，右侧显示按实际发包顺序排列的可读消息、设定位置和工具结果。

Host 在真实聊天请求完成产品装配后，交给 LLM Runtime 前捕获不可变消息版本；未变化的消息和设定共用内存内容。目录通过生成的 `ctx.remote.eleckoiConversations.requestPreviews()` stream 传输轻量身份，点选通过 `requestPreview()` 临时生成当前正文。关闭弹窗停止界面读取，聊天时仍持续捕获；彻底退出客户端后清空，重新启动不从日志恢复历史预览。预览不增加 Session 事件、产品数据库记录、投影缓存或浏览器存储，见 [ADR 0029](../adr/0029-ephemeral-request-context-preview.md)。旧全文事件及其正式信封修复仅为保留已有数据继续存在，见 [ADR 0019](../adr/0019-informational-session-records.md)。

总轮次、步骤和 Token 使用 DSH 官方 `sessionStats`、`tokenUsage` 整日志投影；上下文占用读取 `contextPressure` 和 `contextBreakdown`。删除与重新生成关闭旧句柄并重开同一个 Session，所有投影只根据保留日志重新计算。图片通过官方 `uiConversation.imageUrl` 和 Session 附件合同读取，缓存随 Session 绑定释放。

## 密钥与网络

- 密钥只存在于 Host 的凭据服务、受保护设置或进程环境。
- `ctx.credentials` 是通用 Host 凭据服务，不限于 LLM。图片、语音或其他模型插件应使用自己的 scope、设置命名空间和 credential reference；官方 LLM 模型页只管理 LLM 适配器。
- Client 不接收完整密钥，也不把密钥拼入错误文案。
- 网络调用必须支持取消、超时、响应大小限制和安全 URL 校验。
- 日志、遥测和异常 cause 不得输出 Authorization header 或原始密钥。

## 错误与失败隔离

- `apply()` 抛错会让当前 Cordis fiber 进入失败状态；不要静默吞掉装配错误。
- Slot 组件崩溃由 DSH renderer 边界报告；组件仍应提供可恢复的局部错误状态。
- Host 操作失败应返回稳定错误，不让 Client 无限等待。
- 停用过程中 disposer 应尽力幂等；异步释放由 Cordis 等待。

## 卸载数据策略

卸载默认只移除插件代码、profile 选择和插件私有缓存。角色、聊天、预设和 DSH Session 不属于插件，必须保留。DSH 模型 profile 与凭据按其官方所有权和设置操作管理。插件若提供“删除数据”操作，必须由用户显式触发并清楚标明范围。
