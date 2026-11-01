# ADR 0031：Android 使用独立本地 Node Host

## 状态

实施中，2026-10-08。补充 [ADR 0028](0028-multi-application-workspace.md) 与 [ADR 0030](0030-package-responsibility-groups.md)。

## 背景

Android 与桌面共用当前产品领域合同和 Host 业务包，但分别拥有运行环境、数据库和构建链。Android 从新的数据基线开始，原 Compose 工程仅作为后续移动界面的设计依据。

外部 [PR #10](https://github.com/eleckoi/ElecKoi/pull/10) 的原始提交 `21ba7535e6fd2ff4531493534ebfa7462076d619` 提供 Android 原生壳、PRoot 与 Node 装配。其整个差异包含旧桌面布局、其他功能与 Room 导入，不能整体覆盖当前工作区。公开采纳时须保留原 PR 提交的合并历史；本阶段仅在开发工作树接入并验证。

## 决定

2026-11-01 后台执行策略：前台服务维护默认网络身份及系统明确报告的访问状态，网络切换后不接受旧连接的限制或丢失回调。网络状态只更新常驻通知和平台诊断，保留 Host、Session 与正在执行的请求；不把网络恢复实现为进程重启或消息重发。原生「后台运行」入口查询电池优化、系统后台运行及节省流量状态，系统权限变更必须由用户在 Android 提供的界面确认；Android 27 等未提供相应状态的环境明确显示未知。该实现属于两种浏览器变体共用的安卓壳职责，不新增产品 Remote、数据库迁移、页面协议或厂商私有接口。当前锁定 DSH 的连接恢复机制保持原样，源码回归不代替真机后台验收。

2026-10-15 运行诊断：兼容变体的安卓壳在页面启动成功后仍收集页面异常的名称、消息、堆栈与位置，并记录返回操作的原生发送、扩展中转、网页接收、处理和结果阶段。诊断属于平台生命周期，不改变 DSH Remote、Session 或产品数据库。存储位于应用私有 `runtime-diagnostics/`，最多四个各 1,000,000 字节的轮转日志和一个最多 500,000 字节的手动导出报告；内存队列同时限制条目数和字节数，重复错误合并，页面错误洪泛限制每五秒的桥接消息数。后台批量写入，前台低频采样页面响应延迟、原生主线程延迟与本进程内存，不采集聊天、请求参数、Cookie 或任意 Host 标准输出。保留错误字段前移除明确凭据和 URL 查询内容。页面错误提示与 Host 常驻通知提供原生运行诊断入口，可复制、保存或通过临时只读 URI 分享；文件读取、报告生成不依赖浏览器响应。诊断导出失败明确提示，不以空报告冒充成功。标准变体不启动持续收集、采样和写盘任务，保留原有 Host 运行详情。

1. `apps/android` 拥有 Gradle 工程、WebView、前台服务和 Android 平台能力。原生桥仅处理平台操作；模型、角色、预设、聊天和数据查询仍经官方 DSH Remote。
2. `apps/android-host` 是 Android 的 Node 应用入口及组合根，通过锁定版本的 `runProfile` 启动官方 Web profile 和现有产品 bundle。它不依赖 Electron，也不改写桌面的启动入口。
3. 手机内运行 ARM64 Node 与经过 Android 适配的 glibc。Android 服务通过 APK 原生目录中的启动器直接启动 Node，负责安装、就绪握手、错误报告和关闭；正常启动不经过 PRoot。运行时资产按清单与校验和安装，缺失或不匹配必须明确失败。
4. Android 使用应用私有目录中的独立产品 SQLite、DSH home、Session、媒体和 workspace。产品 SQLite 继续由 `@eleckoi/dsh-product-data` 打开，Session 继续使用当前 DSH 正式格式。不得导入旧 Room、为旧字段增加业务兼容层，或改变 PC 的数据路径和迁移链。
5. `scripts/android-runtime` 拥有 Android 运行时构建与资产校验。依赖版本来自当前工作区锁文件；ARM64 Node 原生依赖单独准备，不覆盖 Windows/Electron 原生依赖。
6. Android 专用页面位于 `apps/web/src/mobile`，由 `packages/client/mobile/dsh-client-mobile` 经 Cordis 和 `eleckoi.shell.window` 窗口链装配；应用组合清单为 `apps/android-host/src/androidPluginBundleManifest.json`。手机沿原 Android 的底部五入口、全宽消息列表、角色封面列表、预设分组与提供方模型列表呈现，不把桌面多列布局作为移动页面。点击消息或角色的对话入口进入独立对话页，返回恢复来源页面与列表位置；暂不改变对话内容区的呈现。角色编辑、预设编辑、模型配置复用现有 Client 服务、当前字段、能力声明、保存流程和编辑器槽位；未保存编辑通过导航守卫处理，不复制 Host 业务或数据库。
7. Android Host 的标准输入输出协议只承载进程生命周期；业务调用、流式事件和取消均沿官方 Connection、Typert Remote 与 Session 协议。升级共享互动前端时，Android Host 使用官方 profile 读写合同一次性登记 `dsh-client-html-resources` 并移除废弃资源组合；官方 `initProfile` 不会更新已存在的 profile。登记保留既有 bundle 顺序、外部插件依赖和用户 patch，不重新启用其他已关闭的 bundle；完成标记写入后，后续启停仍由用户控制。
8. 日常 APK 构建复用校验后的离线资产。Windows 只整理归档和已发布的 ARM64 二进制；源码编译需要明确安排原生 ARM64 Runner，不自动启动 Docker、WSL 或模拟器。启动图标使用当前 PC 图像。
9. Android Host 在官方 index-inject 中声明 Android 平台及应用版本。共享临时界面在此平台不装载 Electron 更新订阅、Host 故障桥或窗口控制按钮；桌面仍使用原有服务。功能页面按 Host 注入的客户端脚本地址解析自身资源，分别使用 Android HTTP 与桌面自定义协议的真实来源。
10. APK 必须通过有效 ZIP 条目与整体体积校验，离线归档变化后清理 Android 应用构建输出。运行时清单声明按归档成员计算的解压空间预算；安装前保留旧目录并检查峰值空间，只有新 Host 的健康与认证页面握手通过后才删除非当前的受管安装目录。产品数据目录永远不属于运行时清理范围。
11. Android 只加载真实 Host 提供的官方 Web Client，其原有启动流程仍负责插件加载和启动页卸载。原生壳不额外创建启动 WebView、不生成离线启动页面、不改写官方启动模块。原生容器中央显示同一条横向进度，覆盖运行环境准备、Host 启动及 Client 实际绘制前的等待，绘制完成后一次隐藏，避免切换两套启动画面。首次准备新运行时在进度条下提示“首次启动需要准备运行环境，耗时较长”。复制阶段使用实际写入字节计算当前包百分比，解压阶段显示当前包序号和不定进度，不推算剩余秒数或伪造总体百分比。复制进度只在内存发布，并限频更新界面；检查、解压、启动和失败保留实际阶段状态。缓存命中不显示首次准备提示。原生窗口使用浅色底面；Client 提供正式主题后，系统栏与原生容器跟随实际页面配色，不按手机系统主题猜测应用主题。启动或页面失败时提供实际错误与重试，页面重试复用已经就绪的 Host。
12. 启动诊断分别记录安装资源可用、子进程创建、首次输出、ready 协议、HTTP 校验与页面绘制的实际耗时。CPU 采样只在显式开启诊断的 Debug 启动中运行，固定时长且覆盖同一临时文件；普通启动及正式构建不启动采样。
13. 正常启动使用 `native/android-runtime/glibc-lock.json` 固定的 Android glibc 2.44。APK 原生目录中的 Bionic 启动器持有目录描述符 63；glibc 的固定文件前缀以等长路径替换为 `/proc/self/fd/63`，解析文件符号链接指向 Android 实际网络配置，并随网络更新原子替换。Node 初始化脚本提供真实可重启的 `process.execPath`。glibc 加载器通过 `--preload` 装载 Android 执行适配层，保留 Linux 子进程的 PID、标准流、控制描述符、信号、取消和终端合同；DSH 原有的 `subprocess-local` 提供方保持不变。普通 Ubuntu glibc 在实际应用沙箱中首先因 `set_robust_list`（99）收到 `SIGSYS`；诊断器令它继续执行时还观察到其他被禁用调用，不能把这些后续结果当作原始首个失败原因，或用 `adb run-as` 成功代替实际应用验证。
14. Host 配置使用应用私有目录的真实绝对路径，产品 SQLite、媒体、Session 与 home 仍使用原来同一组持久目录。Linux 系统可执行路径仅由执行适配层按明确 rootfs 配置解析，不提供完整 chroot 或整个发行版的文件系统模拟。PRoot 及其专用依赖不参与任何现有启动、工具或诊断路径，从运行包和资源构建链中删除；原始 glibc 加载器保留供 Debug 诊断对照。平台辅助程序使用独立 NDK/API 锁，产物身份与 ARM64、16 KiB 对齐继续校验。Debug 诊断入口受 `android.permission.DUMP` 保护，使用独立临时数据目录和有界执行时间。
15. 实际 Android 应用沙箱拒绝 JSONL Session 首次写入所用的硬链接发布操作。Android 打包时仅对锁定版本 `dsh-session-persistence-jsonl` 的两处独占文件发布调用应用平台补丁：完整临时文件仍按官方逻辑写入并同步，发布改用 `renameat2(RENAME_NOREPLACE)`，保留碰撞拒绝、目录同步、错误传播与官方事件格式。补丁核对包身份、原文件 SHA-256 和每处调用的唯一匹配；不修改工作区已安装的共享包、PC 构建或通用 `link()` 语义。不新增旧 Android 聊天或 Room 迁移。
16. Android 与 PC 共用 `dsh-client-shell` 的侧栏槽位装配、`SidebarContent` 和 `SidebarRail`，两端均停用官方 `ui-sidebar` 外壳，不维护第二份移动侧栏实现。手机采用展开标签的呈现，只按正式面板键过滤底部五入口，不呈现新会话和工作区；保留插件导航、社区、用户资料、设置与底部贡献。角色新建对话保留在对话页右上角。手机开合使用阻尼比 0.9、刚度 400 的弹簧，侧栏宽为屏幕 80% 且最多 326 CSS 像素；主页面右移并缩至 95%，左侧圆角 36，近远阴影固定在独立图层，按开合进度改变透明度；弹簧采样一次后交给 Web Animations 执行位移、缩放和透明度，不逐帧修改继承的样式变量、圆角或阴影模糊。动画结束撤销临时合成提示与动画实例，关闭时移除变换；减少动态效果时直接完成。该呈现不取消官方工作区服务或其初始化行为。正式 `main` 面板键、槽位优先级与 Cordis 注入/销毁决定插件页面呈现；共享组件的默认品牌、设置和工作区贡献仍与 PC 一样按现有优先级选取，不保证依赖官方外壳 DOM 的插件生效。官方工作区选择的空面板目标仍保留正式 `activePanelId: null`，Android 窗口以专用呈现字段 `windowPanelId` 区分 `conversation` 与产品 `messages` 页面；不改变官方面板合同或桌面的面板映射。新增插件面板不需要加入底部五入口，仍可从共享抽屉进入。Android 平台覆盖在共享 Agent 配置之后应用，官方工作区沿同版本 Web profile 使用其已注册的 `standard` 默认 Agent Preset；产品角色会话仍由当前产品 Runtime 明确注册并选择自己的预设，不改变 PC 配置。

17. Android 页面装配是应用必需组件，与共享窗口等核心组件沿官方 Plugin Manager 的 `management-required` 合同拒绝停用；Android 启动始终确保该 bundle 已选中，其他插件启停仍保留用户选择。插件页与侧栏目录按 Host 返回的正式 bundle 清单呈现，启用状态只决定开关和运行状态，不能决定条目是否存在；停用的安装提供 bundle 仍可查看并再次启用。原生前端项目和原生脚本运行环境共同由 `@eleckoi/dsh-client-author` 提供，Android 必须在直接依赖与默认 bundle 清单中声明它。已初始化的 profile 通过独立的第二次前端登记补齐作者插件；不得重新启用前一次登记后被用户停用的兼容插件，登记完成后继续保留作者插件的用户启停选择。

18. Git 仓库插件继续由同版本官方 Plugin Manager 和 pnpm 安装。运行包包含 rootfs、Node、Git 与应用四份归档；Git、HTTPS 辅助程序、OpenSSH 客户端、证书及其 ARM64 依赖固定在 `git-tools-lock.json`，核对官方 Debian 包元数据、SHA-256、依赖和许可证后整理，禁止从开发机临时寻找可执行文件。Host 为 Git 声明实际的程序、模板和 CA 路径，保留官方 URL 解析及认证行为。pnpm 11.7 的 hosted Git 解析会在 HTTPS 检查失败后尝试 SSH，因此运行包必须覆盖两种传输；SSH 可执行不代表公开仓库的 HTTPS 故障已经解决，也不代表具备私有仓库凭据。打包与运行时入场检查确认 Git、SSH、HTTPS 辅助程序和 CA 文件存在，缺失时拒绝启动不完整运行环境。隔离探针使用真实 Git 子进程与本地合成 SSH 握手核验传输可执行，再检查正式 Plugin Manager 安装；不修改官方插件管理的预检查或安装协议。官方国内 registry 仅服务 npm 依赖，GitHub 访问仍遵循原仓库地址。

19. Android 应用归档每次从当前已安装的锁定生产依赖图重新整理；包版本相同不代表补丁字节相同。完整复制新暂存目录后替换旧暂存目录，再在最终路径生成依赖链接，避免旧包和 Windows 暂存链接进入新运行包。运行时的安装身份包含所有归档哈希，补丁或工具变化必须形成新的受管安装目录。

20. Android 的附件持久化以原生壳已经创建的 `ELECKOI_RUNTIME_ROOT` 为目录同步边界，要求附件 home 位于该目录内；不再同步沙箱之外的 `/data/user/0` 等祖先。锁定版 `dsh-attachment-local` 的平台转换与 Session 发布转换一样，在打包时核对包身份、完整源码哈希和唯一调用位置。完整附件仍写入、同步后以 `renameat2(RENAME_NOREPLACE)` 发布，保留内容寻址、碰撞校验、只读权限和失败传播；已存在对象的别名先独占复制、同步再发布，保留原对象。转换只进入 Android 归档，PC 与工作区依赖不变。真机回归覆盖保存、读取、重复保存、碰撞内容校验和临时文件清理。

21. Android 首次空数据启动不主动初始化官方默认 Workspace。锁定版 `dsh-client-ui-workspace` 在 Workspace 和 Session 都为空时由初始导航自动调用 `initializeDefault`，失败会弹出工作区通知；移动产品的消息、角色与创作入口不需要这项自动导航。Android 打包阶段核对正式包身份、完整客户端文件哈希和唯一初始创建块后移除该块，保留已有 Session 恢复、最近工作区选择及用户明确发起的目录操作和错误处理。PC 安装依赖与客户端文件不改变，升级 DSH 时重新核对该例外。空数据启动回归必须证明不发送初始化请求、不产生工作区通知，同时验证已有会话恢复。

## 验证与验收

### 系统栏与移动页面配色

移动窗口用 `--mobile-header-bg` 定义页面顶面，页面标题栏与设置底面使用同一变量；`--mobile-system-bar-bg` 表示当前邻接系统栏的底面。侧栏在进入到退出动画完成期间使用侧栏底色，退出后恢复页面顶面；右侧栏显示时使用其底面。原生平台适配只读取这个已由 CSS 解析的颜色和正式主题，不能固定读取卡片色或按手机系统主题推断。

平台适配在应用挂载后监听窗口声明的页面、侧栏、右侧栏状态与主题样式，去重后更新原生容器。覆盖整个窗口的移动遮罩按挂载生命周期声明实际元素；官方 Modal、ImageLightbox 沿锁定版本的 body 直属 portal、dialog/presentation、aria-modal 和 aria-hidden 遮罩结构识别，不修改第三方组件。仅监听 body 直属子节点增删和已登记遮罩属性，不监听应用内部的子树。平台读取实际背景色、伪元素与透明度，依照层次叠加到底面，使用 sRGB 像素输出原生合同要求的六位十六进制颜色，不依赖 CSS 颜色的文本序列化格式。只在已登记遮罩自身及祖先的进入、退出动画运行期间采样，卸载后释放；聊天内容的子节点、内部加载图标和动画帧不参与系统栏同步。Android 15 的透明系统栏由原生容器的 inset 区域实际绘制，最终外观由实际设备检查。 原生容器应用系统栏、刘海和输入法边距后返回已消耗的 WindowInsets，WebView 不再重复导出相同安全区。底部可点击系统导航区域由 WindowInsetsCompat.tappableElement 的正式边距识别，三键导航使用居中的 48px 应用按钮栏；手势导航保留既有 64px 布局。导航模式切换和页面重载都会更新该平台布局状态，输入法显示时应用底部导航仍移出布局。侧栏头像、名字和图标设置入口共用一行，`sidebar.footer.action` 仍独立渲染官方插件贡献。

### 角色与预设库的移动呈现

角色详情复用共享 `CharacterProfilePanel` 的卡片切换、简介字段和角色操作合同，仅在移动样式中收紧立绘与间距；开始对话和编辑角色并排，详情不提供分组编辑。`character.page.section` 的资料贡献仍接收当前角色及移动路由回调。卡片切换替换当前详情路由，避免连续切换后返回堆积详情页面。

角色和预设操作使用同一个锚定气泡菜单，分组管理进入独立页面，选择、确认和名称编辑使用移动控件。角色分组排序、重命名和成员保存通过当前 `saveGroups` 合同提交；删除分组遵循 PC 的剩余分组归属。预设分组使用正式 ID 和现有目录服务，不引入旧端排序字段。批量预设操作逐个调用既有导出或删除方法，只保留失败项供重试；默认 Agent 预设不可选入删除。确认未完成时禁止重复提交和退出。多个遮罩分别登记和释放，关闭其中一个时保留其余遮罩的底色，全部关闭后恢复页面底色，不监控消息流或按 DOM 文案推断。

### WebView 认证生命周期

Host 使用动态端口，锁定版本的 `client-connection` 按 hostname 与 port 生成独立名称的签名 Cookie；浏览器 Cookie 按主机共享，不按端口隔离。WebView 会跨进程重启保留 Cookie，直接反复加载启动 URL 会累积已经退役的 authority 认证，最终触发 Node 的请求头溢出和 HTTP 431。

原生壳先通过请求局部 Cookie jar 完成官方 token 交换和最终页面校验，取实际响应签发的 Cookie，不自行签名或修改 DSH 认证。成功后只删除该 WebView 主机下符合锁定版正式名称语法、且不属于当前 authority 的 DSH 认证 Cookie，保留插件 Cookie。等待每次 CookieManager 写入成功回调后加载页面；失败明确可见，重试和 Activity 销毁使过期加载任务失效。禁止以提高请求头上限、清空所有 Cookie 或清空产品数据替代生命周期管理。

`probe-device.mjs` 同时检查真实 WebView 的移动应用根、主文档状态和当前 authority 的单个认证 Cookie。独立 HTTP 握手成功、Host ready 或覆盖安装成功都不能代替页面验收。增长回归覆盖已有 Cookie 累积、多次端口变化、异步更新失败和加载任务替换。

依据：[锁定版本认证源码](https://github.com/deepseek-ai/deepseek-harness/blob/c1b47e41fcd54d20a0f061df28683bfc29ee24e5/packages/client/connection/src/browser-auth.ts)、[Cookie 的端口共享规则](https://www.rfc-editor.org/rfc/rfc6265#section-8.5)、[Android CookieManager 异步写入](https://developer.android.com/reference/android/webkit/CookieManager)、[Node 24.19 HTTP 请求头溢出](https://nodejs.org/download/release/v24.19.0/docs/api/http.html#event-clienterror)。

先验证运行时配置、严格资源校验、Host 启动、官方 Remote、发送、取消与重启恢复，再完成 Android APK 构建。真机连接后验证实际应用沙箱内 ARM64 Node、网络、原生模块、DSH 受管子进程与 WebView，不能用 Windows Node 或 adb reverse 预览替代手机运行结论。回归桌面检查，并核对原 PC 业务源码、数据库定义及数据路径未被 Android 改动。

实现依据：[锁定应用启动源码](https://github.com/deepseek-ai/deepseek-harness/blob/c1b47e41fcd54d20a0f061df28683bfc29ee24e5/apps/cli/src/profile-boot.ts)、[官方 Web 组合](https://github.com/deepseek-ai/deepseek-harness/blob/c1b47e41fcd54d20a0f061df28683bfc29ee24e5/packages/bundle/web-app/cordis.patch.yml)、[Remote 合同](https://github.com/deepseek-ai/deepseek-harness/blob/c1b47e41fcd54d20a0f061df28683bfc29ee24e5/docs/api-gateway.zh.md)。
