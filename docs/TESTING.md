# 测试与日常验证

测试按负责的代码归属，运行范围按本次改动选择。先证明请求中的行为正确，再完成相关检查；已有结果仍适用时复用，不因提交、推送或目录同步重复运行。

## 选择入口

在仓库根目录运行，命令后可附加测试文件或路径，例如 `pnpm test:ui model-picker-selection.test.jsx`。分组和准备要求由 `scripts/test-suites.mjs` 定义，Vitest 与命令包装器共用该定义。

| 命令 | 覆盖范围 | 额外准备 |
| --- | --- | --- |
| `pnpm test:unit` | Shared、SDK、Compatibility 的普通逻辑 | 无 |
| `pnpm test:ui` | 共用网页组件、移动布局和 Client 插件交互 | 无 |
| `pnpm test:host` | Host 数据、运行时、Host 插件和 Desktop Host 入口 | 构建运行包，切换 Node SQLite，结束后恢复 Electron SQLite |
| `pnpm test:desktop` | Electron 壳与 Windows 平台接入 | 构建运行包 |
| `pnpm test:android` | Android 页面接入、Android Host 与资源打包脚本 | 无；不启动 Gradle、设备或 ARM64 编译 |
| `pnpm test:tooling` | 仓库检查、文档与开发脚本 | 无 |
| `pnpm test:browser` | 真实 Electron 浏览器布局及交互 | 构建运行包 |
| `pnpm test:integration` | 产品数据、真实插件组合和请求链路 | 构建运行包，切换并恢复 SQLite |
| `pnpm test` | 上述全部 JS/TS 回归 | 完整运行包准备，切换并恢复 SQLite |

轻量入口直接从源码解析共用 SDK、作者运行时和纯逻辑，不附带运行包构建或原生模块重建。基于构建产物、生成的 Remote 或原生数据库的检查仍使用相应准备入口；不要用轻量分组绕过真实调用链。

Vitest 默认最多两个工作进程，并保留文件隔离。一次只运行一批重型检查，重型构建串行。中断包装器会终止它启动的测试进程树；如果 SQLite 已开始切换，仍须等待 Electron 恢复结束。恢复失败明确报错，不能当作测试通过。

## 何时扩大检查

- 解释、调研和方案讨论不运行测试或构建。
- 普通逻辑或组件修改先运行对应文件，必要时扩展到依赖它的模块。文案修改不自动触发全部浏览器检查；布局和交互变化检查受影响页面及相关窗口条件。
- 数据库结构、协议、生命周期、共享服务和 DSH 依赖变化，按实际影响增加集成检查；有具体跨模块风险时运行完整回归。
- 正式发布、用户明确要求或已确认的广泛影响需要完整回归。发布链仍按仓库发布约定执行；普通主线推送不会自动触发 PR CI。
- 输入和环境未变、没有新失败或疑点时，不重复通过的检查。竞态、偶发失败和性能验证可以重复，但须说明重复要检验的条件。
- 验收行为和相关检查完成后结束任务，不追加无关重构、可选优化或新的完成门槛。失败及未执行项如实报告。

自动依赖筛选不能替代调用链判断：动态插件组合、读取的资源文件和子进程入口不一定出现在静态导入图中。

更新界面改动还需在桌面运行包及 Web Client 构建就绪后运行 `pnpm exec electron scripts/probe-eleckoi-desktop-client.cjs --updates-check`。该场景使用隔离数据目录、正式更新控制器、Preload 和构建后的完整界面，覆盖官方八语言切换与 Host 重开保留、头像上方的更新入口、下载进度、官方独立更新文档、取消和活跃任务安装确认；只在更新网络与安装执行边界使用合成实现，不下载或执行安装器。Android 更新组件另按其 APK 流程回归。

工作区定时任务入口使用同一探针的 `--workspace-schedule-check`，核对仅在工作区侧栏显示官方图标与文字、任务页保留侧栏、插件与更多仍在最左导航，并覆盖六组深浅主题及窗口宽度。`deepseek-web-profile.test.js` 在隔离正式 profile 中通过官方创作工具创建、暂停任务并重开核对；任务位于测试临时目录，不影响用户任务。

右侧栏生命周期改动使用同一探针的 `--chat-only --rightbar-check --handoff-check`：核对首次打开、插件页往返、冷启动、连续重新生成及聊天切换后的正式右侧栏开合，并检查引用归属错误。`--studio-rightbar-check` 单独覆盖创作工作室连续新建对话后的开合。两种场景都使用隔离数据，不操作用户聊天。

## 文件归属

- 各包的 `tests/` 跟随包的业务责任；Client 功能包用 `tests/client/` 与 `tests/host/` 区分运行环境。
- `apps/web/tests/` 按功能和 `mobile/` 组织共用网页测试；`browser/` 保存需要真实浏览器的用例及对应 fixture。
- `apps/desktop/tests/`、`apps/desktop-host/tests/`、`apps/android/tests/` 和 `apps/android-host/tests/` 只测试各自入口或接入能力。
- Android Java 单元测试保留在 `apps/android/app/src/test/`，按实际变体选择 Gradle 检查；标准与兼容内核的真机验收另行记录。
- 打包脚本测试放在 `scripts/android-runtime/tests/`，仓库工具测试放在 `scripts/tests/`。
- 根 `tests/integration/` 只保存真实跨模块流程；根 `tests/helpers/` 只保留多个所有者实际共用的辅助代码，类型合同留在 `tests/types/`。

移动网页组件与 PC 共用同一实现和业务回归，各平台只补充自身接入差异。归属依据实际代码和运行环境，不依据文件名前缀。

## 新增与清理

优先扩展现有功能测试，用参数化表达同一行为的边界组合。只有新组件、独立职责或运行环境需要新文件；不为每次修复单独堆一份验证脚本。

回归应能检出原缺陷。优先检查可观察行为、真实资源释放、持久化及失败路径，保留实际组合测试提供的额外保障。静态检查适用于明确的架构或打包合同，不用源码包含某段文字代替行为证明。

清理时逐项确认重复、过时行为或仅复写实现的断言，再删除；文件少或用例少都不是目标。设定库的大量条目、首中末内容、末尾关键词、保存重开、溢出续读、会话权限及实际模型请求仍是相关改动的必要回归。

目录整理先核对发现清单，再运行对应检查；删除测试与移动文件分开审查。无需新增调度框架、重复验证数据库或长期兼容旧测试路径。

联网设置使用 `pnpm exec electron scripts/probe-eleckoi-desktop-client.cjs --chat-only --web-search-check`，在隔离 Host 和实际客户端中核对 DeepSeek／Tavily 两张选择卡片、Tavily 配置和保存，以及从 Tavily 选择 DeepSeek 保存为 Messages、独立配置按钮直达官方页面并关闭工具弹窗。`web-search.test.js` 覆盖独立跳转、离开提醒、只读和保存失败、现有 Search API 选择保留及深浅宽窄布局；`deepseek-web-profile.test.js` 继续覆盖角色、工作室及配置冷重开，旧选择退役按启动前流程检查。测试使用合成响应，不产生真实 API 费用。

聊天标题与更多菜单布局使用实际桌面探针的 `--chat-only --header-layout-check --rc3-check`：在深浅主题、1440／900 宽度分别比较菜单显示与隐藏时标题、预设、右侧操作和标签栏的几何，确认官方视图菜单为 22px／13px，侧栏图标沿用现有 25px 导航样式，并继续覆盖官方插件菜单跳转与未发送草稿。该检查能检出将 40px 标题操作样式用于视图栏菜单后导致标题整体上移的问题。
