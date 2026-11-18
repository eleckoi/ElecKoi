# 测试与日常验证

`setting-library-runtime-tools.test.js` 沿实际设定读取工具执行正式 EJS，核对省略分号、行注释、转义标签、空白控制、异步输出、locals／this、聊天历史的数量／范围／角色选择与空历史，以及 Lodash 深拷贝、getvar 的 clone 选项、对象映射、链式调用与空值语义。引用覆盖文字原样返回、多层 EJS 共用聊天上下文、完整引用记录、并行／菱形／重复引用、长链、循环与内层错误传递。历史读取不应写入消息或会话数据。`setting-library-ejs-ui.test.jsx` 装配正式文档页，核对宽窄呈现下引用正文复用右上角同一格式菜单、双向切换和正文保留；`creator-authoring-capabilities.test.ts` 核对引用正文格式可保存和读取，必读／自动注入约束保持。`windows-caption-menu.test.ts` 核对全窗口作者 iframe 的透明原生控制区、明暗对比、退回内容区、隐藏／恢复、移除及卸载后的主题恢复；普通非全窗口界面继续使用应用标题栏主题。

`creator-global-authoring.test.ts` 核对共享设定库中的 EJS 引用可通过正式创作能力创建、切换格式、批量修改和片段编辑；修订冲突与无效批次不写入。`global-setting-libraries.test.ts` 核对正文模式在保存、运行合并及磁盘重开后保留，必读／关键词／自动注入不能冒充引用。`creator-authoring-capabilities.test.ts` 另直接执行发现目录中的示例参数，确认保存与读取保留模板源码，创作读取不触发递归执行。

`character-frontend-packages.test.js` 使用正式前端包页和官方 Portal，核对包选择与更多菜单在深浅主题、宽窄内容区的真实按钮间距、同树锚点、边界可见及卸载关闭；原目录、图标、包切换与导入合同继续覆盖。`editor-creation-polish.test.js` 另核对资产库筛选、排序和展示尺寸在窄屏横向空间不足时，仍贴着原按钮展开。不能仅断言菜单没有超出屏幕来代替锚点定位检查。

`avatar-crop-encoding.test.jsx` 核对双指中点缩放、抬起一指后的连续拖动、取消与丢失捕获、原缩放边界及最终裁剪源坐标。`avatar-crop-interaction.test.js` 装配正式裁剪弹窗与移动样式，在深浅主题和手机／平板／PC 宽度核对图标居中、触区、缩放条及画布间距；通过浏览器触摸事件实际放大、缩小、旋转后调用正式 Worker 保存，核对输出图片尺寸。该合成浏览器测试不等同 Android 真机或安装包验收。

`dsh-client-creator-studio.test.ts` 注入会话目录与统计读取失败，验证已打开的对话、已提交的修改和重新生成可继续。未知 Session 仍须通过正式目录确认。`dsh-client-presets.test.ts`、`tool-provenance.test.ts` 与 `dsh-client-models.test.ts` 分别验证已导入预设、工具权限和模型基础目录在补充信息失败时可用，后续读取可以恢复。`generated-image-cleanup.test.js` 模拟提交后的图片路径校验失败，确认已生成的回退记录和准备状态一致，下次会话改写按原归属规则重试清理。`android-startup-page.test.js` 核对原生文件和链接操作的错误提示入口与启动恢复入口各自接线。

`novelai-image-generation.test.js` 沿正式 Agent 流验证分镜 JSON 无效、数量不符和图片模型缺失时，正文完整完成。格式错误保留配图失败事件，三个场景均无图片请求，随后在原会话验证有效分镜成功出图。`dsh-client-character-configuration.test.ts` 与 `dsh-client-conversations.test.ts` 注入单个抛错的订阅回调，核对原始诊断、同一事件的其他接收者和后续配置／会话变更。

AI 工具设计及验收约束见 [工具设计与错误恢复规范](AI_TOOL_DESIGN.md)。`creator-studio-runtime.test.js` 覆盖默认 Schema／显式摘要、只读空参、必填／错误类型／遗漏写参，以及真实 Agent 循环中的错误后恢复。混合参数被拒后，下一请求必须收到原错误、准确合同与可用调用，再完成合成角色创建、设定保存和冷恢复；原角色及已保存的长正文须完全保持，显式 ID 不要求先绑定。三个协议适配器通过本地 HTTP 检查恢复合同没有在序列化时丢失，不调用外部服务商；固定响应不代表真实模型成功率。`tool-result-recovery.test.js` 同时覆盖正式 Host 输出策略、保存预设恢复、万条结果及会话权限。相关检查证据见 build/creator-tool-contract-check。

`avatar-crop-encoding.test.jsx` 除成功、取消、退出和能力缺失路径外，直接加载正式裁剪 Worker，在无 2D 上下文时核对失败码、诊断与详情经过结构化克隆后完整到达页面，错误可见、无保存及两侧资源释放。浏览器像素回归先打包正式编码器和 Worker 及其共享失败合同，再核对六组图像的尺寸、透明、像素与 PNG 全字节一致。`local-media-thumbnails.test.ts` 继续核对坏缓存删除后重建、原图保持、动画和方向、并发复用及清理；缓存读失败的明确尽力处理不代替后续重建。

