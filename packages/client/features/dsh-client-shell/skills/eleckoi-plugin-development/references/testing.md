<!-- Generated from docs/plugins/testing.md; run pnpm generate:plugin-docs. -->

# 测试与验收

## 最小安装探针

验证一个本地插件包：

```powershell
node scripts/probe-dsh-desktop-plugin-install.mjs D:\path\to\plugin
```

不传路径时，脚本在系统临时目录生成合成插件并验证完整生命周期。探针应覆盖：

1. 安装 bundle；
2. 读取本地化元数据；
3. Host 与 Client 入口装载；
4. 重启后恢复；
5. 停用后注册消失；
6. 重新启用；
7. 卸载并清理临时包。

## ElecKoi 内置 bundle 校验

```powershell
node scripts/probe-eleckoi-built-in-bundles.mjs
pnpm check:dsh-runtime
pnpm check:plugin-docs
```

- 内置 bundle 探针验证桌面 profile 中全部 bundle 能被 Host 解析和装配。
- DSH runtime 检查验证锁定版本、依赖、patch、生产包清单和接口 manifest。
- 插件文档检查核对 manifest、公开源码成员、JSDoc、完整参考和官方 Inspect 目录；类型检查通过第三方公开 exports 编译调用，并验证错误参数会被拒绝。
- Inspect 用例实际运行锁定版本的 Host 和 Client 注册表，验证跨端查询、取消、迟到依赖和卸载清理。

## 源码日常检查

```powershell
pnpm test
pnpm build
```

`pnpm build` 只编译和校验源码，不生成安装包。仓库规则禁止在本地执行 `electron-builder`、`pnpm build:win` 或 `pnpm build:unpack`；Windows 安装包由 GitHub Release 工作流生成。

## 插件专项用例

### 生命周期

- 缺少必需 service 时插件等待，不抢跑。
- service 就绪后只启动一次。
- 停用、HMR 和卸载会撤销所有注册与监听。
- 重复 disposer 不破坏其他插件的注册。

### UI Slot

- slot 不存在或 owner 不匹配时插件不接管界面。
- chain `select` 返回 `null` 时 fallback 保持可用。
- list 顺序由注册 options 决定，不依赖 DOM 顺序。
- session slot 切换 Session 后不泄漏上一 Session 状态。
- 窄窗口、滚动、键盘与屏幕阅读器路径可用。

### Service 与 Remote

- 订阅返回可调用的 unsubscribe。
- 异步方法的成功、错误、取消和并发行为都有断言。
- Client 不接触 Node、Electron、SQLite 或私有桥。
- Host 写操作经过权威 owner，并保留原子性与数据校验。
- 模型发现使用本地合成 HTTP 服务验证当前草稿的地址、请求头与凭据；参数测试检查官方序列化器实际发送的请求体。页面验证读取、选中、编辑、保存重开及迟到响应，不用只比较配置对象的测试代替实际请求检查。

### 数据与隐私

- Session 扩展记录必须经过真实磁盘保存、关闭句柄、使用新 backend 重新打开和投影重放；仅内存 append 测试不能证明持久化合同正确。外部信息性事件携带 `ignorable: true`，其他未知必需事件仍应拒绝读取。
- 测试只使用仓库内合成 fixture 或临时目录生成的数据。
- 不从用户目录、环境可选文件或真实数据库加载样本。
- 测试日志不包含密钥、绝对用户路径或可识别角色资料。

## 发布前验收

插件作者至少确认：

- [ ] `engines.dsh` 与目标 ElecKoi 锁定版本一致。
- [ ] Host/Client 依赖全部通过 `inject` 表达。
- [ ] 所有副作用可随 Cordis fiber 撤销。
- [ ] 只使用公开 exports、Slots、service、Remote 或 contribution 合同。
- [ ] manifest 只声明真实存在的开发接口。
- [ ] 中英文插件元数据齐全。
- [ ] 安装、重启、停用、启用和卸载均通过。
- [ ] 插件停用后 ElecKoi 默认界面和产品数据保持可用。
- [ ] `pnpm test` 与 `pnpm build` 通过。
