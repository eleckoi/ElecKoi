# Android 开发入口

本工程提供 Android 原生壳及移动界面。标准版使用系统 WebView，兼容版随包内置 GeckoView，两版装载同一锁定版本的 DSH Web Client，复用当前产品业务合同。

## 所有权

- `apps/android`：浏览器接入、前台服务、本地运行时生命周期、系统文件选择与导出、TTS、通知和本地媒体协议的 Android 载体。`src/main` 共用平台操作，`src/standard` 与 `src/compat` 分别映射内核 API；不复制前端或 Host 业务代码。
- `apps/android-host`：独立 Node 组合根，装配同一锁定版本的 DSH Web profile 与当前产品 Host/Client bundle。
- `packages/host` 与 `packages/client/features`：现有产品合同、业务与持久化。共享 Client 页面的资源地址改为使用 Host 注入的真实来源；产品业务与数据实现保持原状。
- `packages/client/mobile` 与 `apps/web/src/mobile`：移动窗口、官方侧边抽屉、独立详情导航及窄屏呈现。
- `native/android-runtime`：有固定来源及哈希的 Android glibc 启动与执行适配层。
- `scripts/android-runtime`：离线资产准备、校验与 Host 探测。

Android 使用 `noBackupFilesDir/unified-runtime` 内的独立数据库、Session、home、媒体和 workspace，安装内容按清单身份放在 `installations`。旧 Room 数据不参与启动或导入。数据由当前 `dsh-product-data` 管理；PC 数据目录和桌面启动入口不变。

平台 facade 为真实 Android 页面补充 `interactive-widget=resizes-content`，保留已有 viewport 的其他选项；原生容器继续处理系统栏和键盘 insets。兼容版文件选择通过 ContentResolver 读取授权的 `content://` 流，保留文件显示名称并暂存到浏览器私有缓存，浏览器关闭后清理；标准版继续将授权 URI 交给 WebView。兼容版由内置扩展显式标记 `data-eleckoi-browser=compat`，移动样式让官方 TextShimmer 文字层固定，只移动遮罩，避免 Gecko 双重变换绘制造成重影；标准版保留官方动画。

两版的 HTML 下拉选择共用 `NativeChoiceDialog` 原生列表、取消按钮及页面明确传入的明暗主题。兼容版通过 `PromptDelegate.onChoicePrompt` 传入 Gecko 正式选项 ID，并遵守其更新与撤销回调；未实现此回调时 GeckoView 会直接取消请求。标准版在受管页面中将选择操作交给原生列表，以每个实际 `option` 元素的稳定 ID 回传选择，保留禁用项、分组和多选；确认后只在实际选中项变化时产生网页 `input/change` 事件，取消与返回不改变选择。选项更新和控件移除按当前 DOM 处理。这是 Android 浏览器界面的接入，不承担 Host 业务调用，也不更换标准版的系统 WebView。

## 准备与构建

本机需要锁定工作区依赖、Python 3、Java 17 和 Android SDK 37.2；应用 targetSdk 仍为 35。Gradle Wrapper 已固定版本。兼容版依赖锁定在 `geckoview.lock.json`：Mozilla stable ARM64 AAR `158.0.20261007201254`，构建前核对完整 SHA-256，打包后逐项核对原生库摘要。标准包不包含该内核。

```powershell
pnpm prepare:android-runtime
& apps/android/gradlew.bat -p apps/android :app:clean :app:assembleStandardDebug :app:assembleCompatDebug --console=plain --no-daemon '-PunifiedRuntimeAssetsDir=../../build/android-runtime/assets'
python scripts/android-runtime/check-apk.py apps/android/app/build/outputs/apk/standard/debug/app-standard-debug.apk --variant standard
```

APK 分别位于 `app/build/outputs/apk/standard/debug/` 和 `app/build/outputs/apk/compat/debug/`。两版 Debug 包名均为 `com.eleckoi.app.dev`，名称「ElecKoi 开发版」，与正式应用并排安装，数据库、Session 与资源目录隔离。两版 Release 包名保持 `com.eleckoi.app`，共用正式签名及版本链，切换内核时覆盖安装保留数据。Activity 类名固定为 `com.eleckoi.app.MainActivity`。启动图标使用当前 PC 的 `apps/desktop/resources/icons/eleckoi-app-icon.png`；校验器检查图像文件一致性。

修改大体积离线资产后先清理 Android 应用构建输出，防止增量 APK 留下失效的 ZIP 数据块；各变体 assemble 自动校验实际 APK，Release 通过后才生成更新描述，Debug 不生成正式更新描述，校验器拒绝有效条目外超过 1 MiB 的包。校验需要 Python 3、Pillow，以及通过 `ANDROID_HOME`、`ANDROID_SDK_ROOT` 或 PATH 提供的 AAPT2。手机首次准备新运行时前检查解压峰值空间，只有新 Host 完成健康和页面握手后才清理旧安装目录；数据库、Session、home、媒体与 workspace 不参与清理。

