/**
 * 每条失败码的**参数化详情**形状。
 *
 * 判据来源：ADR 0040 决定 14（每条码该带哪些参数与参数名闭集）；最初的六个参数名
 * （`field` / `issues` / `path` / `operation` / `guard` / `what`）；2026-10-17 扩表时新增
 * `expected` / `actual` 两个，用来表达「要求什么、实际是什么」（旧数据版本、数据库结构、允许的格式）。
 *
 * 两条硬约束，跨语言实现也要守：
 *
 * 1. **详情是给程序看的，不是拼好的句子。** 契约只放参数，用户可见文案只有一个解析点
 *    （渲染层，ADR 0040 决定 4）。宿主永不拼用户可见句子。
 * 2. **顶层必须是扁平 JSON 对象。** 线上只校验 `z.record(z.string(), z.unknown())`
 *    （`packages/host/dsh-client-connection`），且失败信封要被 `JSON.stringify` 过一遍。
 *    所以详情里不放 `undefined`、函数、`Date`、类实例、循环引用。
 *
 * **`what` 不是标识符。** 多数码写名词短语（会被拼进用户句，如「找不到{what}。」），
 * 两个例外：`state/precondition` 写用户该先做的**动作**（模板是「请先${what}。」），
 * `shell/open-failed` 写闭集**判别值**（`mail` / `form`，由渲染层映射成中文，不拼进句子）；
 * 具体的 id / 路径放开发者诊断 `message` 里，不进详情。
 *
 * 参数名闭集：`field` / `issues` / `path` / `operation` / `guard` / `what` / `expected` / `actual` / `upstreamDetails`。
 * 新参数属于契约变更——先改这份文件与 ADR，再动用例。
 */

import { ELECKOI_FAILURE_CODES, type EleckoiFailureCode } from './codes.js'

/**
 * 一条合同违例。
 *
 * 从 codec（zod 之类）的输出投影而来，只保留能过 JSON 的两项：
 * `path` 是失败字段的路径（点号连接；整个载荷失败时是空字符串），`message` 是 codec 的原文诊断。
 * 不在这里改写文案——codec 说什么就是什么。
 */
export interface EleckoiFailureIssue {
  readonly path: string
  readonly message: string
}

/** 兜底码的详情：`what` 记被折叠掉的原码或短诊断种类。 */
export interface EleckoiInternalDetails {
  readonly what?: string
  /** 未映射上游失败携带的原始 JSON 详情；不猜测其中字段的产品语义。 */
  readonly upstreamDetails?: Readonly<Record<string, unknown>>
}

/** 合同违例（入参或出参）的详情：codec 给出的逐条 issues。 */
export interface EleckoiContractIssueDetails {
  readonly issues: readonly EleckoiFailureIssue[]
}

/** 用户输入不合法的详情：`field` 是出问题的字段名。 */
export interface EleckoiInputInvalidDetails {
  readonly field: string
}

/** 载荷形状不对的详情：`what` 是什么东西的形状不对，`path` 有就带上。 */
export interface EleckoiDataShapeInvalidDetails {
  readonly what: string
  readonly path?: string
}

/** 旧数据不兼容的详情：`what` 是什么数据，`expected` 是当前版本要求的形态（如 `schema v3`）。 */
export interface EleckoiDataLegacyMismatchDetails {
  readonly what: string
  readonly expected?: string
}

/** 不支持的格式 / 版本 / 能力的详情：`what` 是遇到的东西，`expected` 是支持范围。 */
export interface EleckoiInputUnsupportedDetails {
  readonly what: string
  readonly expected?: string
}

/** 找不到东西的详情：`what` 是名词短语（`角色` / `预设分组`），不是 id。 */
export interface EleckoiNotFoundDetails {
  readonly what: string
}

/** 重复或占用的详情：`what` 是什么重复了，`path` 是冲突的目标位置（有就带上）。 */
export interface EleckoiLookupDuplicateDetails {
  readonly what: string
  readonly path?: string
}

