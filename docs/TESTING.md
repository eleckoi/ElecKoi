# 测试与日常验证

测试按负责的代码归属，运行范围按本次改动选择。先证明请求中的行为正确，再完成相关检查；已有结果仍适用时复用，不因提交、推送或目录同步重复运行。

富消息尺寸由 `rich-document-measurement.test.ts` 检查首帧同步发布、后续合帧和释放，`rich-message-viewport-browser.test.js` 使用正式消息组件与隔离 Electron 窗口检查普通 HTML／原生 SDK 两路的图片延迟加载、视口单位、宿主窗口缩放、动态行内及外链样式、内容增减和窄宽度。保留字符串及 URL 原值、页面身份和零重复布局警告；原 `rich-message-settling-browser.test.js` 继续覆盖首进与切换聊天后无需滚动的楼层就绪。只使用合成媒体与临时 profile，不操作真实角色或聊天，也不替代手机真机验收。

资产库的混合文件夹由 `character-asset-folders.test.ts` 覆盖层级、跨角色拒绝、循环、稳定引用、递归删除恢复及目标文件夹已删除的导入；`character-assets.test.ts` 在 JSON／ZIP／PNG、角色复制与独立前端 ZIP 中保留层级和空文件夹。`character-asset-resources.test.ts` 通过实际 Cordis Gateway 调用新建、移动和改名后继续核对原 Range／引用资源。网页组件回归覆盖混合筛选、新建、移动、进入、当前目录导入、复制引用与原失败重试；正式组件合成浏览器的列表列轴、深浅层次与手机布局记录在 `build/asset-folders-check/`，不替代 Android 真机或真实数据验收。

Windows 打包与功能回归分别执行。全量功能、UI、编辑器及原生作者客户端交互回归不作为发布打包的前置，不因测试文件、旧断言或探针定位阻塞正常打包；相关测试按实际修改独立运行。实际发布工作树仍完成锁定依赖安装与完整源码构建。`pnpm check:electron-dsh` 检查实际 Electron Host、原生存储、Session 重开与回退运行；编辑器及脚本按钮交互独立使用 `pnpm check:electron-native-author`。测试与探针源码不进入安装包；打包保留 SQLite ABI、更新流程、包内运行资源及安装启动检查。

主窗口日志的退出边界由 `main-window-console.test.ts` 覆盖：窗口或网页对象销毁后的迟到回调不读取原生对象，任一关闭通知和显式释放均移除监听；正常动作、错误、主框架导航、取消关闭和作者卡子框架过滤保持。`main-window-console-native.test.ts` 使用隔离 profile 和隐藏 Electron 窗口，覆盖窗口关闭、强制销毁与网页关闭，在真实原生对象销毁前后检查日志释放及已捕获回调，不操作真实安装或数据，也不代替完整安装升级验收。

预设展示页的进入性能由 `preset-editor-workspace.test.jsx` 覆盖：目录已就绪、刷新与完整详情都不返回时，反复挂载首帧仍展示名称和说明，且不请求完整正文；原目录订阅更新及卸载释放继续检查。`preset-editor.test.js` 在真实浏览器以同一阻塞详情场景核对主页面、跨窗保存刷新，以及深浅主题下「使用中」与编辑按钮的尺寸、圆角和细框，无需截图。

该浏览器检查也覆盖工具目录的细框、无图标底块、开关不越界，以及基础资料头像贴近表单、按钮／图片／遮罩同尺寸和圆角；使用旧布局规则对照复现头像偏移。`plugin-navigation.test.js` 用真实隔离 preload 和两个 Electron 渲染器核对主窗口接收指定入口、子编辑区保留草稿与错误重试；官方入口身份及 installed 页签继续由原 Client 模型测试覆盖。`main-plugin-navigation.test.ts` 检查受管调用、目标回执与 frame 隔离、关闭／超时／卸载清理，`plugin-navigation.test.js` 的 UI 单测检查仅主窗口注册及释放导航订阅。全部使用合成数据，不采集截图或操作真实预设。

`preset-editor.test.js` 另核对「管理位置」的文字不竖排、图标不压缩及原管理页往返；菜单工具弹窗以桌面宽窄和移动布局的深浅六组检查逐项细框、透明图标底色、常规字重、启停保存与失败恢复、详情和管理入口。变量固定项与正式设定库顶层条目的图标／文字起点比较、原分组展开收起的无截图 DOM 记录见 `build/position-button-check/variable-alignment.json`；原变量侧栏和移动工具行为继续由既有组件回归覆盖。