`creator-studio-user-edit.test.jsx` 直接装配正式 UserMessageNodeView 和产品动作，核对原复制后的修改、完整正文／序号、取消／失败重试、空白／重复写入、生成及跨 Session 状态，steering 和非用户输入没有入口。`dsh-client-creator-studio.test.ts` 验证原 SlotCore 桥仅注册工作室用户动作、Remote 参数和原地历史重载；Host 的 `creator-studio-message-edit.test.js` 使用真实 JSONL 编辑并冷恢复，逐项保留原事件、附件及会话设置，明确断言官方恢复追加的单个 session/end-seed，拒绝 AI、缺失、空及生成中修改。build/studio-user-message-edit-check 保存正式运行 bundle 的手机／平板／PC 深浅六组浏览器结果；它使用合成写回，不能冒充真实客户端或 Android 真机验收。受管 ui-chat 新增用户动作座位的源码／bundle／声明一致，清理条件维护在调用旁及 pnpm-workspace.yaml。

`workspace-session-visibility.test.ts` 的创建插件导航必须经过真实 Cordis 父插件及子级布局提供者，保留父级直接 ctx.layout 因未 inject 而失败的对照，再使用锁定官方 LayoutController／Store 核对三处菜单把实际 main key 切到 creatorStudio；不能仅用普通对象 layout 和调用计数证明运行可跳转。用户离开后迟到准备完成不得重新导航。build/create-plugin-navigation-check 另保存正式菜单、官方 Frame 及两端正式工作室页面的两主题四组浏览器可见性核对，准备中与准备后均保持目标页；会话数据合成，不代表已安装包或真机验收。

`mobile-library.test.jsx` 覆盖安卓角色详情的单个导出 PNG／ZIP、实际目标 ID、失败重试、取消不误报、请求中不重复执行、删除确认／取消／失败／成功、离开后迟到结果不导航，以及缺失角色与返回关闭菜单。合成删除夹具实际更新目录，核对成功只删除目标并返回列表。build/mobile-character-profile-actions-check 保存正式详情页及原菜单／确认弹窗在两主题、窄手机／手机／平板／横屏八组触摸浏览器证据；导出回执为合成数据，不代替真实文件、系统保存或安卓真机验收。

`native-script-ui.test.jsx` 覆盖精简作者面板的可访问标题、按原身份挂载及相对资源、忽略无关 frame 通知、加载错误／重试、更多菜单重载与逐次释放，以及底部操作区和作者页面之间的焦点回环。`mobile-preset-library.test.jsx` 检查与角色共用的顶部批选栏、空圈／勾选与实际数量、全选、格式、取消和失败项重试；原默认预设保护由 `mobile-library.test.jsx` 保留。正式组件浏览器证据位于 build/script-panel-design 及 build/preset-export-selection-check，包含两主题／三类视口、101 个导出 ID 的完整集合与格式；合成下载记录不代替系统文件保存或真机验收。

`mobile-dialog-scroll-preview.mjs --serve` 装配正式模型选择、问题报告、设定库并入、版本管理、确认、错误、作者确认、绘图选择和移动聊天浮层，注入合成目录及诊断数据。对该页运行 `mobile-dialog-scroll.probe.js`，浏览器通过 CDP 下发真实 touchStart／touchMove／touchEnd，从正文和按钮中间向两个方向滑动；手机、平板及短屏覆盖并入列表末尾与外层滚动，同时保留搜索末项、选择、删除与关闭检查。原模型列表样式作为负向对照，不能用设置 scrollTop 或鼠标滚轮代替触摸可用性。证据写入 build/mobile-dialog-scroll-check；不是安卓安装包或真机验收。

2026-11-17 角色瀑布流按需挂载：`character-masonry.test.js` 使用正式 PC CharacterManager／手机 MobileCharactersPage 和 10001 张含长短标题、缺封面的合成卡片，覆盖手机 390／768px、PC 900／1440／1900px、两主题、首中末、末尾编辑／复制、进入详情返回、滚回顶部及实时改列。每阶段核对实际挂载数、重叠和横向溢出，检查返回锚点几何，截图须等实际绘制后检查；不把图片 lazy 当作卡片虚拟化。`masonryGeometry.js` 只为无布局引擎的 jsdom 提供有界视口与观察器，原作者、排序、分组、勾选、删除／导出错误和取消断言保留。手机 101 张逐项选择和全选检查改为沿滚动取到目标卡，核对已选数量及完整 101 个 ID 交给原导出服务，不要求屏幕外节点全部挂载。`avatar-loading.test.jsx` 增加按封面长边和 1／2／3 倍密度选择、超出预览规格回到原图；原本地媒体检查补大尺寸派生图重开及全部尺寸删除。证据 build/character-masonry-check；合成浏览器检查不是安装包或安卓真机验收。