生产依赖快照在替换前检查工作区包声明的运行入口，缺少编译文件时直接失败并保留上一份快照。资源归档和最终 APK 还会再次检查实际打入的 `main`、`module`、`bin` 与运行时 `exports` 文件，不能用摘要一致代替模块完整性。正式包交付前必须验证手机上的 Host ready、HTTP 页面握手和界面启动；开发包的通过结果不替代正式包。

原生启动遮罩覆盖运行环境准备、Host 启动和 Web Client 实际绘制前的等待。普通启动显示像素鲸鱼娘与加载文字，头像轻微浮动并眨眼；实际 Client 绘制完成后用 440 ms 的小跳和淡出撤掉遮罩，不设置最低等待时长。首次准备新运行时时另显示耗时提示和实际进度，复制显示当前包实际写入的百分比，解压显示包序号与不定进度。已安装资源直接复用。启动失败立即停止动画并显示现有错误与重试入口，应用进入后台时停止循环；系统关闭动画时显示静态头像并直接进入界面。

启动头像位于 `app/src/main/res/drawable-nodpi/whale_girl_pixel_dango.png`。原生 Canvas 只裁去透明画布留白，眨眼覆盖层与浮动由 `StartupMascotView` 绘制，不重新生成角色帧。

资产准备从当前工作区锁文件生成生产依赖闭包，固定并校验 Ubuntu、Node 与 Linux ARM64 SQLite，按锁文件完整性下载平台原生依赖。它只构建 JavaScript 与归档，不在 Windows 执行 ARM64 二进制，也不启动 Docker、WSL 或模拟器。日常 APK 构建直接复用准备好的三份归档。

Android 平台辅助程序使用锁定的 NDK 在 Windows 交叉编译，具体流程见 `native/android-runtime/README.md`；DSH 或 ARM64 业务依赖需要源码编译时才安排原生 ARM64 Runner，没有已验证资产时必须明确失败。当前基础版本和校验和见 `scripts/android-runtime/runtime-base-lock.json`。

`build/android-runtime/assets/runtime/manifest.json` 由脚本生成，声明协议版本、Node 路径、Host 入口及每份归档的 SHA-256 与字节数。Gradle 和手机安装器都拒绝缺失或不匹配的资源。归档用 `.archive` 后缀避免 AAPT2 解压改写 gzip 资产；Ubuntu 硬链接转换为内容相同的普通文件，其余内容、权限、属主和符号链接由校验器逐项核对。

手机安装器通过系统 Toybox `tar --no-same-owner` 解压，以应用身份持有实际文件，不恢复归档中的 root 属主。此参数不改变归档内容、文件执行权限、符号链接或失败检查；归档仍保留原有属主元数据供资产校验。该源码修改已通过两种变体的编译与单元回归，尚待更新安装包后的新旧设备启动验收。

工作区依赖版本变化后，旧闭包不能猜测重用。准备脚本会报告需要重新生成的依赖；删除经过确认的 `build/android-runtime/closure` 构建目录后重新准备即可。运行时目录、下载缓存、编译后的 `jniLibs` 和 APK 不属于版本控制内容；源码、来源锁定及许可证记录保留在仓库。

## 插件启动恢复

Host 或客户端插件启动失败时，原生错误页面提供「停用用户插件并重启」。安卓壳先确认旧 Host 已停止，再由新 Host 在加载插件前调用锁定 DSH 的 `sanitizeProfile`：备份当前 profile 的 `cordis.patch.yml`，启用官方 Web 基础组合和 `ELECKOI_ANDROID_BUNDLES` 中的内置组合，并保留已选中的官方 `OPTIONAL_BUNDLES`。用户安装的包与依赖声明、产品数据库和会话文件保留，恢复后可在插件中心卸载或重新启用插件。Profile 覆写配置保存在备份中，恢复启动时不重放。该入口共用于标准版和兼容版，操作失败会保留错误诊断。

## Release 签名

Release 构建复用环境变量或 Gradle 用户属性中的 `ELECKOI_RELEASE_STORE_FILE`、`ELECKOI_RELEASE_STORE_PASSWORD`、`ELECKOI_RELEASE_KEY_ALIAS`、`ELECKOI_RELEASE_KEY_PASSWORD`。密钥保存在仓库外；缺少参数或密钥文件时构建明确失败，不生成未签名发布包。运行 `:app:assembleStandardRelease :app:assembleCompatRelease` 后，APK 和更新描述分别位于 `app/build/outputs/apk/standard/release/` 与 `app/build/outputs/apk/compat/release/`，该目录由 Git 忽略。

