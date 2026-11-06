/**
 * ElecKoi 失败码表——错误契约的规范形态。
 *
 * 判据来源：ADR 0040 决定 14 给了首批 13 条码；2026-10-17 的清点
 * （0.2.13 上 903 处中文抛出 / 97 文件）证明 13 条只盖得住约
 * 六成，剩下的会全部折成兜底码、等于没有语义。所以这张表按**真实的失败词表**扩到 29 条；
 * 扩表是内部枚举的自由（码表不对外承诺），改名才需要一次全局替换。
 *
 * **语言中立**：本文件只声明「码字符串 + 每个字符串的含义」，供各语言实现使用。
 * 除本文件与同目录的 `details.ts` / `boundaries.ts` 之外，别处不得再定义失败码字符串——
 * 契约只有一套真相（ADR 0040 决定 1：不新造第二套类型）。
 *
 * 形态 `eleckoi/<域>/<原因>`（全小写、ASCII、连字符分词）。唯一例外是兜底码
 * {@link ELECKOI_FALLBACK_FAILURE_CODE}，它只有两段。
 *
 * 落点说明：ADR 0040 决定 7 要求「纯枚举住 `product-shared`，不住 `dsh-product-api`」；
 * 同一决定把这个子目录钉在 `packages/shared/src/contracts/errors/`
 * （v0.2.10 起 `product-shared` 的目录在 `packages/shared`，包名不变）。
 *
 * **一条码该不该存在**：只有当「用户该看到的说法」或「程序该走的分支」因为语义不同而不同时，
 * 才值得单独一条。同一句说法能覆盖的失败走一条码 + `details`。
 */

/** 失败码。键是 ASCII 名（给代码读），值是上线的码字符串（供跨语言实现使用）。 */
export const ELECKOI_FAILURE_CODES = {
  /** 兜底：不属于任何已点名语义的失败。详情见 `details.ts` 的 `EleckoiInternalDetails`。 */
  internal: 'eleckoi/internal',

  // ---- 合同与载荷（谁送来的东西不合约定） ----
  /** 调用方送进来的载荷不合合同。详情带 `issues`。 */
  contractInvalidRequest: 'eleckoi/contract/invalid-request',
  /** 服务返回的载荷不合合同。详情带 `issues`。 */
  contractInvalidResponse: 'eleckoi/contract/invalid-response',
  /** 已落盘/已传输的载荷形状不对（缺字段、类型不对），但来源不是一次 codec 校验。详情带 `what`。 */
  dataShapeInvalid: 'eleckoi/data/shape-invalid',
  /** 旧版数据、旧迁移产物或旧结构版本不被当前版本接受。详情带 `what` / `expected`。 */
  dataLegacyMismatch: 'eleckoi/data/legacy-mismatch',

  // ---- 输入（用户填的、选的、导入的） ----
  /** 用户输入不合法。详情带 `field`。 */
  inputInvalid: 'eleckoi/input/invalid',
  /** 遇到不支持的格式、版本、协议或能力。详情带 `what` / `expected`。 */
  inputUnsupported: 'eleckoi/input/unsupported',

  // ---- 查找（按 id / 名称找东西） ----
  /** 按 id 或名称找不到对象、记录或版本（没有专属域码的那一类）。详情带 `what`。 */
  lookupNotFound: 'eleckoi/lookup/not-found',
  /** 名称或编号重复、目标位置已被占用。详情带 `what` / `path`。 */
  lookupDuplicate: 'eleckoi/lookup/duplicate',
  /** 找不到角色。详情带 `what`。 */
  characterNotFound: 'eleckoi/character/not-found',
  /** 找不到创作项目。详情带 `what`。 */
  creatorProjectNotFound: 'eleckoi/creator-project/not-found',
  /** 找不到 Agent 预设。详情带 `what`。 */
  agentPresetNotFound: 'eleckoi/agent-preset/not-found',
  /** 创建创作项目时目标目录已存在同名目录。详情带 `path`。 */
  creatorProjectNameTaken: 'eleckoi/creator-project/name-taken',

  // ---- 状态（东西在，但状态对不上） ----
  /** 乐观并发校验失配：东西在别处被改过。详情带 `what`。 */
  conflictStaleRevision: 'eleckoi/conflict/stale-revision',
  /** 两个身份、归属或状态对不上（不是并发问题）。详情带 `what`。 */
  stateMismatch: 'eleckoi/state/mismatch',
  /** 用户需要先完成一个前置动作。详情带 `what`（该做什么的动作，如 `打开一个聊天`）。 */
  statePrecondition: 'eleckoi/state/precondition',

  // ---- 权限与护栏 ----
  /** 护栏拒绝执行（不是「执行了但失败」）。详情带 `guard`。 */
  safetyRefused: 'eleckoi/safety/refused',
  /** 权限、归属、凭据或路径边界校验拒绝。详情带 `what` / `guard`。 */
  securityDenied: 'eleckoi/security/denied',
  /** 调用来自不可信的渲染进程 / frame。详情带 `what` / `guard`。 */
  senderUntrusted: 'eleckoi/sender/untrusted',

  // ---- 生命周期（来早了、来晚了） ----
  /** 依赖的服务、DSH 会话或投影尚未就绪。详情带 `what`。 */
  lifecycleNotReady: 'eleckoi/lifecycle/not-ready',
  /** 服务或运行环境已关闭，这次调用来晚了。详情带 `what`。 */
  lifecycleDisposed: 'eleckoi/lifecycle/disposed',
  /** DSH 插件宿主进程装载、启动或退出失败。详情带 `what` / `path`。 */
  pluginLoadFailed: 'eleckoi/plugin/load-failed',

  // ---- 外部世界（IO、网络、数据库、模型） ----
  /** 文件系统或外部 IO 操作失败。详情带 `operation` / `path`。 */
  ioFailed: 'eleckoi/io/failed',
  /** 网络请求或外部服务调用失败。详情带 `operation` / `what`。 */
  netOperationFailed: 'eleckoi/net/operation-failed',
  /** 打开外部程序失败：邮件客户端或浏览器没起来（ADR 0042 决定 13）。 */
  shellOpenFailed: 'eleckoi/shell/open-failed',
  /** 等一个操作等过了约定的时间。详情带 `what`（等的是什么，名词短语）。 */
  timeoutExpired: 'eleckoi/timeout/expired',
  /** 存储里的内容损坏，无法解析。详情带 `what`。 */
  storageCorrupt: 'eleckoi/storage/corrupt',
  /** 数据库 schema、迁移链、表清单或外键不符。详情带 `what` / `expected`。 */
  dbSchemaMismatch: 'eleckoi/db/schema-mismatch',
  /** 模型、提供商、密钥或适配器配置不合法。详情带 `field` / `what`。 */
  modelConfigInvalid: 'eleckoi/model/config-invalid',
  /** 图片 / 音频 / 生图数据不合法或超限。详情带 `what` / `field`。 */
  mediaInvalid: 'eleckoi/media/invalid',

  // ---- 边界内部（客户端调宿主这类） ----
  /** 客户端调用宿主失败，且拿不到更有语义的失败。详情带 `what` / `operation`。 */
  ipcCallFailed: 'eleckoi/ipc/call-failed'
} as const

