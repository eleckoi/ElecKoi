# ADR 0040：ElecKoi 失败契约

## 状态

已实施，2026-10-18。契约代码在 `packages/shared/src/contracts/errors/` 与 `packages/shared/src/foundation/`；闸是 `scripts/check-error-contract.mjs`；规则 4 已归零，四条规则都是绝对值。接口细节、码表与参数表读[错误契约文档](../error-contract.md)；维护者与贡献者的写法要求读[错误处理协作声明](../error-handling.md)。

## 背景

[ADR 0017](0017-dsh-remote-replaces-desktop-gateway.md) 用 DSH Remote 取代 Desktop Gateway 时，业务通道上的失败语义一并丢失：码与详情被压成一句 message，调用方拿不到可判别的失败。本轮在 0.2.13 基线上把契约重新安家：一套失败形态、六条边界、一个文案解析点、一个折叠出口、一张机器闸与一份生成文档。这份记录只写判据与取舍；码表、详情形状与用户句以生成文档为准。

## 决定

1. **一套失败形态、一个折叠出口。** 全仓只有一套失败形态：`name === 'DesktopError'` 的对象，或同形的普通对象（`isDSHRemoteError` + `code` + `message` + `details`）；每条边界只做一层薄适配器，未知失败统一交给 `foldFailure` 折叠。不新造第二套类型或失败方言，不引入运行时错误服务（上报已有 logger 这个出口），也不得重建业务通道（ADR 0017 决定 7）。

2. **六条边界闭集。** ① 领域内抛出（`packages/host/product-data`）② 宿主 Remote 出口 ③ 宿主↔DSH 子进程协议 ④ DSH 运行时插件失败出口（`apps/desktop/resources/dsh/`）⑤ 主进程↔渲染层（Electron IPC）⑥ 渲染层（`apps/web` 与客户端 bundle）。⑦ 观测纳入，只要求「任何边界都能产出同一个可记录对象」；⑧ 测试与闸纳入；⑨ Android 只保证契约可被实现，不写实现、不建机制；⑩ 第三方插件内部排除。锁定的官方更新源码 `apps/desktop/src/main/modules/updates/dsh/` 保持原实现，由来源清单与摘要检查约束，产品失败规则只作用于外层产品适配。**每条边界只声明不实现，不算完成。**

3. **公开面分层。** 跨边界必须稳定的部分（码表、详情形状、边界映射规则）作为正式合同，经 `@eleckoi/product-shared` 的导出面提供；便利函数、界面呈现与日志格式留在内部，不承诺兼容。纯类型包没有 bundle 身份，因此契约不进 `docs/plugins/api-reference.md` 的生成参考。

4. **文案归属。** 契约给 code + 参数化 details + **开发者诊断文案**；**用户可见文案只有一个解析点（渲染层 `apps/web/src/utils/failureText.js`）**，宿主、领域与运行时插件永不拼用户可见句子。这是仓库「用户文案就地写中文」惯例的明确例外。

5. **失败过边界沿用 `isDSHRemoteError` 标记。** DSH 网关的折叠函数只认带 `isDSHRemoteError === true` 的对象，其余抛出会被换成 `gateway/internal` 并丢掉 details。所以产品失败自己就是合法载体：[DesktopError](../../packages/shared/src/foundation/DesktopError.ts) 与 `productFailure` 产出的对象都带这个标记；边界⑤ 的失败对象（[ipc.ts](../../packages/shared/src/contracts/errors/ipc.ts) 的 `DesktopIpcFailure`）也复用同一标记。全仓只有一种失败方言。代价（DSH 代码会把产品失败当 `RemoteError`，契约码不在协议封闭枚举里）故意接受；哪天 DSH 收紧校验，只改 `ipc.ts` 与 [failure.ts](../../packages/shared/src/foundation/failure.ts) 的识别规则。

6. **折叠按形状，不按 `instanceof`。** `foldFailure` 的识别顺序：① `name === 'DesktopError'` 且有 string `code` 的产品失败形状 → 契约码与详情原样保留，legacy 码走防御映射；② `isDSHRemoteError === true` 且有 string `code` 的失败 → 契约码原样保留，网关合同违例载体码折成 `contract/invalid-*`，码表外的码不猜、折兜底并把原码记进 `details.what`；③ 其余一律折兜底码并保留 `message`。`dsh-product-data` 由 tsdown 内联了契约包，跨 bundle 副本的原型不同，`instanceof` 必为假、会把码与详情整条丢掉；全仓不许在任何边界上回退 `instanceof`。

7. **词表形态与落点。** 码形态 `eleckoi/<域>/<原因>`（全小写 ASCII、连字符分词），唯一例外是兜底码 `eleckoi/internal`（只有两段，`details.what` 记被折掉的原码）；**通用码只做兜底**，不猜语义。纯枚举（[码表](../../packages/shared/src/contracts/errors/codes.ts)、[详情形状](../../packages/shared/src/contracts/errors/details.ts)、[边界表](../../packages/shared/src/contracts/errors/boundaries.ts)）住 `packages/shared/src/contracts/errors/`；`RemoteErrorDetailsMap` 的声明合并与构造住 `packages/host/product-api/`。

