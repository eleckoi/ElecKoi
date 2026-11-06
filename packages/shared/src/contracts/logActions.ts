/**
 * 日志动作语义键——主进程与渲染层共用的一张表。
 *
 * 设计判据：一行日志要能读出「谁、在做什么、结果如何」——动作用语义键（不是函数名、不是
 * 随机 id），失败复用契约码与参数化详情（见 `foundation/describeFailure.ts` 与 `foundation/actionLog.ts`）。
 *
 * 两条设计约束：
 *
 * 1. **语义名，不是函数名、不是随机 id**：形态 `<域>.<动作>`（全小写、点分、段内可用连字符），
 *    例如 `conversations.delete`。读日志的人不回查代码就知道这一行在做什么。
 * 2. **只有一套真相**：主进程（`apps/desktop/src/main/platform/logging/logActions.ts`）与渲染层
 *    （`apps/web/src/utils/logAction.js`）都 import 这张表。渲染层把动作行经 `console` 交给主窗口的
 *    console-message 桥落盘（WP13 已经用这条路转发渲染层失败，不新开 IPC），所以两边不需要各抄
 *    一份表——抄一份就一定会漂移。
 *
 * 新增动作 = 在本对象里加一行；`packages/shared/tests/action-log.test.ts` 守着形态与唯一性。
 */
export const LOG_ACTIONS = {
  /** 会话开始（主进程；正常退出时有配对的 `session.ended`）。 */
  sessionStarted: 'session.started',
  /** 会话结束（主进程；崩溃 / 强杀时没有这一行，日志里就是「有 start 没 end」）。 */
  sessionEnded: 'session.ended',
  /** 发送一条聊天消息（开始 / 成功 / 失败各一行）。 */
  messageSend: 'message.send',
  /** 删除一条会话。 */
  conversationDelete: 'conversations.delete',
  /** 保存 Agent 预设。 */
  presetSave: 'preset.save',
  /** 导入角色卡。 */
  characterImport: 'character.import',
  /** 导出角色卡。 */
  characterExport: 'character.export',
  /** 保存设置（用户资料页的「保存」）。 */
  settingsSave: 'settings.save',
  /** 启动 DSH 插件宿主。 */
  pluginHostStart: 'plugin-host.start',
  /** 检查桌面更新。 */
  updateCheck: 'update.check',
  /** 收集 Bug 报告（预览；用户打开报告对话框时一次）。 */
  bugReportPreview: 'bug-report.preview',
  /** 导出 Bug 报告到文件。 */
  bugReportExport: 'bug-report.export',
  /** 打开报告的一条投递通道（邮件 / issue）。 */
  bugReportOpen: 'bug-report.open',
  /** 经托管服务代发报告。 */
  bugReportSend: 'bug-report.send'
} as const

/** 动作键的联合类型：调用点写错一个字母就是类型错误，而不是一条查不到的日志。 */
export type LogAction = (typeof LOG_ACTIONS)[keyof typeof LOG_ACTIONS]

/** 一次动作的三个阶段：开始 / 成功 / 失败各一行。 */
export const LOG_ACTION_PHASES = ['start', 'success', 'failure'] as const

/** 阶段名。 */
export type LogActionPhase = (typeof LOG_ACTION_PHASES)[number]

/** 渲染层动作行的固定前缀；主进程只转发带这个前缀的 `console` 行。 */
export const LOG_ACTION_MESSAGE_MARKER = 'eleckoi-action'

/**
 * 动作键的形态：`<域>.<动作>`，点分，每段小写、可含连字符。
 * 用例用它守新键的命名；运行时不依赖它。
 */
export const LOG_ACTION_KEY_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*)+$/

const LOG_ACTION_KEYS: ReadonlySet<string> = new Set(Object.values(LOG_ACTIONS))

/**
 * 是不是表里的动作键。
 * @param value - 任意值（渲染层转发来的 JSON 必须先校验）。
 * @returns 是动作键时为 true。
 */
export function isLogAction(value: unknown): value is LogAction {
  return typeof value === 'string' && LOG_ACTION_KEYS.has(value)
}

/**
 * 是不是合法阶段。
 * @param value - 任意值。
 * @returns 是阶段名时为 true。
 */
export function isLogActionPhase(value: unknown): value is LogActionPhase {
  return typeof value === 'string' && (LOG_ACTION_PHASES as readonly string[]).includes(value)
}