`preset-long-text.test.js` 复用正式预设编辑器，覆盖说明／更新记录的十万行、百万字单行、只读可见区挂载、末尾修改、沉浸单实例、取消、保存失败重试及完整保存；同时在预设作用域覆盖正则替换和脚本源码／信息／JSON 设置的长文与完整保存，切换页签不保留隐藏正文编辑器。长文检查用完整 CodeMirror 文档与少量 DOM 行对照，不执行合成脚本，不连接用户数据库。`preset-introduction-editor.test.jsx` 保留原记录排序、增删改草稿与呈现合同，手机仍由原紧凑页面回归覆盖。

管理器窗口按钮颜色由 `apps/web/tests/browser/manager-caption.test.js` 覆盖：正式角色卡／预设管理器与实际 Preload 取色代码共用隔离浏览器，核对浅色、深色、系统主题及切换后的原生颜色通知与管理器画布一致，不采集截图。原标题栏几何与通知释放继续由 `window-caption-alignment.test.js`、`windows-caption-menu.test.ts` 覆盖。

聊天原生归档导入使用 `packages/host/product-api/tests/chat-archive-import.test.ts` 与 `packages/host/product-data/tests/conversation-archive.test.ts`：覆盖导入当前选中角色、原角色已不存在、归档内部身份仍须一致、SQLite 外键与消息关系、v1/v2 外层归档、正式 JSONL 读回及后续追加、历史投递回执保留且不充当新会话水位、继承日志和空／未闭合尾部、已知子会话引用以及读取失败不提交产品记录。使用合成数据和临时目录，不连接真实模型或改正式用户库。

`mobile-editor-keyboard.test.js` 使用正式手机预设入口与官方主题，覆盖输入框聚焦后 390×844、390×420、320×300 的视口，检查页内仅有一个可滚动正文、窄矮窗口侧栏仍可滚动、两者无桌面常驻滚动条、无资料保存／取消重复栏、工具图标无底块及外层无圆角留缝。此处模拟键盘压缩后的视口，不计 Android 真机输入法验收。

`setting-position-page.test.js` 补查手机预设与桌面「管理位置」的真实往返：管理页不保留正文／设置切换，短屏时间线可接收触摸滑动，新增位置后返回恢复设置滚动与焦点，再切正文及统一保存。另核对手机位置顺序和同位置列表上下排、两端空列表不绘制空框、非空列表保留当前条目，以及空使用说明居中并与基本信息分块。浏览器装配包含正式设定库基础样式；无截图、真实数据或 Android 真机手势操作。

`mobile-editor-polish.test.js` 沿同一正式入口补查两种编辑器六组深浅／宽窄窗口的可收缩侧栏、全部九个列表操作区、单独搜索行、列表与详情全高铺满及内容内部留白、关键词和递归匹配展开后的卡片边界、开关同行及返回恢复。多选在全选下方保留取消，覆盖零选中、全选后退出、底部触屏操作恢复及 44px 触摸范围。修改前检出卡片限高导致末尾控件越界；不截图或连接真实数据。

手机消息「更多 → 查看过程」的原入口、开关动画、焦点和官方过程内容由 `mobile-message-toolbar.test.jsx`、`agent-process-mobile-sheet.test.jsx`、`official-process-dialog.test.jsx` 及 `chat-stream-scroll.test.jsx` 覆盖。工具栏测量检查先读完几何再写样式，尺寸不变不重复写；Android 的 `android-startup-page.test.js` 检查遮罩通知按帧合并、无关 body portal 不重复取色、官方弹窗及产品全高表面的取色和关闭还原。真机开场耗时另用无截图 CDP 帧间隔、长任务和布局追踪记录，不能用单元测试代替真机帧率结论。

`process-open.test.js` 以同一原生过程 fixture 和真实消息眼睛操作，在浅深主题下无截图检查手机实色表面、无桌面模糊／底板、准备完成后滑入、消息工具栏无延迟折叠、关闭后再次打开仍有官方思考／工具及完整正文。离屏绘制仅驱动真实帧回调，不采集图像；尺寸监听不得产生 ResizeObserver 循环错误。