2026-11-17 安卓封面裁剪保存：用户打开实际开发版并点击裁剪弹窗保存，ADB 记录页面 PNG `toBlob` 回调等待约 13.07 秒、随后 Data URL 读取约 14.6ms，期间尚无资料保存 Remote 请求；不能据此前的口述位置判为数据库保存慢。同图页面及页面 Offscreen 编码约 4.08／4.13 秒，独立 Worker 含转移约 140ms，PNG 1805498 字节及 SHA-256 完全相同；这是修复前的手机临时编码路径对照，不是已安装修复包验收。`avatar-crop-encoding.test.jsx` 验证正式裁剪组件绕开慢页面编码、文件输出、异常可见、退出取消、迟到位图及 Worker 启动失败释放，并保留缺少对应浏览器能力时的原编码路径。连同原头像管理及角色资料三文件 13 项通过；`avatar-crop-encoding.test.js` 在实际 Chromium Worker 比较 420 方图／900×1200 竖图、三个旋转角及透明渐变，六组像素与 PNG 全字节一致。记录 build/cover-crop-speed-check；临时编码不修改持久角色、不发送消息，手机隔离 Host 合成库及图片随探针清理。

2026-11-17 头像加载与消息目录：`message-list-virtualization.test.js` 以正式 PC／手机列表的 10001 条合成会话核对首屏、中部、末尾的挂载数，保留末条打开、菜单、置顶和手机侧滑及返回位置；不把头像懒加载当作列表虚拟化。`avatar-loading.test.jsx` 检查双端显示密度、失败后原图回退及缓存资料首帧头像；原头像原图预览与资料保存检查保留。`local-media-thumbnails.test.ts` 覆盖比例、透明、动图、方向、原图字节不变、无放大／小图不另存、并发复用、替换／清空／删除／回滚、损坏缓存恢复、启动中断文件和孤儿清理、解码期间删除；`product-media-assets.test.ts` 沿实际认证 HTTP 入口检查私有缓存、304、HEAD、范围和删除后 404。Android closure 检查必须拒绝缺少本平台原生图片库；Windows 合成页面和静态 ARM64 依赖核对均不代表手机安装验收。证据位于 build/avatar-loading-analysis-20261117，富消息卡片导致系统回收图片的假设尚未证实。

2026-11-17 更多菜单创建插件跳转：`workspace-session-visibility.test.ts` 覆盖 PC／安卓三处菜单的草稿等待及失败，要求点击时已经导航到创作工作室，准备完成不重复导航，保留官方提示文本、追加策略及浏览插件回调。`mobile-creator-studio-navigation.test.jsx` 同时装配当前正式 PC／手机工作室页面，检查挂载不覆盖已有 loading／error 状态、失败可见及手动重试，普通 idle 进入仍恢复会话。`dsh-client-creator-studio.test.ts` 补草稿阻塞／异常的原始错误发布、原会话保留和离开后迟到创建的引用释放，不调用模型或改写真实聊天。证据见 build/sidebar-create-plugin-check；组件与 Client 检查不等同已安装客户端验收。

`desktop-update-prompts.test.ts` 补下载进度隐藏后的安装确认：ready 到达隐藏操作收尾前后均须在下载 Promise 结束后打开原“安装并重启”，进度保持／重开均只确认一次；取消后不重弹，主窗隐藏时等 show，释放后不再出现，available 的原去重保持。测试仅用合成下载与模拟安装入口，不调用真实下载或退出安装。

图片预览时序另由 `chat-stream-scroll.test.jsx` 在正式 ChatView、消息组件和官方 HistoricalImageCache 中覆盖“正式输入先发布、提交稍后退休”：两种布局均须一直保留预览、退休前零附件读取、退休后仅一次正式读取并接续同一图片节点；旧转接在正式输入到达阶段会丢图。`chat-message-reconciliation.test.js` 检查同一请求的预览可交接、其他请求及会话不能复用；Client 投影检查验证 admitted 仍持有提交预览，pendingSubmissions 退休后恢复正式附件引用。以上为共用 Web／Client 检查，不是 PC 或安卓的现场发送验收。

2026-11-16 手机输入框挂载失败：`mobile-composer-enter.test.jsx` 增加仅有空根且保留选区的首次挂载／重新挂载场景，明确验证清除选区的快照为空、输入框仍存在、正文可更新及发送事件可达；手机另检查无 DOM 选区写入及不抢输入焦点。旧挂载交接在该场景抛出 Lexical #38，与 ADB 读取的真机 `composer.bar` 崩溃一致。修正沿公开选区更新接口完成挂载前交接，原文字／caret、PC 自动聚焦与加号菜单检查保留；连同 `mobile-native-command-menu.test.jsx` 两文件 24 项通过。现场记录与安装结果见 build/mobile-composer-missing-check，组件结果不代替真实输入法完整验收。

发送图片的预览交接由 `generated-image-interactions.test.jsx` 沿锁定官方 HistoricalImageCache 检查：本地预览转正式引用、两种布局、等待期间连续重绘、canonical URL 接续、同一图片 DOM、正式尺寸、单次读取及失败／会话隔离。`dsh-client-conversations.test.ts` 同时检查同步预览按实际 Session 交给官方接口且不另发读取，`chat-image-layout.test.jsx` 保留原尺寸及多图布局断言。用户于本轮要求停止模拟，未继续 PC／手机画面模拟，不将组件回归当作真机验收。

