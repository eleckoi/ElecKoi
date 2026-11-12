# ADR 0043：编辑器的插件配置入口唤起主窗口

## 状态

已采纳，2026-11-12。范围仅为桌面窗口导航，沿用 ADR 0017 第七项的最小壳能力边界。

## 背景与依据

用户要求独立预设编辑器的「前往官方插件配置」打开主窗口的网页搜索配置，编辑器保留当前工具详情。当前每个渲染器各有官方 layout 和插件导航 store；在子窗口调用 selectPanel 只更新子窗口，不能激活主窗口。受管 child 通过 Main 创建，window.open 被拒绝后由 ElectronWindowHost 接管，没有可供子窗口控制的浏览器 opener。

核对锁定 DSH 0.2.2-rc.1、提交 66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db 的 Desktop main.ts、ipc.ts、preload-app.ts：原生窗口显示／恢复／聚焦由 Main 负责，公开 preload 没有跨窗口的插件导航能力；官方插件导航仍属于 Client layout、configLedger 与 navigation store。Host Remote 不持有本机 BrowserWindow 或另一渲染器的导航状态。

## 决定

1. 增加受限桌面导航能力，只接受 web-search、subagent 两个明确配置入口。Main 验证受管顶层调用者，复用既有主窗口显示、恢复与聚焦，向主窗口发送入口身份，不传 URL、配置内容、凭据或可执行代码。
2. 只有主窗口订阅请求，沿原 Client 插件选择事件、官方 configLedger、installed 页签及 setView 打开配置。独立编辑区不挂载插件页面，不保存、丢弃或重建编辑草稿。
3. 主窗口回执按请求身份及精确 WebContents／mainFrame 配对；未就绪、关闭、异常和超时都返回既有失败契约，原入口显示错误并允许重试。请求仅在 Main 内存中短暂存在，完成、关闭和卸载均释放。
4. 此处是原生焦点和窗口消息的产品例外，不是业务 Remote、产品数据 IPC 或通用跨窗调用。插件设置读写继续沿官方 Remote，不增加数据库、缓存或数据迁移。

## 退役条件与验证

官方 Desktop 提供受管跨窗激活及插件入口导航，并覆盖子窗口、错误回执和离开保护时，整体替换本例外的 Main 安装器、preload 能力及合同，保留原官方 Client 配置。相关入口均注明 RETIRE WHEN。

针对性验证覆盖子窗口不选择自己的插件页、主窗口精确配置身份、成功和失败重试、非受管及子 frame 拒绝、回执隔离、主窗口关闭与超时清理。界面用 DOM 验证，不截图。
