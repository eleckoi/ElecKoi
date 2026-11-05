# Android 本地 Node 运行时

正常启动由 APK 原生目录内的 `libeleckoi_node.so` 启动器，通过 Android 适配的 glibc 加载现有 ARM64 Node。共享业务包及官方子进程提供方保持原有实现；运行时装配只在 Android 的原生壳和资源构建链中进行。

`glibc-lock.json` 固定 glibc 2.44 的已发布包、ELF 哈希、前缀替换数量和许可证。`auditedSourceCommit` 是审阅的 `termux-pacman/glibc-packages` 源码快照，不声明预编译包的完整构建 provenance。`native-build-lock.json` 单独固定平台辅助程序使用的 NDK 与 Android API。

运行 `python scripts/android-runtime/prepare-glibc-probe.py --production --ndk <固定版本 NDK 目录>` 生成启动器、加载器、库和执行适配层；也可通过 `ANDROID_HOME` 或 `ANDROID_NDK_HOME` 定位锁定的 NDK。构建只编译小型平台辅助程序，不编译 DSH 或 ARM64 业务依赖。`prepare-assets.mjs` 执行该步骤，将校验后的库放入 rootfs 归档、初始化脚本放入 Host 归档。APK 包含对应许可证、源码记录和产物哈希。

启动器为 glibc 保持目录描述符 63。glibc 内固定前缀以等长路径替换为 `/proc/self/fd/63`，重复斜线保持 ELF 字符串偏移。glibc 的解析文件链接到 Android 当前网络配置；网络切换时原子更新该配置。Node 初始化脚本设置可重启的 `process.execPath`。

`glibc-exec.c` 通过加载器的 `--preload` 参数装载，不修改 DSH 或 Node 的 JavaScript 子进程实现。它按显式 rootfs 解析 Linux 系统可执行路径，处理 ELF 和 Linux shebang，保留原 PID、参数、业务环境、标准流与控制描述符；Android 加载器自己的环境配置始终由父进程保留。Node 子进程重复同一启动流程，其他 Linux 子进程经同一 glibc 加载器执行。脚本递归返回 `ELOOP`，缺失、权限及格式错误保持明确错误。适配范围不包含完整 chroot 或整个 Linux 发行版的文件系统模拟。

产品数据、Session、媒体、home 与 workspace 始终位于同一组应用持久目录。安装预算与健康检查后的旧安装清理继续由 `RuntimeInstaller` 管理，数据目录不属于清理范围。实际启动、DNS/HTTPS、SQLite、子进程输出与错误、空环境 Node 子进程、控制描述符、取消进程树及终端空闲/忙碌、前台信号、关闭均通过实际应用进程验证。

Android 沙箱拒绝 JSONL Session 的硬链接发布。`session-publication-lock.json` 固定当前 DSH 0.2.1-rc.5 的官方包版本、原文件哈希和两处独占发布调用；仅在 Android 归档中改为 `android-file-publication.mjs` 调用原生 `renameat2(RENAME_NOREPLACE)`。临时文件同步、目标碰撞拒绝、目录同步、失败传播和事件格式沿用官方流程。归档校验核对补丁与辅助模块的完整字节，工作区共享包和桌面产物不应用该补丁。当前 `worker.cjs` 的入口只校验文件，保持官方字节。附件适配的版本、来源与同批 DSH 一致，文件原摘要及既有替换调用未变。行为依据见 [锁定 JSONL 实现](https://github.com/deepseek-ai/deepseek-harness/blob/b830ec950faba0a46dda564be3e2d854afed94f1/packages/session/session-persistence-jsonl/src/index.ts) 与 [Linux renameat2 合同](https://man7.org/linux/man-pages/man2/rename.2.html)。

RETIRE WHEN: 锁定 DSH 的 JSONL 与附件实现已通过 Android 应用沙箱中的独占发布、目标冲突、失败恢复和持久化验收，且不再需要硬链接替换及应用目录边界适配时，删除对应版本锁与归档替换；只有两者均不再引用后才删除共用的 `android-file-publication.mjs` 和原生发布入口。此适配不迁移用户数据库或会话格式。

## Debug 诊断

不带 `--production` 的准备命令生成原始 Ubuntu/Android 加载器和 `glibc-probe.c` 诊断器；不会替换正常启动的配置。诊断也直接调用加载器。运行包只保留 Node 启动器和 Android glibc 加载器，不打包 PRoot 及其专用依赖；运行时与 APK 校验器拒绝未声明的原生文件。

受 `android.permission.DUMP` 保护的 `.GlibcProbeReceiver` 只运行有界的独立诊断子进程。`androidGlibc=true` 选择 Android 库，`portable=true` 选择可重定位路径，`compatibility=true` 执行临时目录中的探针，`host=true` 使用独立临时数据库和 home 启动完整 Host，再完成健康检查与关闭。探针结果只覆盖固定临时文件。

普通 Ubuntu glibc 在实际应用沙箱中首先因 `set_robust_list` 收到 `SIGSYS`；`adb run-as` 使用不同的执行域，不能代替应用进程验证。诊断器令被拒绝调用继续执行时观察到的后续调用，只用于解释适配需要，不能冒充原始失败现场。
