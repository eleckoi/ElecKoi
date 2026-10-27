import { ELECKOI_FAILURE_CODES } from "@shared/contracts/errors/codes";
import { DesktopError } from "@shared/foundation/DesktopError";
import { buildBugReport } from "@shared/foundation/bugReport";

/**
 * 报告功能的平台桥。
 *
 * 桌面端的主进程已经实现 `window.dshDesktop.bugReport`（preview / export / open / send），
 * 直接透传即可。Android 没有 Electron 主进程，但 Java 侧已经有受限运行诊断
 * （`RuntimeDiagnostics`：key 白名单 + 脱敏），所以这里只取「原始事实」——环境、上次会话、
 * 最近事件、投递配置——**报告在渲染层用共享契约拼**。这样脱敏、失败折叠、正文格式仍然只有
 * 一份实现（`packages/shared/src/contracts/bugReport/`）。
 */

/** Android 运行诊断里算「失败」的种类。其余记录只进日志尾。 */
const ANDROID_FAILURE_KINDS = new Set([
  "java-uncaught",
  "native-crash",
  "native-stall",
  "renderer-error",
  "page-error",
  "bridge-timeout",
]);

/**
 * Android 诊断事件 → 报告能消化的日志行。
 *
 * 失败记录改写成契约里的 `{ phase: 'failure', code, msg }`，`buildBugReport` 就按同一套折叠
 * 规则处理；其余记录原样保留，只贡献日志尾。
 *
 * @param {readonly unknown[]} events - `bugReportFacts().events`。
 * @returns {string[]} 日志行（JSON 文本）。
 */
export function androidReportLines(events) {
  const lines = [];
  for (const event of events || []) {
    let record;
    try {
      record = typeof event === "string" ? JSON.parse(event) : event;
    } catch {
      continue;
    }
    if (!record || typeof record !== "object" || Array.isArray(record)) continue;
    const kind = typeof record.kind === "string" ? record.kind : "";
    const level = typeof record.level === "string" ? record.level : "";
    const failed = ANDROID_FAILURE_KINDS.has(kind) || level === "error" || level === "fatal";
    if (!failed) {
      lines.push(JSON.stringify(record));
      continue;
    }
    const message = typeof record.message === "string" && record.message !== ""
      ? record.message
      : typeof record.stack === "string" && record.stack !== ""
        ? record.stack.split("\n")[0]
        : kind || "Android 运行诊断失败";
    lines.push(JSON.stringify({
      phase: "failure",
      code: `eleckoi/android/${kind || "error"}`,
      msg: message,
      details: { what: kind || "android" },
    }));
  }
  return lines;
}

function stamp() {
  const now = new Date();
  const pad = value => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

/** Android 的桥：只实现桌面那套接口里 Android 能做到的部分（没有代发）。 */
function androidBugReportBridge(platform) {
  async function preview(request) {
    const facts = await platform.bugReport.facts();
    if (!facts || facts.available !== true) {
      throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleNotReady,
        "这台设备没有开启运行诊断，报告暂时不可用。", { what: "运行诊断" });
    }
    const report = buildBugReport({
      lines: androidReportLines(facts.events),
      environment: facts.environment,
      session: facts.session,
      includeLogTail: request?.includeLogTail === true,
      ...(typeof request?.notes === "string" && request.notes.trim() !== "" ? { notes: request.notes } : {}),
    });
    return { report, delivery: facts.delivery || { mailbox: "", repository: "" } };
  }

  return {
    preview,
    async export(request) {
      const { report } = await preview({ includeLogTail: true, ...(request?.notes ? { notes: request.notes } : {}) });
      const name = `eleckoi-report-${stamp()}.json`;
      const outcome = await platform.saveText(name, `${JSON.stringify(report, null, 2)}\n`, "application/json");
      return { saved: !(outcome && outcome.cancelled), path: name };
    },
    async open(target) {
      await platform.openExternal(target.url);
    },
  };
}

/**
 * 当前平台的报告桥；没有就返回 undefined（界面据此隐藏入口）。
 *
 * @returns {object | undefined}
 */
export function bugReportBridge() {
  if (typeof window === "undefined") return undefined;
  if (window.dshDesktop?.bugReport) return window.dshDesktop.bugReport;
  const platform = window.ElecKoiPlatform;
  if (platform?.bugReport?.facts) return androidBugReportBridge(platform);
  return undefined;
}

/** 当前平台有没有报告功能。 */
export function isBugReportAvailable() {
  return Boolean(bugReportBridge());
}

/** 邮件正文里要不要带上列表名与订阅地址。 */
export function letterOf(delivery) {
  return {
    ...(delivery?.mailboxName ? { mailboxName: delivery.mailboxName } : {}),
    ...(delivery?.subscribeUrl ? { subscribeUrl: delivery.subscribeUrl } : {}),
  };
}
