# ADR 0012：以 DSH 官方桌面客户端为唯一架构基准

## 状态

已采纳，2026-09-29。取代旧桌面内核/垂直模块方案作为**最终架构目标**；不表示现有代码已完成迁移。

## 背景

ElecKoi 最初没有可参照的 DSH 官方桌面客户端，因此建立了自己的 Main Cordis 装配、Desktop Gateway、SQLite 业务模块和 Renderer。后来接入官方 DSH Web Host 与客户端插件体系，形成同时存在的两套产品装配边界。继续把早期的 ElecKoi 桌面内核总纲称为唯一权威，会掩盖与官方客户端的差异，阻碍上游升级和插件兼容判断。

## 决定

1. `deepseek-ai/deepseek-harness` 当前锁定版本的官方 Desktop、Web Client、Host、profile/bundle、Cordis 与公开插件合同，是 ElecKoi 桌面客户端的**唯一架构基准**。ElecKoi 文档只解释如何落实该基准、列出尚未对齐处和产品例外，不能自行定义另一套平行的最终客户端架构。
2. 产品扩展优先使用同版本官方 Host/Agent 插件、Client 插件、Remote、Slots 与 Session 合同。Electron Main 只承担经官方桌面边界或明确产品例外确认的本机职责。是否迁移现有 Main 数据和 Gateway 必须逐项评估，不能因目标改变就丢失用户数据或临时建立双轨读写。
3. 官方包补丁、直接覆盖官方服务方法、自有 UI 根和未覆盖的官方扩展位都列为待核对差异。可使用公开扩展点时迁移；暂不可替代时记录原因、影响范围和升级验证，不宣称完全对齐。
4. 上游升级按一个精确版本批次进行。仓库检查器必须核对**实际启动路径**和插件组合；旧 `stdio-jsonrpc` 记述不得继续作为当前 Web Host 的证明。
5. 文档中的“目标”“现状”“历史”必须明确区分。当前目录和既有安全、数据保护约束在迁移前继续保护运行中的产品，但不再具有永久架构权威。

## 已取代的权威表述

- 私有知识库《ElecKoi Desktop 架构最终总纲》和 ADR-006 中“自有 Desktop Kernel + Vertical Modules 是最终架构”的结论。
- 公开 `docs/ARCHITECTURE.md` 中把 Main/Gateway/Modules 组合写成长期唯一架构的结论。
- ADR 0009 中把现有 Main/SQLite/桌面 Gateway 所有权定为不再审查的长期边界；该 ADR 的迁移事实和已完成实现仍可用于追溯。

## 执行与验收

具体基准、现状差异和实施顺序见 [DSH 官方客户端架构基准](../DSH_DESKTOP_ARCHITECTURE.md)。先校正文档与校验，再逐项审查上游扩展点和产品数据迁移；每一步都以实际 DSH Host、客户端和插件行为验证，完成前不得声称整体架构已经与官方一致。

面向第三方的公开插件合同见 [插件开发文档](../plugins/README.md)；当前跨端调用与产品数据所有权分别由 [ADR 0017](0017-dsh-remote-replaces-desktop-gateway.md) 和 [ADR 0018](0018-dsh-host-owns-product-data.md) 规定。[ADR 0013](0013-dsh-plugin-platform-and-product-data.md) 仅保留历史决策。

## 0.2.2-rc.1 原生桌面装配

官方桌面源码按职责进入 Electron 平台适配与更新模块；没有另建跨端业务桥。官方 native 通道和 Renderer 所需类型集中在 Shared Contract，Shared 仅允许对精确公开 protocol/types 入口使用 `import type`；预加载只依赖 Electron、纯合同及同目录适配。平台层不反向依赖更新业务模块。

校验器核对 native provenance 中逐文件摘要，只有这些已核对源码可在 Electron 边界依赖官方 native 辅助包；其他 Main／Shared／Renderer 的 Host/SDK 禁止边界保持。自定义页面继续通过正式 Client 和 Remote 访问产品数据。更新文档、文件拖出和键盘等入口由 Main 验证受管窗口与 frame，权限与 Host 授权沿官方同版本实现。