8. **失败表达形态。** 领域与桌面宿主抛 `DesktopError(码, 原中文诊断, 参数化详情)`；`product-api` 的 host 面与客户端 bundle 抛 `productFailure(码, 诊断, 详情)` 产出的普通对象（能过 IPC 与 Remote 信封）；客户端拆 Remote 信封时 `throw result.error` 本身，保留官方失败实例、不重新包成裸 `Error`。`product-api` 的 host 面是 tsc 直出、运行时取不到契约包，所以码常量用生成物 `errorCodes.generated.ts`，并受测钉住与码表逐字相等。**新代码不许再抛 legacy 6 码。**

9. **文案与诊断文案分离。** `message` 是开发者诊断：保留原始中文句，可带 id 与路径，进日志。用户可见文案由渲染层按码给；码表长大不改变已有文案；未知码落通用句、原码留在 details 里。

10. **子进程协议。** `fatal` 帧从 `{ message }` 增量扩为 `{ code?, message, details?, stack? }`（见[子进程协议](../../apps/desktop-host/src/hostSessionProtocol.ts)）。字段全可选，接收端按可选字段解析，所以**不升 `protocolVersion`**（帧上也没有版本字段）。`logPath` 不是子进程帧字段：宿主收到 fatal 帧后自己记录本机日志路径；诊断用 `stack` 承载，不把整段日志塞进消息。

11. **机器闸，规则 4 是绝对值。** [闸](../../scripts/check-error-contract.mjs)独立成册（不并进 `check:architecture`），只看代码位置（字符串与注释里的同样文本不算）。四条规则：禁止丢码、契约违例必须带结构完整的 `issues`、空 catch 必须写成三个具名声明之一或非空处理体、不许裸抛。规则 1–3 是绝对值；规则 4 在裸抛归零后也改成绝对值——`--progress-only` 只给未来的迁移线路临时看数，CI 与门禁不带它。

12. **两条呈现通道，严重度只上调。** `inline`（功能内：就地失败面，窗口留着，给重试）与 `app`（应用级：对话框或窗口级提示）。默认通道由码给；调用点只能用 `upgradeTo: "app"` 上调，解析函数的参数里没有下调方向——「严重度是场景的属性，不是失败的属性」，所以只能上调是结构保证，不是约定。

13. **not-found 按域拆码。** `eleckoi/character/not-found`、`eleckoi/creator-project/not-found`、`eleckoi/agent-preset/not-found`。这是形状压过严格必要性的一处：三条码的恢复动作不同（回角色列表 / 刷新项目列表 / 重选预设）；加码是纯增量，改名才是破坏性变更。

14. **码表与详情参数表。** 首批 13 条码推导自旧基线 19 处 `throw new DesktopError` 的真实语义与两个红案例点名的消费点；0.2.13 上按 903 处中文抛出清点扩到 30 条（13 条只盖得住约六成）。每条码在 `ELECKOI_FAILURE_DETAIL_PARAMS` 里必须有一行（漏一条就编译不过）；详情参数名是闭集 `field` / `issues` / `path` / `operation` / `guard` / `what` / `expected` / `actual` / `upstreamDetails`（决定 16 增补）；`contract/invalid-request` 与 `contract/invalid-response` 的详情必须是元素带 `path` 与 `message` 的非空数组。码表只收产品失败：`AuthorApiError`（作者脚本 API 的方言）与 legacy 6 码不并入，后者保留为防御映射。

15. **码表是内部枚举，文档是生成产物。** [契约文档](../error-contract.md)由 `generate:error-contract-doc` 从 [码表](../../packages/shared/src/contracts/errors/codes.ts)、[详情表](../../packages/shared/src/contracts/errors/details.ts) 与渲染层文案表生成；手改产物会被 `check:error-contract-doc` 拒绝。客户端 bundle 的码表由 `generate:error-codes` 从码表生成。码表**不做公开契约**：不承诺第三方插件或 Android 按 `code` 实现（本轮实测生产代码里按 `eleckoi/*` 分支的地方是 0 处）；对外表态要单独决定。

16. **折叠不丢上游诊断。**（2026-11-10 追加）未知的产品或 Remote 载体码仍折成 `eleckoi/internal`，`details.what` 继续记录原码；新增参数 `upstreamDetails`，只在载体有非空详情时保留原始 JSON 对象。`message` 保留原文，经渲染解析后在功能内错误条和窗口错误弹窗中直接可见、可选中复制；不把原文翻译成另一种技术含义，也不猜未知码的恢复策略。报告沿现有共享清洗出口处理诊断，不能只带折叠后的码而丢掉上下文。

## 与已有记录的关系

- ADR 0017 决定 7：壳保留的 IPC 必须独立、最小，不得重新形成第二套业务网关。本契约骑在官方 Remote 与既有最小 IPC 上，不新建通道。
- ADR 0028：共享层只放合同与纯逻辑；契约必须语言中立，Android 能各自实现。
- ADR 0023：插件接口参考由官方生成器维护。契约不是插件接口，不进那份生成参考（见决定 3）。

## 后果

- 宿主、领域与运行时插件只写开发者诊断；用户句只在渲染层产生。同一失败在不同窗口只有一种说法。
- 码表是内部枚举：加码自由，改名要一次全局替换；不承诺第三方或 Android 按码实现。
- 改契约的顺序：先改 `codes.ts` / `details.ts`，再重生成文档与客户端码表；`check:error-contract`、`check:error-contract-doc`、`check:error-codes` 会拒绝过期产物。
- legacy 6 码与 `AuthorApiError` 不并进码表：前者保留为防御映射（清掉它们不在本轮范围），后者到边界折兜底并保留 message。
- 本轮不做：按失败原因决定恢复策略、给第三方插件提供码表实现承诺、删掉 legacy 6 码。