2026-11-16 Windows 标题栏通用合同：windows-caption-menu 检查 preload 发布平台标记和高度；windows-caption-ownership 检查侧栏挂载／卸载既不伪造也不移除宿主标记，合计六项。manager-caption 浏览器保留两类管理器八组／24 次主题切换的真实画布匹配，并按官方 primary 解析值核对按钮文字；追加两主题下普通、body 属性切换的透明主题及恢复六组，检查去重 IPC 色值、原生 Modal top=40 和平台标记。window-caption-alignment 六组同时检查品牌／内容区 no-drag 与 caption drag，保留原导航、菜单和几何断言。记录 build/modal-caption-check；该浏览器主题用公开 token 模拟插件输入，不代表完整壁纸插件或实际 OS 鼠标拖窗验收。

2026-11-16 编辑预设首次布局：`preset-introduction-editor.test.jsx` 先检查文本编辑模块尚未完成时空说明表单、最终写作区座位及取消／保存按钮已存在，再等待 React 流完整检查正式编辑器；`preset-editor-workspace.test.jsx` 让详情通知先于 read 完成，确认全程保持请求的基础资料布局。两文件 32 项与原 `preset-editor.test.js` 浏览器回归通过。正式隔离 Host／客户端复现及逐帧对照见 build/preset-editor-startup-check/before.json、after.json、after-cold.json：旧零高度表单 fallback 使更新区下移 345px，修后普通与禁用缓存、延迟资源两轮位置及滚动保持，不等同真实用户数据或 Android 真机验收。

2026-11-16 PC 预设首次加载追加：首页入口只组合目录 Context、列表和只读简介，完整 Workspace 与使用说明表单分开；通用折叠状态移动到 ui 后须验证 settings 旧公开入口仍使用相同 Context／缓存。预设三文件、列表折叠、角色目录及手机角色目录六文件共 63 项 UI 检查通过，原 `preset-editor.test.js` 浏览器检查继续覆盖编辑、保存、独立窗口及长正文。含延迟表单的 SSR 检查等待 React 流 `allReady` 再检查全部按钮，不能仅用同步 fallback 判断表单缺失。`build/preset-loading-performance-check/assets-before.json`／`assets-after.json` 是构建后入口静态依赖体积，`cold-final.json` 是正式隔离 Host／客户端新进程、两条默认预设的观察；约 31ms 首次内容出现与 8ms 目录 RPC 不能代指用户数据、整机启动或所有设备表现，也不能据此宣称已复现数秒空白。

2026-11-16 手机角色详情 B 版：`mobile-library.test.jsx` 沿正式手机路由和原页面插槽核对原作者、完整长简介、空字段、封面／头像失败回退及进入／编辑目标；保留按钮不进入滚动区的断言。连同角色简介空态与键盘检查共 17 项。正式组件浏览器六组深浅／320、390、768px 检查竖图比例、左对齐、面板铺满、无溢出、长简介滚到底后底栏位置及与官方按钮的颜色一致；另核对实际竖图完整显示、点击回调及 PC 原卡组。截图、几何和事件见 build/mobile-character-profile-check；非真机或安装包验收。

2026-11-16 预设进入／新建性能：`agent-presets.test.ts` 检查多个完整预设摘要、必需提示词计数和 profile 不丢失，同时检查目录不选择 payload、读取次数不随预设逐项增加；`tool-provenance.test.ts` 使用真实 Cordis 工具注册核对内置组不读包清单、扩展来源、官方插件变化失效、失败重试及工具卸载。页面检查覆盖 PC 直接展示共享 ready 目录、外部更新／重开，手机首次未到目录时不假报暂无、重开不重复请求，原创建保存与订阅断言保持。隔离 SQLite 性能数据见 build/preset-loading-performance-check/before.json、after.json：约 63MB 合成正文的目录和新建数据库耗时，不含网络、手机硬件或首次 JS 模块加载，不能作为真机端到端耗时。当前 SQLite ABI 149 使用已装 Electron Node 模式运行，不重建用户使用的原生模块。

手机预设页的紧凑用途切换、各用途分组选择恢复、真实作者图片、稳定分组 ID、改名／新建／删除失败重试、编辑锁定与完成时排序保存由 `mobile-preset-library.test.jsx` 覆盖；已有 `mobile-library.test.jsx` 继续检查默认项删除保护与批量失败重试。客户端 `dsh-client-presets.test.ts` 检查排序的用途、Remote 参数及失败时不采纳目录；Host 的 `agent-presets.test.ts` 检查分组完整集合、重复／异用途拒绝、保存重读、成员归属及内置旧名称的精确更新。`regex-rules.test.ts` 保留默认名称投影检查。正式组件的 390px 浅色与 320px 深色隔离预览记录于 `build/mobile-preset-library-check`，不等同 Android 真机或安装包验收。

2026-11-16 添加更新图标的可见性需检查实际截图像素，不能仅判断 SVG 节点或 computed color。沿 `mobile-model-layout.probe.cjs` 的 updates-only 分支，对正式预设组件装载官方 sprite，在深浅／320、390、640px 核对图标区域有高对比像素，并临时使用缺失符号验证空白为 0；保留尺寸、点击和同行检查。记录 build/update-button-icon-check，输出两主题的按钮实际裁剪图。

