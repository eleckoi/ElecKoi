## Desktop Change（桌面端改动）

### What changed（改了什么）

<!-- 用中文或 English（中文）说明用户可见变化和底层变化。 -->

### Architecture route（架构归属）

- [ ] Main 新文件仅承担桌面壳职责，位于 `host / modules / platform / i18n`
- [ ] Shared 新文件位于闭合集合：`contracts / foundation`
- [ ] 产品跨 Host/Client 查询与命令使用生成的 Typert Remote；会话事件、分页与 projection 使用 DSH Connection 正式协议，未新增业务 IPC 或私有桥
- [ ] Renderer 未直接访问 Electron、Node、SQLite 或 DSH SDK
- [ ] 官方运行时装配隔离在 `@eleckoi/dsh-runtime`；Host/Client 插件使用同版本公开合同，上游包仍是同一个精确版本批次
- [ ] 新业务进入 DSH Host/Client 插件；产品数据库与 Repository 由 `@eleckoi/dsh-product-data` 独占，跨模块依赖只使用对方 `index.ts` 公开面
- [ ] 长生命周期资源已注册为 Host/Cordis Plugin，并能反向释放
- [ ] 新增失败带契约码、用户可见文案只在渲染层产生（见 `docs/error-handling.md`，`pnpm check:error-contract`）

### Data and compatibility（数据与兼容）

- [ ] Schema 改动附带新的向前迁移，没有重写已发布迁移
- [ ] 改了 `CURRENT_SCHEMA_VERSION` 就同时提升了应用版本号（同一版本号不能对应两份 schema）
- [ ] 没有把会话、消息、角色或模型配置写入 localStorage
- [ ] 旧数据、取消、失败或异常退出路径已考虑

### Verification（验证）

- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] DSH 改动已通过 `pnpm check:electron-dsh`；发布前已完成本地发布链验证，安装包及打包产物校验仅由 GitHub Release 工作流执行
- [ ] 没有启动 Android、Docker、QEMU 或 ARM64 DSH 核心编译
- [ ] UI 未定稿阶段没有借底层改造擅自改变 JSX/CSS 视觉

### Review scope（审查范围）

<!-- 列出需要审查的明确路径；不要混入 Android、私有知识库、截图或构建产物。 -->
