/**
 * 宿主 ↔ DSH 子进程之间的消息协议。
 *
 * 判据来源：`contracts/errors/boundaries.ts` 的第 3 条边界（`host-dsh-subprocess`）。
 *
 * **为什么 fatal 帧要带码与详情**：这条边界的失败是子进程里的一次崩溃或装配失败。
 * 父进程只知道「子进程死了」是最差的情况——用户看到一句「插件服务意外退出」，
 * 开发者没有任何可查的东西。所以 fatal 帧在 `message` 之外带三样：
 *
 * - `code`：契约码（`eleckoi/<域>/<原因>`）。子进程用 `foldFailure` 折出来，
 *   父进程原样搬到宿主失败通知上，**不重新猜语义**；
 * - `details`：契约的参数化详情（扁平 JSON，能过结构化克隆与 IPC）；
 * - `stack`：子进程侧的调用栈。诊断以子进程为准，父进程只是搬运。
 *
 * `logPath` **不在帧上**：子进程不填它。宿主收到 fatal 帧后自己记录本机日志路径
 * （ADR 0040 决定 10 的「诊断用指针」落在边界⑤ 的宿主失败通知上，见 `contracts/errors/ipc.ts` 的
 * `DesktopHostFailureNotice`；宿主日志落盘属于 P6，接上之前该字段不出现）。
 *
 * 字段都是**可选**的：老版本子进程只发 `message` 也仍然合法（`isChildFatalFrame` 不要求它们），
 * 只是那种帧会被父进程折成兜底码。反向也成立——父进程不认识的字段一律忽略，
 * 所以加字段不需要升协议版本号，帧上也没有版本字段。
 */

/** 子进程 → 父进程。 */
export type ChildHostMessage =
  | { type: 'ready'; url: string; injections: readonly unknown[] }
  | {
      readonly type: 'fatal'
      /** 契约码；缺省表示子进程没能折出码（父进程会走兜底）。 */
      readonly code?: string
      /** 开发者诊断文案（不是用户可见句子）。 */
      readonly message: string
      /** 契约的参数化详情；必须是扁平 JSON 对象。 */
      readonly details?: Readonly<Record<string, unknown>>
      /** 子进程侧的调用栈（诊断以子进程为准）。 */
      readonly stack?: string
    }
  | { type: 'shutdown-complete' }
  | { type: 'update-tasks-complete'; id: string; active: boolean; message?: string }
  | { type: 'file-drag-resource'; requestId: number; resource: { path: string; sha256: string; size: number } | null; error?: string }

/** 父进程 → 子进程。 */
export type ParentHostMessage =
  | { type: 'update-tasks'; id: string; action: 'inspect' | 'lock' | 'unlock' }
  | { type: 'shutdown' }
  | { type: 'file-drag-resource'; requestId: number; address: string }
  | { type: 'file-drag-cancel'; requestId: number }