运行 `node scripts/android-runtime/archive-release.mjs` 会核对两版实际 APK 的版本、变体、摘要和更新描述，归档到 `build/releases/android-<版本>-dual/`；文件名分别带 `standard` 和 `compat`。归档时同步更新描述中的 `apkAsset`，不能只改 APK 文件名后直接上传旧描述。该命令不发布到 GitHub。

## 更新检查

更新源为 `https://github.com/eleckoi/ElecKoi`。启动检查成功后间隔至少一小时，后台每天由 Android JobScheduler 在网络可用时检查，关于页支持手动检查。系统可能根据省电状态推迟后台任务。更新通知使用独立的「版本更新」渠道，用户可以在系统通知设置中关闭；相同 versionCode 成功通知后不重复提醒。

Windows-only Release 不触发 Android 更新。标准版按唯一 `android-update.json` 匹配更新，兼容版按唯一 `android-update-compat.json` 匹配更新，描述的 `variant` 必须匹配当前包。发布时带对应描述及其中精确指定的 APK。Release assemble 在 APK 输出目录自动生成描述，从实际 Gradle 输出读取包名、版本与文件名并计算 APK SHA-256；发布时连同 APK 一起上传。格式为：

```json
{
  "schemaVersion": 1,
  "platform": "android",
  "variant": "standard",
  "applicationId": "com.eleckoi.app",
  "versionCode": 10,
  "versionName": "0.2.15",
  "apkAsset": "app-standard-release.apk",
  "sha256": "<实际 APK 的 64 位小写 SHA-256>"
}
```

Debug 不进行正式版本更新检查，手动检查时说明需要安装新开发包。更新描述里的 versionCode 必须与 APK 一致且逐次递增。只发 Android 时不将该 Release 设为 GitHub latest，避免旧 Windows 客户端在该发布中寻找 `latest.yml`。本次只接入检查与下载页入口，不增加发布工作流；公开仓库没有 Android 描述时明确显示暂无已发布更新，不拿 PC 版本号代替。

## 验证边界

```powershell
pnpm rebuild:node
node scripts/android-runtime/probe-host.mjs
pnpm rebuild:electron
pnpm check:android-runtime
```

Host 探测使用临时合成数据和本地合成模型服务，核对认证、当前 Remote、空数据基线、发送、停止、关闭及重启恢复。它只证明独立 Node 入口与共享业务合同，不能证明手机内的 ARM64 运行。

真机连接后还要核对首次安装、手机内 glibc/Node、WebView、发送、停止与重启恢复。手机尚未完成这些检查前，不能宣称 Android 已验收。移动界面采用现有 Android 导航和尺寸，深浅颜色使用 DSH 正式主题；侧边抽屉和对话输入保留官方组件及插件槽位。

真机验收入口如下；多设备连接时必须指定 `--serial`，已有 APK 时可以省略 `--install`：

```powershell
node scripts/android-runtime/probe-device.mjs --adb "$env:ANDROID_SDK_ROOT/platform-tools/adb.exe" --install apps/android/app/build/outputs/apk/standard/debug/app-standard-debug.apk
```

默认探测 `com.eleckoi.app.dev` 标准开发包，使用系统 WebView 调试协议；GeckoView 需独立核对浏览器接入与真实页面。脚本只启动指定 Android 应用、读取其私有运行状态，并经 adb forward 核对认证、Linux ARM64 进程和当前产品 Remote。`--business-probe` 仅允许在聊天列表为空时运行：它建立独立的合成模型与对话，测试发送、取消、应用进程停止后的重启恢复，随后恢复原模型选择并清理自身测试项。测试期间请勿手动修改模型选择。电脑只通过 adb reverse 提供合成模型响应；Node、SQLite、Session 和业务 Host 必须在手机内运行。它不启动电脑 Host、不删除已有数据，也不清空应用。

开发包的选择框交互回归可用 `node scripts/android-runtime/probe-choice-prompts.mjs --serial <设备序列号> --variant standard`，兼容版改为 `--variant compat`。设备需解锁并保持亮屏；脚本使用开发包的本机预览入口加载独立合成页面，不启动产品 Host、不读取或改写聊天与配置。它检查网页选择请求、原生列表、返回的实际值、取消、禁用项、明暗主题、选项更新及页面撤销；结束后关闭开发包并清理自身端口与临时界面文件。结果保存在忽略的 `build/android-runtime/choice-probe/`。`--expect-missing` 用于确认未接入选择回调时的原始缺陷。

结果写在忽略的 `build/android-runtime/device-probe/`。设备缺失、状态不匹配、测试失败或清理失败都明确报错；尚未运行此脚本不能算作真机通过。WebView 的实际显示、触摸操作与启动图标仍须在手机上检查。

实际 APK 可用 `python scripts/android-runtime/check-apk.py apps/android/app/build/outputs/apk/standard/debug/app-standard-debug.apk --variant standard` 检查归档和原生库是否与当前清单一致，以及打包后的图像像素是否仍与 PC 一致；图像检查需要 Pillow。
