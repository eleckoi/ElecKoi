# Windows 发布必读

每次处理 PC 打包、出包、Release、重新打包或跟进云端构建，必须先读本文件，再执行命令。开发和公开工作树均适用。

## 固定顺序

1. 准备实际发布源码及必要构建输入，按既有要求完成依赖、源码编译和运行资源检查。
   跨端依赖可以同时安装，但入包必须按目标系统／CPU 筛选；内含多平台 prebuild 的包还须按其正式加载路径保留目标目录。`verify:packaged-dsh` 检查实际 ASAR 的所有依赖声明、原生二进制与编译残留，报告保存在 `build/windows-package-content.json`。不能通过删除必要的 Windows 功能、许可证或 WebAssembly 资源来缩包。
2. 先启动 GitHub Windows 打包，跟进安装包生成及发布。
3. 出包后，让 GitHub 的独立检查任务运行功能、UI 或所需回归，读取失败日志并修复。

测试文件、旧断言和交互探针不进入安装包。它们的失败不能成为等待打包、停止打包或反复重打包的理由；不得先修这些测试再让用户等包。确认是正式运行代码缺陷时，按实际产品影响处理，不把测试误判说成安装包故障。

## 工作流必须保留的边界

- `.github/workflows/release-windows.yml` 的 `release` 任务负责构建、包内资源、安装启动及发布。
- 不入包的更新 UI 探针在独立 `update_ui_check` 任务中运行；它依赖 `release`，所以发布先完成，检查随后开始。
- 完整回归在独立 `functional_check` 任务中运行，同样依赖 `release` 且不阻塞发布。
- `release` 不得依赖任何功能或 UI 测试任务，也不得把此类探针重新放回发布步骤。
- 独立检查失败时，GitHub 任务须显示失败，日志和摘要须保留原因。安装包在检查开始前已发布。
- 已发布的包不因测试脚本修正而重新打包。正式代码发生必要修正后，才按用户授权重新出包。

## 执行前必须确认

- 本次工作是出包，还是修代码／测试；用户叫停上传或打包后，不得自行重启。
- 用实际发布工作树的源码和构建结果，不拿另一工作树的结果代替。
- 本地只编译和检查源码；Windows 安装包由 GitHub Release 工作流生成。
- 报告分别说明“安装包状态”和“独立测试状态”，不能把测试失败笼统说成打包失败。

详细测试范围见 [测试说明](TESTING.md)。

目标平台筛选沿 electron-builder 的[官方实现](https://github.com/electron-userland/electron-builder/blob/cecf43a601fe4a3c769398fdc7bc278c57292515/packages/app-builder-lib/src/node-module-collector/nodeModulesCollector.ts)及[架构约束语义](https://github.com/electron-userland/electron-builder/blob/cecf43a601fe4a3c769398fdc7bc278c57292515/packages/app-builder-lib/src/util/archCompatibility.ts)回补到当前锁定版本；退役条件登记在 `pnpm-workspace.yaml`，升级构建器时核对后移除对应补丁。