2026-11-16 模型控件与更新按钮：`mobile-model-layout-browser.test.js` 在真实手机配置、分组与预设更新记录组件中核对深浅／320、390、640px 六组：32×18 开关及单行标签、目录默认切换后的可编辑状态、三处复选框与官方对照的中性配色、32px 更新按钮同排及图标前景、实际打开编辑器，保留原参数、模型按钮和分组几何断言。夹具安装与正式主题相同的图标 sprite，避免孤立截图漏加号。记录 build/model-controls-compact-check；非手机真机验收。

2026-11-16 侧栏显示恢复：`mobile-drawer-presentation.test.js` 装配精确锁定的真实 AppFrame、原布局 Store 和产品 SidebarContent，覆盖深浅与 320／390／600／768px。核对进入／退出中间帧、反向切换、80%／326px 宽、95% 缩放、36px 圆角、中心与底部导航接缝、原遮罩及底部区域实际 CDP 点击收起、inert、草稿／滚动／节点身份、底部贡献、减少动态效果和平板不应用；其浏览器夹具只把 React 18 的 inert 空串合同转为测试 React 19 的等价布尔属性。手机导航三文件 23 项继续验证原侧栏和工作区、导航返回及源列表恢复，不用隔离截图冒充真机验收。记录 build/mobile-drawer-restore-check。

2026-11-15 官方中性色检查：`roleplay-style.test.js` 继续检查 32 组 PC／移动角色气泡与底板，参考材质的颜色改为官方主题 token，像素合成检查保留；追加实际 `<input type=color>` 在同一已挂载页面深浅切换后与官方 token 相等，独立颜色、重置及透明度原断言保持。`editor-collection-theme.test.js` 使用正式手机／平板列表与已安装官方 Switch 作颜色对照，24 组覆盖 320／390／768px、角色／预设、脚本／正则与深浅；核对列表面、文字、选中态、开关开启／关闭的轨道和拇指、点击切换及横向溢出。颜色静态探针关闭过渡后采样，避免把过渡起点当成最终色；比较实际绘制色，避免把同色的 hex／rgb 序列化差异误判。真实主题 token 的压缩 hex 格式由浏览器检查覆盖，非真机验收。

2026-11-15 窄屏底板：`roleplay-style.test.js` 扩为两种主题、气泡开关和八种 PC／移动容器组合，共 32 组；包含移动 599／600px 边界、768px 平板，以及窗口 780px 但聊天容器被侧栏压窄的 PC。以实际 panelWidth 判断底板侧边内缩，小于 600px 应为 0，600px 及以上保留至少 8px；原首条贴顶、5px／12px 消息净距、10px／14px 内距、头像／楼层、滚动、材质和设置检查保持。查看手机与平板截图，非 Android 真机验收。

2026-11-15 酒馆气泡实测还原：参考为用户当前本地酒馆 DOM／computedStyle／DOMRect 的 5px 消息净距、10px padding 和约 10.67px 含边框头像顶距。`roleplay-style.test.js` 在原 16 个 PC／手机、深浅组合中核对开启气泡时所有消息净距 5px、实际头像顶距 10px、首条贴顶；关闭时保留净距 12px／内距 14px，原楼层、滚动与材质断言不变。自定义 24px 检查通过正式共用设置模型更新已有滑块，不再绕过模型改原始 profile；`chat-display.test.js` 同时检查新缺省值、保存解析、关闭恢复普通间距及重置。未新增屏幕控件、SQL 或真机验收结论。

2026-11-15 角色气泡贴顶：`roleplay-style.test.js` 在正式 ChatPanel、官方 ConversationRoot／Content 与 AppFrame 承载的合成消息中，检查深浅主题及 1440／900／390／320px 共 16 个气泡开关组合。滚到开头时，开启气泡的首条外部顶部距离为 0，关闭时保持 10px；内部 14px、消息间距 12px、滚动到底和单个输入区的原检查保留。修复前新增断言检出 10px 空带，修复后通过，并查看 PC 与手机截图；不称真机验收。

2026-11-15 变量底部留白与开场白：`mobile-editor.test.js` 在正式手机变量文档滚到底后核对最后输入框仍在表单内、保留实际底部内距，另用 390×420 高度复核 24px 留白；不是 Android 真机输入法验收。`character-openings.test.ts` 覆盖空正文／空白字符选项、空主项、多项切换、变量绑定与磁盘重开，单条空开场仍不生成消息。`opening-variable-editor.test.jsx` 和 `settingLibraryEditing.test.js` 覆盖手机／桌面上移到主项、主项下移、保存重开和边界；`opening-controls.test.jsx` 覆盖角色／Agent 空正文的翻页。`opening-pager-layout.test.js` 在正式 MessageBubble 及正式消息行结构中，检查 36 个深浅／320、390、1200px／三种头像／气泡组合的短、空、长正文切换与箭头几何位置。探针须启用离屏绘制保证隐藏窗口动画继续运行，不改产品动画；不得以缺少正式消息行导致的 Flex 收缩当成产品长正文故障。

角色输入与轨迹回归直接执行已安装的官方 Client：`native-input-preparation.test.ts` 核对产品服务缺失时仍可原生发送、准备失败保留和空提示续写；角色 SlotCore 回归核对带子座位的输入扩展及队列出现／卸载。轨迹请求用例沿 `tests/helpers/officialTrajectory.js` 读取真实官方定义和布局，保留重新生成的正式输入身份、请求和错误断言，提示词变更提示沿当前官方行为。`native-roleplay-trajectory.test.jsx` 将正式角色轨迹入口接到官方 View，确认原结果订阅及子调用折叠能力透传，不加载本地轨迹副本。