`mobile-editor.test.js` 使用正式手机角色卡／预设入口及合成模型，无截图检查 320／390／768 宽度、深浅主题、顶部保存、底部五项触屏操作、列表与独立文档往返、图标分页触摸尺寸、窄屏字段和键盘高度下的布局；十万行设定、变量、开场白、预设提示词、说明、正则与脚本核对完整文档、局部 DOM、末尾修改、保存及原生返回退出沉浸。手机组件回归继续覆盖草稿离开检查、失败保留与重试、固定条目保护、目录移动与删除、说明／元数据统一顶部保存和更新身份。此类浏览器检查不替代真实 Android 输入法与手势验收。

## 选择入口

在仓库根目录运行，命令后可附加测试文件或路径，例如 `pnpm test:ui model-menu.test.jsx`。分组和准备要求由 `scripts/test-suites.mjs` 定义，Vitest 与命令包装器共用该定义。

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

创作能力的范围读写由 `creator-authoring-capabilities.test.ts` 和 `creator-global-authoring.test.ts` 覆盖：全局设定库按库与条目编号读取、修改与管理，停用项仍可读，EJS 不执行；全局／当前角色的脚本和正则读写保持归属，创作目录和参数仅提供角色卡／全局范围（含完整配置对象），缺少角色、错误范围、编号与过期修订明确失败。写入检查长正文片段替换、批量原子更新、文件夹增删改／移动、库设置、源码落盘与失败恢复、角色设定自定义位置与完整版本、跨角色修订和模型请求期间切换角色保护、当前命名版本同步和非当前版本保留。脚本只改源码时，未提交的按钮和导出选项不得被默认值重置，兼容脚本保留原格式；正则只改替换内容时，当前启用组合排除的其他规则不得被重新启用，明确启用该条规则时才同步其组合成员。

`tool-result-recovery.test.js` 的全局创作场景从正式桌面 profile 启动，在未选角色时通过合成模型的真实工具循环发现并读写一千余条目录与首、中、末尾长正文、1501 个关键词、正则和脚本源码；检查千条批量修改、全部搜索命中、溢出续读、三种请求序列化、会话权限、正常摘要压缩及已保存创作预设与最终修改重开。全部使用隔离合成数据，不连接真实模型或用户数据。

资产与独立前端的创作合同由 `creator-media-capabilities.test.ts` 覆盖：混合文件夹新建、改名、移动、递归删除、复制引用、完整字节窗口、项目文件原子更新、准确角色归属、修订冲突及带资产的 ZIP。`creator-studio-runtime.test.js` 使用正式 DSH 文件服务检查工作区导入，覆盖源文件、选中角色或目标目录变化时不发布，并释放原上传暂存。`tool-result-recovery.test.js` 的新增正式桌面 profile 场景使用真实 skill、read 和创作调用循环，先读取技能正文再读随包参考，处理 1001 条资产目录的完整溢出结果，再导入工作区文件和独立项目，检查既有资产与前端订阅能收到通知。追加引用链路检查由 Agent 创建使用导入引用的正则 HTML，再核对正则测试输出、独立项目 HTTP 页面实际解析地址及图片请求的 200／MIME／逐字节内容；已保存源码仍保留固定 asset://。技能正文按官方文本合同读取，不当成 JSON；目录首次进入请求时不自动塞入参考正文。

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

角色聊天的并发与切换由 `chat-session-isolation.test.jsx`、`mobile-navigation.test.jsx` 和会话目录 Client 回归覆盖：A 发送或重新生成时进入 B 并发送、切回 A 后单独停止、后台完成／取消／失败不覆盖当前消息和草稿；目录层分别在准备、提交与执行阶段切换，核对各自官方 Session 引用和最终结果归属。继续保留原重新生成、取消、失败重试和 Session 交接用例，不能只移除导航禁用条件。模拟移动导航通过不代表安卓真机并发验收。

## 文件归属

消息列表最近聊天排序使用实际桌面探针的 `--chat-only --conversation-order-check`：在隔离 Host 与实际客户端中创建三条合成角色聊天并置顶其中一条，验证发送后立即排在置顶下方、失败输入仍更新活动时间、仅打开历史不改变顺序，以及连续重新生成在回复前更新时间并上移。正式归档核对原 Session 和唯一用户输入保持，完整关闭并重开 Host 后顺序与时间保持。角色 Host 的官方数值投影只折叠用户输入与轮次开始时间，重复生成保持单个标量，不额外写入事件或复制消息。模型使用本地合成响应，不操作用户聊天。

