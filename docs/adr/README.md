# 架构决策记录

ADR 是 Architecture Decision Record，即架构决策记录，用于说明一个重要方案为什么这样选择。使用当前能力先看 [文档首页](../README.md) 和正式教程，再按需要追溯决策。

编号沿用既有记录，不要求连续。本目录从 0012 开始不表示缺了教程；不同仓库保留的记录集合可以不同，已有编号不重新分配。当前模型配置记录为 0022，历史恢复为 0020，二者不再共用编号。

## 决策索引

| 编号 | 决策 | 状态 | 当前关系 |
| --- | --- | --- | --- |
| 0012 | [DSH 官方桌面客户端基准](0012-dsh-official-client-baseline.md) | 已采纳 | 当前架构基准；迁移结果由 0017、0018 补充。 |
| 0013 | [插件平台与产品数据边界](0013-dsh-plugin-platform-and-product-data.md) | 已被取代 | 0017、0018 取代旧 Gateway 与 Main 数据所有权决定。 |
| 0015 | [内置功能登记为 DSH bundle](0015-dsh-built-in-bundle-registration.md) | 已采纳，部分被取代 | bundle 登记保留；旧 Gateway 数据边界由 0017、0018 取代。 |
| 0016 | [插件开发接口自声明](0016-plugin-developer-interface-catalog.md) | 已采纳 | 接口总表从 bundle manifest 生成。 |
| 0017 | [DSH Remote 取代旧业务网关](0017-dsh-remote-replaces-desktop-gateway.md) | 已实施 | 跨端业务采用 Remote 与正式 Connection 协议。 |
| 0018 | [DSH Host 独占产品数据](0018-dsh-host-owns-product-data.md) | 已实施 | 产品数据库、迁移与领域仓库由 Host 持有。 |
| 0019 | [请求上下文的信息性记录](0019-informational-session-records.md) | 已采纳 | Session 信息性事件信封与记录修复。 |
| 0020 | [旧聊天历史与回退状态恢复](0020-roleplay-history-recovery.md) | 已采纳 | 恢复可信历史并保持原聊天与 Session 身份。 |
| 0021 | [同一 Session 的历史重载](0021-session-history-reload.md) | 已采纳 | 日志修改后共享 Client Session 的重载合同。 |
| 0022 | [模型配置的发现与采样参数](0022-model-configuration-request-contract.md) | 已采纳 | 模型配置、凭据、发现和正式请求参数。 |
| 0023 | [使用 DSH 官方生成器维护插件接口参考](0023-official-plugin-api-reference.md) | 已实施 | 公开类型、源码生成参考与官方 Inspect 查询，补充 0016。 |
| 0024 | [官方 ChatView 与角色消息座位](0024-official-chat-view-roleplay-seats.md) | 已采纳 | 官方列表、滚动与角色呈现边界。 |
| 0025 | [同一 Session 复用已有用户事件重新生成](0025-same-session-existing-input-regeneration.md) | 已采纳 | 保留用户事件并继续官方运行循环。 |
| 0026 | [旧 Session 系统开头的迁移修复](0026-legacy-session-system-head-migration.md) | 已采纳 | 在相邻迁移中补齐空开头，保留原日志并隔离单个会话失败。 |
| 0027 | [通过官方 DSH 合同开放聊天流程参与入口](0027-conversation-plugin-lifecycle.md) | 已撤销 | 原回调接口已删除；当前接入使用 DSH 公开能力与产品接口。 |
| 0028 | [以多应用工作区组织桌面与后续 Android 工程](0028-multi-application-workspace.md) | 已采纳 | 应用入口、公共合同、原生源码与各平台构建职责。 |
| 0029 | [运行期间查看实际请求，停止请求副本写入放大](0029-ephemeral-request-context-preview.md) | 已采纳 | 真实请求只在内存保留；独立弹窗按需预览，退出后不恢复。 |
| 0030 | [按职责分组工作区包](0030-package-responsibility-groups.md) | 已采纳 | Client、Host、公共合同、SDK 与示例按职责组织，保留包身份。 |
| 0031 | [Android 本地 Node Host](0031-android-local-node-host.md) | 实施中 | 独立本地运行环境、数据库与平台构建边界。 |
| 0032 | [原生脚本库与作者 SDK](0032-native-script-libraries.md) | 已实施 | 三类脚本、文件源码、原生变量规则与作者前端。 |
| 0033 | [导入格式与原生数据存储](0033-native-format-import-storage.md) | 已采纳 | 外部格式转换到原生领域，不保留第二份业务数据。 |
| 0034 | [生成图片随记录删除](0034-generated-image-record-cleanup.md) | 已采纳 | 正式图片状态、Session 编辑锁与无有效引用的附件清理。 |
| 0035 | [Android 更新检查与平台发布识别](0035-android-update-checks.md) | 已采纳 | 应用身份、正式更新描述、后台调度与平台通知。 |
| 0036 | [EJS 归入正则替换](0036-ejs-display-templates.md) | 已实施 | 正则替换中的 EJS、变量快照、隔离计算与废弃模板存储移除。 |
| 0037 | [统一编辑器与完整配置版本](0037-editor-collections-and-versions.md) | 已采纳 | 共用列表操作、批量启停及完整版本数据合同。 |
| 0038 | [聊天运行状态由产品数据库统一保存](0038-conversation-runtime-state.md) | 已实施 | 变量和分支设定历史的正式保存边界、回退与归档。 |
| 0039 | [DeepSeek 独立搜索与网页抓取接入 DSH Web](0039-deepseek-search-fetch.md) | 已实施 | 共用 Web 提供器、独立凭据与完整结果。 |
| 0040 | [ElecKoi 失败契约](0040-error-contract.md) | 已实施 | 失败以契约码与参数化详情跨边界移动；用户文案只在渲染层解析，码表与契约文档是生成产物。 |
| 0041 | [工具注册来源与预设插件分组](0041-tool-registration-provenance.md) | 已实施 | 通过注册上下文关联真实插件，外层按插件显示，内部选择预设工具。 |
| 0042 | [Bug 报告的投递（飞书表单收件箱、邮件与复制兜底）](0042-bug-report-delivery.md) | 已采纳 | 报告是用户发起的导出：飞书表单是默认端点（URL 预填 + 匿名填写），邮件与复制 / 导出兜底；不常驻上报，也不需要自建收件服务器。 |
| 0043 | [编辑器的插件配置入口唤起主窗口](0043-editor-main-window-plugin-navigation.md) | 已采纳 | 受管窗口聚焦与入口转交；配置仍由主窗口的官方 Client 和 Remote 负责。 |

本目录没有收录 0006—0011 和 0014；保留编号间隔，不复制内部历史材料来补齐。后续编号须同时核对两个工作树，避免复用未收录编号。