/** 码的联合类型。 */
export type EleckoiFailureCode = typeof ELECKOI_FAILURE_CODES[keyof typeof ELECKOI_FAILURE_CODES]

/**
 * 码的固定清单，顺序即文档与测试的列举顺序（先兜底，再按「谁的问题」分组）。
 * 跨语言实现、文档表格、逐条断言都该用这份顺序，别各自重排。
 */
export const ELECKOI_FAILURE_CODE_LIST = [
  ELECKOI_FAILURE_CODES.internal,
  ELECKOI_FAILURE_CODES.contractInvalidRequest,
  ELECKOI_FAILURE_CODES.contractInvalidResponse,
  ELECKOI_FAILURE_CODES.dataShapeInvalid,
  ELECKOI_FAILURE_CODES.dataLegacyMismatch,
  ELECKOI_FAILURE_CODES.inputInvalid,
  ELECKOI_FAILURE_CODES.inputUnsupported,
  ELECKOI_FAILURE_CODES.lookupNotFound,
  ELECKOI_FAILURE_CODES.lookupDuplicate,
  ELECKOI_FAILURE_CODES.characterNotFound,
  ELECKOI_FAILURE_CODES.creatorProjectNotFound,
  ELECKOI_FAILURE_CODES.agentPresetNotFound,
  ELECKOI_FAILURE_CODES.creatorProjectNameTaken,
  ELECKOI_FAILURE_CODES.conflictStaleRevision,
  ELECKOI_FAILURE_CODES.stateMismatch,
  ELECKOI_FAILURE_CODES.statePrecondition,
  ELECKOI_FAILURE_CODES.safetyRefused,
  ELECKOI_FAILURE_CODES.securityDenied,
  ELECKOI_FAILURE_CODES.senderUntrusted,
  ELECKOI_FAILURE_CODES.lifecycleNotReady,
  ELECKOI_FAILURE_CODES.lifecycleDisposed,
  ELECKOI_FAILURE_CODES.pluginLoadFailed,
  ELECKOI_FAILURE_CODES.ioFailed,
  ELECKOI_FAILURE_CODES.netOperationFailed,
  ELECKOI_FAILURE_CODES.shellOpenFailed,
  ELECKOI_FAILURE_CODES.timeoutExpired,
  ELECKOI_FAILURE_CODES.storageCorrupt,
  ELECKOI_FAILURE_CODES.dbSchemaMismatch,
  ELECKOI_FAILURE_CODES.modelConfigInvalid,
  ELECKOI_FAILURE_CODES.mediaInvalid,
  ELECKOI_FAILURE_CODES.ipcCallFailed
] as const

/**
 * 兜底码。ADR 0040 决定 7 说「通用码只做兜底」，所以它是唯一只有两段的码：
 * 任何边界遇到无法判别的失败都折成它（`details.what` 记原码做诊断）。
 */
export const ELECKOI_FALLBACK_FAILURE_CODE = ELECKOI_FAILURE_CODES.internal

/**
 * 码的形态：`eleckoi/<域>/<原因>`；`eleckoi/internal` 是文档化的例外（兜底码只有两段）。
 * 域与原因都是小写 ASCII、以连字符分词。
 */
export const ELECKOI_FAILURE_CODE_PATTERN = /^eleckoi\/(?:internal|[a-z][a-z-]*\/[a-z][a-z-]*)$/

const ELECKOI_FAILURE_CODE_SET: ReadonlySet<string> = new Set(Object.values(ELECKOI_FAILURE_CODES))

/**
 * 运行期判定一个字符串是不是码表里的码。
 * 跨边界收码时才用得到它（例如结构上像 RemoteError 但码不在表里的失败要兜底，
 * 不能把未知码原样传下去——`foldFailure` 就是这么用的）。
 */
export function isEleckoiFailureCode(value: string): value is EleckoiFailureCode {
  return ELECKOI_FAILURE_CODE_SET.has(value)
}