/** 同名目录已存在的详情：`path` 是已存在的那个目录。 */
export interface EleckoiCreatorProjectNameTakenDetails {
  readonly path: string
}

/** 乐观并发失配的详情：`what` 是被改过的那种资源（如 `正则规则`）。 */
export interface EleckoiStaleRevisionDetails {
  readonly what: string
}

/** 身份 / 归属 / 状态对不上的详情：`what` 是哪一项对不上。 */
export interface EleckoiStateMismatchDetails {
  readonly what: string
}

/** 前置动作未完成的详情：`what` 是用户该先做的动作（会被拼成「请先${what}。」，如 `打开一个聊天`），不是名词短语。 */
export interface EleckoiStatePreconditionDetails {
  readonly what: string
}

/** 护栏拒绝的详情：`guard` 是拒绝执行的那道护栏（如 `untrusted-sender`）。 */
export interface EleckoiSafetyRefusedDetails {
  readonly guard: string
}

/** 权限 / 边界拒绝的详情：`what` 是被拒绝的事，`guard` 是拒绝的那道校验（有就带上）。 */
export interface EleckoiSecurityDeniedDetails {
  readonly what: string
  readonly guard?: string
}

/** 不可信发送方的详情：`what` 是观察到的发送方身份（frame URL / origin），`guard` 是那条守卫。 */
export interface EleckoiSenderUntrustedDetails {
  readonly what: string
  readonly guard: string
}

/** 服务未就绪的详情：`what` 是还没准备好的那个东西（如 `DSH 会话`）。 */
export interface EleckoiLifecycleNotReadyDetails {
  readonly what: string
}

/** 服务已关闭的详情：`what` 是已经关掉的那个服务。 */
export interface EleckoiLifecycleDisposedDetails {
  readonly what: string
}

/** 插件装载失败的详情：`what` 是哪个插件进程，`path` 是它的入口或日志（有就带上）。 */
export interface EleckoiPluginLoadFailedDetails {
  readonly what: string
  readonly path?: string
}

/** IO 失败的详情：`operation` 是动作（`read` / `write` / `delete` / `spawn` …），`path` 有就带上。 */
export interface EleckoiIoFailedDetails {
  readonly operation: string
  readonly path?: string
}

/** 网络失败的详情：`operation` 是动作（`request` / `download` / `oauth` …），`what` 是目标。 */
export interface EleckoiNetOperationFailedDetails {
  readonly operation: string
  readonly what: string
}

/**
 * `eleckoi/shell/open-failed` 的详情：要打开的是哪一类外部程序。
 *
 * `what` 是**判别值**，不是名词短语：用户句由渲染层按它映射（`mail` → 「邮件客户端」、
 * `form` → 「浏览器」），不会被拼进句子。
 */
export interface EleckoiShellOpenFailedDetails {
  /** `mail` = 邮件客户端，`form` = 浏览器。 */
  readonly what?: 'mail' | 'form'
}

/** 超时的详情：`what` 是等的是什么（名词短语，如 `DSH 插件宿主启动`）。 */
export interface EleckoiTimeoutExpiredDetails {
  readonly what: string
}

/** 存储损坏的详情：`what` 是损坏的东西（如 `创作项目索引`）。 */
export interface EleckoiStorageCorruptDetails {
  readonly what: string
}

/** 数据库结构不符的详情：`what` 是哪一处不符，`expected` 是期望的结构。 */
export interface EleckoiDbSchemaMismatchDetails {
  readonly what: string
  readonly expected?: string
}

/** 模型配置不合法的详情：`field` 是出问题的配置项，`what` 是哪一类配置（如 `DeepSeek 密钥`）。 */
export interface EleckoiModelConfigInvalidDetails {
  readonly field: string
  readonly what: string
}

/** 媒体不合法的详情：`what` 是哪件媒体，`field` 是出问题的字段（有就带上）。 */
export interface EleckoiMediaInvalidDetails {
  readonly what: string
  readonly field?: string
}