`composer-scroll-popovers.test.js` 使用正式 ChatPanel、锁定 Chat Client 的 ChatView／ChatFlow、原 ActivityPill／UsagePill 和官方权限／占用组件，覆盖空对话、80 条合成官方节点和输入区增高，320／390／1200px、深浅主题下核对五个浮层的实际按钮间距及点击前后滚动位置，另查末条可见、官方返回底部、更多菜单、轨迹切回与草稿保持。流式部分以正式 assistant-step 不可变节点和 running 状态连续追加 24 次正文，在手机／桌面宽度保持五个浮层打开，逐次记录按钮间距、正文增长及滚动变化，浏览器 bundle 使用与产品一致的 production React。默认当前 Electron；`ELECKOI_POPOVER_BROWSER` 可选择隔离的旧 Electron 运行同一探针，用于复现系统 WebView 所属 Chromium 代际，不读真实手机或会话，不等同手机验收。

`composer-attachments-layout.test.js` 核对「更多／返回」沿原官方菜单按页重新挂载、焦点落在当前页首项，并取消菜单内部的自定义过渡；保留背景与脚本操作。其菜单检查使用正式角色／工作室输入菜单与真实手机版标记，分别在两种主题和 PC／手机宽度核对主菜单、更多菜单与实际触发按钮的 4px 间距；不能用 Portal 的父元素代替触发按钮。安卓开发版另通过 ADB 和当前 WebView 复现旧规则覆盖后的顶部错位，临时移除 `bottom: auto` 后回到正确锚点；这一现场验证不等同已安装包含修复的新 APK，现场截图只保留在 ignored build。

`bug-report-collection.test.ts` 沿官方 Logger、共享原始诊断格式器、真实桌面文件日志、跨启动读取及正式报告收集验证根原因、聚合成员、长 Unicode 末尾、轮转文件和最终正文。故障列表使用原始捕获范围，摘要独立保留原行数；用户不带日志时不导出原始诊断正文。`app-log.test.ts` 保持进程出口和原日志行为检查，不改变官方退出策略。

`deepseek-web-profile.test.js` 的模型删除用例使用正式 desktop／android profile：工作室通过官方 `llm-pi-ai` 设置路径创建并删除提供商，验证旧选择保留、热打开、空会话创建、冷恢复、失效模型请求明确失败，以及选新模型后在原 Session 完成请求；角色对话保留真实合成输入与回复，验证冷恢复、模型入口读取、消息访问、失效请求不丢历史、新建及换模型后继续发送。此处 Android profile 由隔离桌面 Node 承载，不代表手机验收。`creator-studio-message-edit.test.js` 同时覆盖回退移除模型事件后恢复失效的保存选择；`dsh-old-chat-generation.test.js` 逐字节核对失效模型在重新生成的回退前失败，保留对原消息、原模型、重复失败及事务回滚的检查。检查记录位于 `build/studio-removed-model-check/`。

角色卡独立 JSON 导出已撤除：格式和结果合同只保留 PNG／ZIP，沿现有接口校验，不另加 JSON 专用拦截。角色卡内容、作者、脚本、设定和资产的往返检查使用 PNG／ZIP。`character-assets.test.ts` 比较包内 `character.json` 的视频文件引用和独立二进制字节，避免把视频展开为独立 JSON 导出。既有 JSON 单向导入、预设 JSON 导出及包内元数据编码不属于该删除范围。

`catalog-manager.test.jsx` 覆盖 PC 角色排序使用目录实际时间、未知历史置后、PC／安卓偏好隔离和重开、保存失败回退、分组结合排序及删除分组保留成员；两页原分组右键添加／重命名／删除、预设原顺序及 PNG／JSON 导出保留。`character-list-actions.test.jsx` 覆盖 PC 角色右键编辑准确目标、底部删除与确认、PNG／ZIP 导出准确目标、失败后重试及取消。Client 模型检查覆盖已有字节下载和原生保存接口。隔离正式组件核对净间距约 12px、原配色无分隔线、无新增分组加号／图标／未分组行，以及两页滚动条右边缘 2px 和官方 5px 皮肤；不操作真实客户端或数据库。

`mobile-character-library.test.jsx` 和 `mobile-library.test.jsx` 覆盖正式安卓分组条的横滑后首次切组、无数量、排序偏好重开、编辑禁止收起、长按原位隐藏和唯一悬浮、取消与落位、完成保存与失败重试、新建／改名／删除、批量成员移动；排序使用 Host 的本机时间，未知及相同时间保持原目录顺序。`character-catalog-activity.test.ts` 覆盖 v17→v18 原子升级与回滚、旧记录未知、真实时间防伪、作者修改及只读边界、1001 张卡和长内容、批量归组回滚及磁盘重开。隔离浏览器核对正式组件与确认稿的面板像素、菜单 4px、320px 深浅及长分组滚动；不替代安卓真机验收。

