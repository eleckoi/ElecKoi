<!-- Generated from docs/plugins/upstream-compliance.md; run pnpm generate:plugin-docs. -->

# DSH 与 Cordis 合规基准

本目录以仓库锁定的 DSH 提交 `b830ec950faba0a46dda564be3e2d854afed94f1` 为准。开发插件前必须阅读上游原文：

- [Cordis 入门](https://github.com/deepseek-ai/deepseek-harness/blob/b830ec950faba0a46dda564be3e2d854afed94f1/docs/cordis-primer.zh.md)
- [Cordis 完整教程](https://github.com/deepseek-ai/deepseek-harness/blob/b830ec950faba0a46dda564be3e2d854afed94f1/docs/cordis-tutorial/index.zh.md)，包括其七章可运行示例
- [DSH 开发指南](https://github.com/deepseek-ai/deepseek-harness/blob/b830ec950faba0a46dda564be3e2d854afed94f1/docs/development.zh.md)
- [DSH 架构](https://github.com/deepseek-ai/deepseek-harness/blob/b830ec950faba0a46dda564be3e2d854afed94f1/docs/architecture.zh.md)

本文是 ElecKoi 对照表，不替代上游原文。

## Cordis 是什么

Cordis 是 DSH 的插件框架。它负责：

- 用 `ctx.<key>` 提供和查找 service；
- 用 `inject` 表达依赖与启动条件；
- 用类型化事件连接插件；
- 用 fiber 管理插件作用域；
- 让注册、监听和其他副作用在 reload、停用和卸载时撤销。

实现时还必须逐章对照完整教程：插件函数；生命周期与 effect；服务与 inject；类型化事件、广播与 waterfall；配置校验；组合与 HMR；接入真实 Harness。教程里的可运行行为是判断实现是否符合 Cordis 的依据，不能只看本页摘要。

插件通常导出 `apply(ctx)` 和可选的 `inject`。一个插件不能靠“先加载某文件”获得依赖，必须声明 service key；一个注册不能只创建不释放，必须由 Cordis helper 自动绑定 fiber、由 `ctx.effect()` 返回 disposer，或由插件 `apply()` 返回 disposer。

## 上游规则与 ElecKoi 状态

| 上游规则 | ElecKoi 当前状态 | 插件作者要求 |
| --- | --- | --- |
| 产品能力由可替换插件组成，不存在需要修改的特权内核 | 已使用 DSH bundle 装配 15 个核心能力组合与一个可选 Tavily 联网组合，并提供 12 个官方可选组合；桌面壳仍保留平台职责 | 新业务能力优先做 Host/Client 插件；平台例外需要 ADR |
| profile 与 bundle 通过 `package.json.dsh` 和有序 patch 组合 | 符合；桌面 profile 由运行清单协调 bundle | 使用 `dsh.bundle.patch`，不要创建第二套启动器 |
| 依赖通过 `inject` 表达 | 内置 Host/Client 插件均声明运行依赖；纯空入口没有依赖 | 禁止依赖手工加载顺序 |
| service 使用稳定 `ctx.<key>`，调用者不导入具体实现 | Client 数据模型和 Host 服务使用稳定 key | 注入 service；不要导入实现文件或读取内部注册表 |
| 注册和监听是可逆副作用 | Slots、`ctx.on`、`ctx.provide`、DSH provider register 都跟随 fiber；自有异步资源有 cleanup | 使用自动绑定 helper，或从 `ctx.effect`/`apply` 返回 disposer |
| Host 与 Client 是隔离的类型与运行环境 | 运行环境已分离；Client bundle 不执行 Node API | Client 不导入 Node/Electron/SQLite；Host 不渲染 React |
| Host 业务能力通过 `@Remote`/`@RemoteScope` 投影到 `ctx.remote` | 已接入 Host-first Typert 生成、`./typert` Loader、`./remote` Client contribution 和真实 Gateway 启动探针；旧 Desktop Gateway、业务 Preload bridge 与 `window.eleckoi` 已删除 | 所有跨端公共能力必须使用 DSH Remote；禁止恢复旧桥 |
| Client UI 使用类型化 Slots | ElecKoi 角色、聊天、资料、预设和角色对话 slots 已做 `SlotMap` 声明合并；模型配置使用 DSH 官方设置页 | 从公开 `./slots` 类型入口导入 owner 合同 |
| 持久事实进入 Session 日志；实时 UI 来自结构化事件 | Agent 运行与轨迹遵循 DSH Session；消息编辑使用正式 Session 日志处理 | 不手写 JSONL、不绕过 session-format-catalog |
| 密钥来自凭据服务并不得提交 | 内置联网能力由 Host 在每次请求时解析官方 credentials 引用；Client 只接收配置状态 | 不把密钥放入 manifest、日志或 fixture，不向 Client 返回已保存的密钥 |

## 数据所有权

角色、预设、设定库、变量、正则、聊天索引和创作项目等产品 Repository、SQLite 打开与版本化迁移均由 `@eleckoi/dsh-product-data` 在 DSH Host 中持有。Client 统一通过 DSH Remote 访问，不存在旧 Desktop Gateway 合同。模型配置使用 DSH settings/profile/credentials，旧模型数据库表已删除。

因此：

- `window.eleckoi`、Desktop Gateway 和对应字符串请求通道已经删除，并由架构检查禁止回流；
- 新增跨 Host/Client 公共合同必须使用 DSH Remote；
- 数据结构变更必须继续使用原子迁移并验证现有有效数据；
- Repository、迁移和写入权不得复制回 Electron Main，始终保持 Host 单一写入源。

## 开发审查清单

每次新增或修改插件时逐项回答：

1. 这是 Host、Client，还是需要正式 Remote 的跨端能力？
2. 每个依赖是否在 `inject` 中声明？
3. 每个 listener、provider、slot、timer 和资源是否会随 fiber 撤销？
4. service key、事件域和 slot 所有者是否属于正确的子系统？
5. 持久数据是否由权威 owner 写入？Session 事实是否进入正式 Session 日志？
6. Client 是否完全不接触 Node、Electron、SQLite 和私有桥？
7. Host/Client 类型是否来自公开包入口，且没有引用内部 `src`/`lib` 路径？
8. bundle 能否安装、重启、停用、启用并卸载，且停用后界面和注册都恢复？
