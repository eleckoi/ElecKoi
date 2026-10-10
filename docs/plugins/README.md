# ElecKoi 插件开发文档

ElecKoi 使用 DSH 官方 bundle、Cordis 生命周期和 Web Client Slots 作为唯一插件体系。插件通过同一个插件中心安装、启用、停用和卸载；ElecKoi 不定义第二种安装格式，也不要求插件直接访问 Electron、SQLite 或内部 React 页面。

本文档对应以下固定基准：

- ElecKoi Desktop：`0.2.8`
- DSH：`0.2.0-rc.2`
- DSH 提交：`c1b47e41fcd54d20a0f061df28683bfc29ee24e5`
- 插件接口与数量：[自动生成的开发接口总表](api-reference.md)

## 从哪里开始

1. 按 [快速入门](quick-start.md) 创建一个可安装的最小 bundle。
2. 先阅读 [架构与边界](architecture.md)，确定代码应运行在 Host 还是 Web Client。
3. 需要改变界面时查 [界面插槽](ui-slots.md)。
4. 需要读取或修改产品数据时查 [服务接口](services.md)。
5. 需要跨 Host/Client 调用时查 [DSH Remote](remote.md)。
6. 需要向 DSH 能力注册实现时查 [能力贡献](contributions.md)。
7. 发布前按 [生命周期、数据与安全](lifecycle-and-data.md) 和 [测试与验收](testing.md) 检查。

## 文档索引

| 文档 | 解决的问题 |
| --- | --- |
| [快速入门](quick-start.md) | 如何创建、安装并运行第一个插件 |
| [架构与边界](architecture.md) | bundle、Host、Client、Slot、Service 和 Contribution 的关系 |
| [DSH 与 Cordis 合规基准](upstream-compliance.md) | Cordis 入门、完整教程、DSH 开发指南和架构说明的要求与迁移差异 |
| [Bundle manifest](manifest.md) | `package.json`、`cordis.patch.yml`、本地化和接口声明格式 |
| [界面插槽](ui-slots.md) | 界面接入点、组合方式、作用域和 owner props |
| [服务接口](services.md) | 如何导入公开类型、调用服务和查询接口 |
| [插件参与聊天流程](conversation-lifecycle.md) | 生成前准备、保存后收尾、消息回退及本轮等待 |
| [SDK 兼容边界](sdk-compatibility.md) | 兼容存储、世界书缓存位置、界面扩展与生成规则 |
| [Client 完整参考](api-client.md) | 客户端服务的全部公开方法与参数 |
| [Host 完整参考](api-host.md) | Host 产品 API 和 Session 编辑服务 |
| [Remote 完整声明](api-remote.md) | 官方生成的全部跨端调用声明 |
| [Client 数据类型](types-client.md) / [Host 数据类型](types-host.md) | 方法引用的完整数据结构 |
| [DSH Remote](remote.md) | 如何声明、生成、装配和调用类型化 Host API |
| [能力贡献](contributions.md) | 如何为已有能力注册 provider，以及 `provides` 与 `contributes` 的区别 |
| [生命周期、数据与安全](lifecycle-and-data.md) | 启停、卸载、存储、权限、失败隔离和桌面边界 |
| [测试与验收](testing.md) | 本地安装探针、源码检查和发布前清单 |
| [开发接口总表](api-reference.md) | 从 manifest 自动生成的接口总目录及数量 |
| [内置能力迁移清单](../DSH_PLUGIN_MIGRATION.md) | ElecKoi 功能分别归属哪个 bundle |

## 接口信息的权威来源

一个接口同时有三层信息，不能混为一谈：

1. **运行合同**：Slot、Cordis service、Remote 或注册 API 的真实代码和类型，是行为权威。
2. **bundle manifest**：`package.json.eleckoi.developerInterfaces` 是插件中心的发现和说明元数据。
3. **本目录文档**：解释如何正确使用运行合同，并给出跨包索引。

`api-reference.md` 是由运行清单与 bundle manifest 生成的导航表。完整服务参考、参数、返回类型和查询目录使用锁定 DSH 的官方 WorkspaceAnalyzer、CordisCatalogProjector、TypeGraphRenderer 和 Host-for-Client 生成器从公开源码生成。新增、删除或改名接口后，运行：

```powershell
pnpm generate:plugin-docs
pnpm check:plugin-docs
```

`pnpm build` 已包含完整性检查。公开成员未登记、成员不存在、JSDoc 缺少参数或返回说明、公开类型无法导入、参考过期时，构建会失败。查询方式见 [服务接口](services.md#在运行时查接口)。

## 稳定性约定

- 插件必须把 `engines.dsh` 固定到受支持的 DSH 版本；不要假设跨版本内部结构兼容。
- 只有本目录和插件中心列出的开发接口属于 ElecKoi 公开接入面。
- 已删除的 `window.eleckoi` 与 Desktop Gateway、页面组件内部 props、DSH 内部注册表和 SQLite schema 都不是第三方插件 API。
- 公开接口发生不兼容变化时，应提升相应 bundle 版本并同步更新类型、manifest、文档和安装探针。