`dsh-connection-recovery.test.js` 覆盖本机 Host 在浏览器初始离线、在线转离线和载体中断后仍可建立新 generation，以及远程 Host 的离线暂停／上线恢复。隔离完整工作室验证记录在 `build/studio-live-refresh-check/`：旧实现可复现后台完成而计时和工具记录停滞，新实现无需切页或恢复外网标记即可收到结果；另以持续前台的长前端参数、耗时 EJS 验证、角色／设定／变量／脚本／资产读取、正则保存及开场白写入核对计时持续更新和最终持久结果。合成浏览器验证不等同 Android 真机验收，也不能仅凭 Session 业务日志把历史手机故障归为网络问题。

子代理行为以锁定官方桌面流程为准。`dsh-subagent-runtime-context.test.js` 使用真实官方运行时验证父 Agent 可以先结束、子代理结算再唤起新的父执行，同时保留删除角色会话前停止后代的产品资源边界；不得用额外的 turn-stopping 等待把这些执行强制合成同一轮。聊天与轨迹回归验证通知触发的执行不再伪装为旧用户输入，已有输入重新生成仍沿其明确身份工作。`main-window-host-cookie.test.ts` 直接执行主窗口插件，验证认证后后台 Cookie 清理不返回或失败时，启动与 Host 重连均不被阻挡。

无调用代码审查结合导入／导出图、TypeScript 局部引用及实际入口清单。Cordis／Typert／浏览器页面的动态注册、构建脚本按字符串指定的入口、SDK 公开导出和领域公开入口不能仅因静态扫描命中而删除；确认无用的旧展示、旧投影和辅助链应连同无用导出、导入清理。2026-11-14 本轮扫描配置、原始候选、保留原因、删除清单与验证记录位于开发目录 `build/official-alignment-cleanup-20261114/`，工具只装在该隔离目录，不作为应用依赖。

测试按负责的代码归属，运行范围按本次改动选择。先证明请求中的行为正确，再完成相关检查；已有结果仍适用时复用，不因提交、推送或目录同步重复运行。

`character-import-configuration.test.ts` 覆盖完整卡 JSON／PNG／ZIP 与预设 JSON／PNG 的正则库及条目启停、目标安装已有正则组合时的实际变换、前端非首项选择与明确未选择、清单绑定、富消息／角色美化及开场白开关、默认开场白、1001 条设定和 1001 条变量首中末长文、全部条目启停与磁盘重开。`editor-library-version-import.test.jsx` 直接运行正式编辑器版本 Hook，检查脚本和正则命名版本的导入、草稿与再次导出都保留开启及关闭状态。两项均须能在修复前检出丢失或强制改写配置的缺陷；独立前端 ZIP 的原选择入口继续由资产及前端组件回归覆盖。

脚本随完整卡导入的启停状态由 `script-library-import.test.ts`、`native-script-transfer.test.ts` 和 `native-script-files.test.ts` 覆盖：库明确开启／关闭、库开关缺省及错误类型，角色 JSON／PNG／ZIP 与预设 JSON／PNG 往返和磁盘重开，文件夹／子脚本／按钮开关分别保持。真实隔离 Host 沿正式产品导入与 Typert Gateway 读取新聊天脚本清单，开启的卡无需额外切换总开关即可得到准确入口且 HTTP 返回原源码，明确关闭的卡保持停用；不执行真实角色卡程序或改写既有用户库。

Android 原生运行诊断由 `RuntimeDiagnosticsTest`、`HostRunDiagnosticsTest` 和 `AndroidDiagnosticsSessionTest` 覆盖。真实合成 Java 子进程输出 stdout、180 行 stderr 堆栈及无末尾换行的最后一行后以代码 1 退出，检查退出事件发布前两路均已持久化；重试超时、流关闭与应用诊断重开后，复制及导出仍包含按启动编号区分的原始异常。长 Unicode 行须分段完整还原，凭据在分段前清理，认证协议 URL 不落盘。并发两路写入超过正式存储容量并同时导出，逐条解析轮转记录，核对最多四个各 1,000,000 字节的日志和一个最多 500,000 字节的报告；磁盘失败必须可见。按标准及兼容两种 Debug 单元测试任务运行，不生成 APK，也不作为真机验收。

DSH 批次升级时使用实际安装的 Client 工厂与 CSS 语法树提取测试入口，避免依赖发布包的空格、分号或源码分区注释。会话批量追加回归覆盖单条失败时整批不提交、产品可忽略事件及持久化重开；子代理按当前 `waitForTreeWork`、具名地址和正式 Session Query 装配。创作能力说明通过真实工具调度检查 JSON 输出，保留 Zod 参数结构而不携带其非枚举运行时接口。原生文件系统清理类测试使用本机 Node；需要 SQLite 的 Host 集成可使用 Electron Node 运行时，明确区分运行时差异。

富消息尺寸由 `rich-document-measurement.test.ts` 检查首帧同步发布、后续合帧和释放，`rich-message-viewport-browser.test.js` 使用正式消息组件与隔离 Electron 窗口检查普通 HTML／原生 SDK 两路的图片延迟加载、视口单位、宿主窗口缩放、动态行内及外链样式、内容增减和窄宽度。保留字符串及 URL 原值、页面身份和零重复布局警告；原 `rich-message-settling-browser.test.js` 继续覆盖首进与切换聊天后无需滚动的楼层就绪。只使用合成媒体与临时 profile，不操作真实角色或聊天，也不替代手机真机验收。