- 各包的 `tests/` 跟随包的业务责任；Client 功能包用 `tests/client/` 与 `tests/host/` 区分运行环境。
- `apps/web/tests/` 按功能和 `mobile/` 组织共用网页测试；`browser/` 保存需要真实浏览器的用例及对应 fixture。
- `apps/desktop/tests/`、`apps/desktop-host/tests/`、`apps/android/tests/` 和 `apps/android-host/tests/` 只测试各自入口或接入能力。
- Android Java 单元测试保留在 `apps/android/app/src/test/`，按实际变体选择 Gradle 检查；标准与兼容内核的真机验收另行记录。
- 打包脚本测试放在 `scripts/android-runtime/tests/`，仓库工具测试放在 `scripts/tests/`。
- 根 `tests/integration/` 只保存真实跨模块流程；根 `tests/helpers/` 只保留多个所有者实际共用的辅助代码，类型合同留在 `tests/types/`。

移动网页组件与 PC 共用同一实现和业务回归，各平台只补充自身接入差异。归属依据实际代码和运行环境，不依据文件名前缀。

## 新增与清理

预设独立编辑器使用 `apps/web/tests/browser/preset-editor.test.js` 装配正式 PresetEditorWindow、PresetOverview 和真实编辑组件，检查双窗打开与保存订阅、顶部等尺寸按钮、三组深浅／宽窄布局、工具配置内联与目录保存、保存失败重试，以及十万行提示词的视口行数、末尾修改、沉浸单实例和完整保存。`presets/preset-editor-workspace.test.jsx` 检查基础资料归属、元数据关闭保护、工具草稿与失败保留、提示词默认正文和空选中保存。数据、配置与窗口用户目录均为隔离合成对象，不操作真实预设；按用户要求不截图。这些检查不替代完整 Host／Client 或安卓真机验收。

开场白正式工作台使用 `apps/web/tests/browser/character-openings.test.js`：PC 检查平铺列表、无分视图的单正文框、框内沉浸、目录唯一保存、标题和变量版本、搜索、复制、备用顺序、删除取消／确认、主项接替、空选中保存与可调宽度；沿同一 fixture 保留手机的原界面与绑定／保存验证。使用完整 CharacterEditorWindow 和合成服务数据，不操作真实开场白。长正文／代码的末尾编辑与完整保存继续由 `editor-long-text.test.js` 检查。

正则／脚本正式工作台由 `apps/web/tests/browser/regex-script-workspace.test.js` 装配完整 CharacterEditorWindow，覆盖六组深浅／宽窄布局及目录统一保存、失败重试、版本、原源码目录、设置 JSON、原生／兼容按钮和正则范围共选；并检查正则编辑同页的基本信息与等高输入区、矮窗口配置可达、脚本按钮并入设置以及两种目录空态居中；`editor-long-text.test.js` 覆盖设定库、变量说明／更新规则和开场白的十万行与百万字单行，检查可见 DOM、末尾编辑、沉浸回传与完整保存。两者均为合成浏览器数据，不计完整 Host／Client 或真机；画面使用离屏合成，避免隐藏窗口的旧帧被误作当前页面截图。`ui/editor-text-input.test.jsx` 检查原生 CodeMirror 视图复用、撤销／重做、外部内容更新、只读与卸载，以及草稿比较不序列化未变化的长文。

优先扩展现有功能测试，用参数化表达同一行为的边界组合。只有新组件、独立职责或运行环境需要新文件；不为每次修复单独堆一份验证脚本。

回归应能检出原缺陷。优先检查可观察行为、真实资源释放、持久化及失败路径，保留实际组合测试提供的额外保障。静态检查适用于明确的架构或打包合同，不用源码包含某段文字代替行为证明。

清理时逐项确认重复、过时行为或仅复写实现的断言，再删除；文件少或用例少都不是目标。设定库的大量条目、首中末内容、末尾关键词、保存重开、溢出续读、会话权限及实际模型请求仍是相关改动的必要回归。

目录整理先核对发现清单，再运行对应检查；删除测试与移动文件分开审查。无需新增调度框架、重复验证数据库或长期兼容旧测试路径。