/** 客户端调宿主失败的详情：`what` 是这次调用，`operation` 有就带上。 */
export interface EleckoiIpcCallFailedDetails {
  readonly what: string
  readonly operation?: string
}

/**
 * 码 → 详情形状。这是 `RemoteErrorDetailsMap` 声明合并的真相来源
 * （ADR 0040 决定 7：合并本身住 `packages/host/product-api/`，形状住这里）。
 *
 * 每条码都必须在这里有一行：漏了就是契约缺口，`error-contract.test` 会红。
 */
export interface EleckoiFailureDetailsMap {
  [ELECKOI_FAILURE_CODES.internal]: EleckoiInternalDetails
  [ELECKOI_FAILURE_CODES.contractInvalidRequest]: EleckoiContractIssueDetails
  [ELECKOI_FAILURE_CODES.contractInvalidResponse]: EleckoiContractIssueDetails
  [ELECKOI_FAILURE_CODES.dataShapeInvalid]: EleckoiDataShapeInvalidDetails
  [ELECKOI_FAILURE_CODES.dataLegacyMismatch]: EleckoiDataLegacyMismatchDetails
  [ELECKOI_FAILURE_CODES.inputInvalid]: EleckoiInputInvalidDetails
  [ELECKOI_FAILURE_CODES.inputUnsupported]: EleckoiInputUnsupportedDetails
  [ELECKOI_FAILURE_CODES.lookupNotFound]: EleckoiNotFoundDetails
  [ELECKOI_FAILURE_CODES.lookupDuplicate]: EleckoiLookupDuplicateDetails
  [ELECKOI_FAILURE_CODES.characterNotFound]: EleckoiNotFoundDetails
  [ELECKOI_FAILURE_CODES.creatorProjectNotFound]: EleckoiNotFoundDetails
  [ELECKOI_FAILURE_CODES.agentPresetNotFound]: EleckoiNotFoundDetails
  [ELECKOI_FAILURE_CODES.creatorProjectNameTaken]: EleckoiCreatorProjectNameTakenDetails
  [ELECKOI_FAILURE_CODES.conflictStaleRevision]: EleckoiStaleRevisionDetails
  [ELECKOI_FAILURE_CODES.stateMismatch]: EleckoiStateMismatchDetails
  [ELECKOI_FAILURE_CODES.statePrecondition]: EleckoiStatePreconditionDetails
  [ELECKOI_FAILURE_CODES.safetyRefused]: EleckoiSafetyRefusedDetails
  [ELECKOI_FAILURE_CODES.securityDenied]: EleckoiSecurityDeniedDetails
  [ELECKOI_FAILURE_CODES.senderUntrusted]: EleckoiSenderUntrustedDetails
  [ELECKOI_FAILURE_CODES.lifecycleNotReady]: EleckoiLifecycleNotReadyDetails
  [ELECKOI_FAILURE_CODES.lifecycleDisposed]: EleckoiLifecycleDisposedDetails
  [ELECKOI_FAILURE_CODES.pluginLoadFailed]: EleckoiPluginLoadFailedDetails
  [ELECKOI_FAILURE_CODES.ioFailed]: EleckoiIoFailedDetails
  [ELECKOI_FAILURE_CODES.netOperationFailed]: EleckoiNetOperationFailedDetails
  [ELECKOI_FAILURE_CODES.shellOpenFailed]: EleckoiShellOpenFailedDetails
  [ELECKOI_FAILURE_CODES.timeoutExpired]: EleckoiTimeoutExpiredDetails
  [ELECKOI_FAILURE_CODES.storageCorrupt]: EleckoiStorageCorruptDetails
  [ELECKOI_FAILURE_CODES.dbSchemaMismatch]: EleckoiDbSchemaMismatchDetails
  [ELECKOI_FAILURE_CODES.modelConfigInvalid]: EleckoiModelConfigInvalidDetails
  [ELECKOI_FAILURE_CODES.mediaInvalid]: EleckoiMediaInvalidDetails
  [ELECKOI_FAILURE_CODES.ipcCallFailed]: EleckoiIpcCallFailedDetails
}