作者页面的浏览器 ResizeObserver 延迟通知和图片／音视频资源失败保留为可展开的运行诊断，不卸载文档或撤回 SDK；真正的异常、脚本／样式及 SDK 安装失败仍沿原失败通道处理。`document-errors.test.js` 覆盖原生／兼容文档在就绪前后的分类及同文案作者异常，`native-project-frame.test.jsx` 检查两类正式项目组件的文档身份、释放、诊断去重、兼容操作失败与初始化失败的区别，以及插槽失败不撤回正常 root、root 失败仍回退默认界面；`native-script-ui.test.jsx` 检查脚本面板保留诊断。`native-project-layout.test.js` 在普通及影子根容器中触发真实浏览器通知和损坏图片，核对页面继续运行与原尺寸布局。这些合成浏览器检查不替代安卓真机验收。

资产库的混合文件夹由 `character-asset-folders.test.ts` 覆盖层级、跨角色拒绝、循环、稳定引用、递归删除恢复及目标文件夹已删除的导入；`character-assets.test.ts` 在 JSON／ZIP／PNG、角色复制与独立前端 ZIP 中保留层级和空文件夹。`character-asset-resources.test.ts` 通过实际 Cordis Gateway 调用新建、移动和改名后继续核对原 Range／引用资源。网页组件回归覆盖混合筛选、新建、移动、进入、当前目录导入、复制引用与原失败重试；正式组件合成浏览器的列表列轴、深浅层次与手机布局记录在 `build/asset-folders-check/`，不替代 Android 真机或真实数据验收。

每次 PC 发布操作前必须先读 [Windows 发布必读](WINDOWS_RELEASE.md)。GitHub 的 `release` 任务先完成安装包生成及发布，独立 `update_ui_check` 随后检查更新界面，`functional_check` 运行完整回归；发布任务不依赖功能／UI 检查结果。测试失败按独立检查报告和修复，不得延迟出包或仅因测试脚本修改重新打包。

Windows 打包与功能回归分别执行。全量功能、UI、编辑器及原生作者客户端交互回归不作为发布打包的前置，不因测试文件、旧断言或探针定位阻塞正常打包；相关测试按实际修改独立运行；每次发布准备好构建输入后先触发云端出包，功能回归在出包发布后由 GitHub 独立任务运行，结果单独记录，不等待旧测试修复后才打包。实际发布工作树仍完成锁定依赖安装与完整源码构建。`pnpm check:electron-dsh` 检查实际 Electron Host、原生存储、Session 重开与回退运行；编辑器及脚本按钮交互独立使用 `pnpm check:electron-native-author`。测试与探针源码不进入安装包；打包保留 SQLite ABI、包内运行资源及安装启动检查；更新 UI 交互在出包后的独立任务中检查。

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

`deepseek-web-profile.test.js` 另在正式 desktop／android 两种组合中分别关闭工作区、任务、协作、联网、插件发现、创作能力以及全部工具组，检查保存及冷重开、工作室列表、新建和实际合成模型请求中的权限；工具不会被强制开启。预设配置无效的冷启动场景须仍能列出已有会话，新建／打开返回具体配置错误，并在修正后原进程恢复。Android 渲染进程退出后的重试改动另核对两种原生变体编译、原平台传输／启动／输入导航回归及浏览器官方失效对象合同；这些检查不能替代真机终止渲染进程、重建页面及后台 Host 存活验收。

同一正式 profile 回归另同时放入完整旧工作室会话、创建中断而缺少工作室标记的旧会话，以及无效旧生成文件。完整会话继续转换并保留原工作室状态，失败会话及所引用的旧文件原样保留，工作室列表服务仍可调用；普通打开缺少标记的会话继续返回明确错误，不为通过测试补写状态。发布版本升级探针必须包括相应发布标签的受管补丁，未应用补丁的官方依赖结果不能当成 ElecKoi 已发布版本的行为。

诊断接入由 `host-diagnostics.test.ts` 覆盖官方 Logger 启动缓冲、真实插件异常、产品普通失败对象、深层原因、聚合异常、长 Unicode、清洗、卸载与写入失败，以及 1200 次记录后的固定缓冲；覆盖后必须标出缺口。正式两种 profile 中注入 Remote 原始异常，检查直接调用、RPC 折叠及流错误转换前的 stderr，同时保持返回合同。`android-bug-report.test.jsx` 与共用报告／表单检查保留原生错误详情、容量内运行诊断、清洗及关闭日志的选择。原生 `HostRunDiagnosticsTest`／`RuntimeDiagnosticsTest` 继续核对双流、重试重开与容量。补充隔离探针从实际 Host Logger 输出，经原生分段持久化、重开与导出，再进入正式报告拼装及正文，验证原始原因、堆栈和长行末尾；只看错误码或错误条不能证明这条链完整。

同一诊断文件使用真实子进程和官方 `installFailLoud`，分别制造未处理拒绝及未捕获异常，核对十层原因的根异常在官方退出前进入 stderr、退出码仍为 1。该检查不在测试进程触发未处理拒绝，也不另做退出策略。

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