联网设置使用 `pnpm exec electron scripts/probe-eleckoi-desktop-client.cjs --chat-only --web-search-check`，在隔离 Host 和实际客户端中核对 DeepSeek／Tavily 两张选择卡片、Tavily 配置和保存，以及从 Tavily 选择 DeepSeek 保存为 Messages、独立配置按钮直达官方页面并关闭工具弹窗。`web-search.test.js` 覆盖独立跳转、离开提醒、只读和保存失败、现有 Search API 选择保留及深浅宽窄布局；`deepseek-web-profile.test.js` 继续覆盖角色、工作室及配置冷重开，旧选择退役按启动前流程检查。测试使用合成响应，不产生真实 API 费用。

聊天标题与更多菜单布局使用实际桌面探针的 `--chat-only --header-layout-check --rc3-check`：在深浅主题、1440／900 宽度分别比较菜单显示与隐藏时标题、预设、右侧操作和标签栏的几何，确认官方视图菜单为 22px／13px，侧栏图标沿用现有 25px 导航样式，并继续覆盖官方插件菜单跳转与未发送草稿。该检查能检出将 40px 标题操作样式用于视图栏菜单后导致标题整体上移的问题。

对话输入菜单专项为 apps/web/tests/chat/conversation-actions.test.jsx 与 native-script-ui.test.jsx，覆盖首页操作顺序、原生输入座位、预设用途／作者头像、全局启停的显式保存与原错误重试、离开检查、脚本来源和正式身份，以及会话切换卸载与逐层返回。浏览器检查使用实际生产组件与合成模型，不据此宣称真实 Host 或安卓真机验收。

会话模型与参数使用 chat-model-selection、model-menu、dsh-request-config 和 dsh-model-parameters 相关回归；后者同时核对直接读取有效默认选择、失效的提供商 ID 保留原始错误且不自动改写，以及按本 Session 选择恢复快照。旧默认模型路由迁移及其专用回归已退役。模型菜单浏览器检查改为无截图地核对六组深浅／桌面／手机尺寸、草稿取消与单次明确保存。creator-studio-uploaded-files 中的实际官方 Controller／Agent／JSONL 场景覆盖两会话的模型与推理隔离、参数实际入请求、新建默认、同会话换模型不带入旧参数及冷重开；dsh-session-rewind 与旧聊天生成覆盖重新生成、删除、导入初始化和失败回滚。原模板能力声明留在模型配置页，不再作为聊天参数保存测试。

跨角色聊天归档在 creator-studio-uploaded-files 的同一官方 Host fixture 中启用正式角色桥接、生成源聊天并导出，再导入另一个合成角色，确认没有本机运行配置后直接重新生成、再次修改输入重生成和源历史保持；dsh-conversation-generation-save 核对首次无配置激活后请求投影实际生效且不重复装配。dsh-session-rewind 覆盖继承根会话编辑／删除／回退、回执归属及实际子任务拒绝，旧聊天集成继续验证原错误与失败回滚。chat-model-selection 模拟目录先换会话、React 仍在旧视图的订阅交接；chat-session-isolation、chat-regeneration-live 及 Client 目录回归覆盖失败／取消／后台生成和切换。均使用合成数据，不操作真实聊天或获取截图。

预设列表的明确删除确认、取消零写入、失败重试和新建后立即选中见 preset-editor-workspace；Client 目录测试阻塞后续 catalog 响应，确认已持久化的新建结果先发布且操作先返回，并覆盖外部新目录不被晚到旧请求覆盖、只重读活跃详情及删除失败保留详情。preset-editor 无截图浏览器同时比较“编辑预设／使用中”的透明边框和实际 inset box-shadow，避免仅检查 borderWidth 漏掉双重描边。

编辑器标题及手机列表：`mobile-editor-collections` 检查角色／预设正则和脚本始终保留明确标题；`opening-variable-editor` 覆盖两种布局下延迟读取不产生文字占位、缓存重开与真实失败可见；`mobile-character-editor` 保留分支搜索、查询及失败重试，读取阶段使用 aria-busy。资产菜单测试检查菜单已脱离被裁切的编辑区，原筛选和文件操作保持。合成正式组件的浏览器记录见 `build/editor-heading-check/browser-final.json`：设定与变量首项间距和相邻条目均为 4px、列轴一致、搜索高 40px／圆角 22px，资产菜单的实际命中不再被侧栏遮挡。此记录不代表 Android 真机验收。