/** 任意一条码的详情形状。 */
export type EleckoiFailureDetails = EleckoiFailureDetailsMap[keyof EleckoiFailureDetailsMap]

/** 详情参数名的闭集（见文件头）。跨语言实现使用同一组八个键。 */
export type EleckoiFailureDetailParam =
  | 'field'
  | 'issues'
  | 'path'
  | 'operation'
  | 'guard'
  | 'what'
  | 'expected'
  | 'actual'
  | 'upstreamDetails'

/**
 * 每条码**实际会带哪些参数**。
 *
 * 类型是 `Record<EleckoiFailureCode, …>`，所以漏一条码就编译不过——这是「码表与详情表必须一一对应」
 * 的机械保证（接口本身在运行期不存在，光靠 `EleckoiFailureDetailsMap` 挡不住漏行）。
 * 文档生成（`generate:error-contract`）与用例都读它，所以它也是「哪条码带哪些参数」的唯一真相。
 */
export const ELECKOI_FAILURE_DETAIL_PARAMS: Readonly<
  Record<EleckoiFailureCode, readonly EleckoiFailureDetailParam[]>
> = {
  [ELECKOI_FAILURE_CODES.internal]: ['what', 'upstreamDetails'],
  [ELECKOI_FAILURE_CODES.contractInvalidRequest]: ['issues'],
  [ELECKOI_FAILURE_CODES.contractInvalidResponse]: ['issues'],
  [ELECKOI_FAILURE_CODES.dataShapeInvalid]: ['what', 'path'],
  [ELECKOI_FAILURE_CODES.dataLegacyMismatch]: ['what', 'expected'],
  [ELECKOI_FAILURE_CODES.inputInvalid]: ['field'],
  [ELECKOI_FAILURE_CODES.inputUnsupported]: ['what', 'expected'],
  [ELECKOI_FAILURE_CODES.lookupNotFound]: ['what'],
  [ELECKOI_FAILURE_CODES.lookupDuplicate]: ['what', 'path'],
  [ELECKOI_FAILURE_CODES.characterNotFound]: ['what'],
  [ELECKOI_FAILURE_CODES.creatorProjectNotFound]: ['what'],
  [ELECKOI_FAILURE_CODES.agentPresetNotFound]: ['what'],
  [ELECKOI_FAILURE_CODES.creatorProjectNameTaken]: ['path'],
  [ELECKOI_FAILURE_CODES.conflictStaleRevision]: ['what'],
  [ELECKOI_FAILURE_CODES.stateMismatch]: ['what'],
  [ELECKOI_FAILURE_CODES.statePrecondition]: ['what'],
  [ELECKOI_FAILURE_CODES.safetyRefused]: ['guard'],
  [ELECKOI_FAILURE_CODES.securityDenied]: ['what', 'guard'],
  [ELECKOI_FAILURE_CODES.senderUntrusted]: ['what', 'guard'],
  [ELECKOI_FAILURE_CODES.lifecycleNotReady]: ['what'],
  [ELECKOI_FAILURE_CODES.lifecycleDisposed]: ['what'],
  [ELECKOI_FAILURE_CODES.pluginLoadFailed]: ['what', 'path'],
  [ELECKOI_FAILURE_CODES.ioFailed]: ['operation', 'path'],
  [ELECKOI_FAILURE_CODES.netOperationFailed]: ['operation', 'what'],
  [ELECKOI_FAILURE_CODES.shellOpenFailed]: ['what'],
  [ELECKOI_FAILURE_CODES.timeoutExpired]: ['what'],
  [ELECKOI_FAILURE_CODES.storageCorrupt]: ['what'],
  [ELECKOI_FAILURE_CODES.dbSchemaMismatch]: ['what', 'expected'],
  [ELECKOI_FAILURE_CODES.modelConfigInvalid]: ['field', 'what'],
  [ELECKOI_FAILURE_CODES.mediaInvalid]: ['what', 'field'],
  [ELECKOI_FAILURE_CODES.ipcCallFailed]: ['what', 'operation']
}
