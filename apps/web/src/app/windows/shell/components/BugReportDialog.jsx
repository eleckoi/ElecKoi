import { ELECKOI_FAILURE_CODES } from "@shared/contracts/errors/codes";
import { DesktopError } from "@shared/foundation/DesktopError";
import { buildBugReportFormUrl, isBugReportFormConfig } from "@shared/contracts/bugReport/form";
import { hasBugReportChannel } from "@shared/contracts/bugReport/delivery";
import { formatBugReportBody, buildBugReportMailto } from "@shared/contracts/bugReport/mailto";
import { SystemBarOverlay } from '../../../../ui/ui/SystemBarOverlay.jsx';
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { CopyIcon, DownloadIcon, XIcon } from "../../../../ui/icons/index.jsx";
import { resolveFailure } from "../../../../utils/failureText.js";
import { bestEffort } from "../../../../utils/swallowedFailure.js";
import { bugReportBridge, letterOf } from "./bugReportBridge.js";

const PLATFORM_LABELS = {
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
  android: "Android",
};

/** 外部程序没打开、但全文真的写进了剪贴板时，用户手里仍然有全文（ADR 0041 决定 13）。 */
const COPY_READY_NOTICE = "全文已复制到剪贴板，粘到任意地方发给作者即可。";

/** 剪贴板也没写成：不许说"已复制"，把还能走的两个出口说清。 */
const COPY_FAILED_NOTICE = "复制也没成功；可以点「复制报告」重试，或改用「导出文件」。";

/** 一条通道都没配时的提示：出口仍然是复制与导出，绝不给点了必然失败的按钮。 */
const NO_CHANNEL_HINT = "还没配置收件端点。先把报告复制或导出，再自己发给作者。";

/** 上次会话没写 end（崩溃或强杀）时，日志尾默认带上，并说明这是默认行为。 */
const CRASH_LOG_TAIL_NOTICE = "这次是异常结束（可能是崩溃），已默认带上日志尾。";

/** 失败时落草稿成功，才追加这句（Android 没有草稿持久化，桥会诚实回 undefined）。 */
const DRAFT_SAVED_SUFFIX = "报告已保存草稿，下次启动可以重发。";

/** 邮件客户端被系统接住了。剪贴板那一步成没成，另按 `copied` 说（决定 13）。 */
const MAIL_OPENED_NOTICE = "已打开邮件客户端，检查后发送即可。";
const MAIL_OPENED_COPY_NOTICE = "已打开邮件客户端，检查后发送即可；全文也已在剪贴板里。";

/** 会话内降级：通道名 → 界面上的称呼。 */
const CHANNEL_LABELS = { form: "飞书表单", mail: "邮件" };

/**
 * 契约的表单降级枚举 → 渲染层句子（决定 12；ADR 0040 决定 4：报告里的字段是数据，句子在这里写）。
 *
 * `summarized` 不在这张表里：它要按剪贴板那一步的真实结果补一句话，见 `copyStateText`。
 */
const FORM_REASON_TEXTS = {
  "log-tail-truncated": "日志尾已截断到最近 40 行以适应表单链接长度。",
  "hard-truncated": "摘要仍超出表单链接预算，正文已截断。",
};

/**
 * 会话内降级表（ADR 0041 决定 11）：通道名 → 上次失败的抛出值。
 *
 * 模块级 = 跨"关掉再打开"都记得，状态只存内存（窗口重载 = 模块重新求值，自然复位）。
 * 复位时机只有两个：窗口重载、该通道重试成功（`deliver` 里清掉自己那条）。
 */
const channelFailures = new Map();
const channelFailureListeners = new Set();
let channelFailureRevision = 0;

function publishChannelFailureChange() {
  channelFailureRevision += 1;
  for (const listener of channelFailureListeners) listener();
}

function subscribeChannelFailures(listener) {
  channelFailureListeners.add(listener);
  return () => {
    channelFailureListeners.delete(listener);
  };
}

/** 快照就是版本号：Map 本身会被原地改写，用它当快照 React 看不出变化。 */
function channelFailureRevisionOf() {
  return channelFailureRevision;
}

function markChannelFailed(channel, cause) {
  channelFailures.set(channel, cause);
  publishChannelFailureChange();
}

function clearChannelFailure(channel) {
  if (channel === null || !channelFailures.delete(channel)) return;
  publishChannelFailureChange();
}

/**
 * 复位会话内降级表。真实的复位是窗口重载（模块重新求值）或该通道重试成功；
 * 这个导出**只给用例**一个干净起点，生产代码不该调用。
 */
export function resetSessionChannelFailuresForTests() {
  if (channelFailures.size === 0) return;
  channelFailures.clear();
  publishChannelFailureChange();
}

function bridgeOrFail() {
  const bridge = bugReportBridge();
  if (!bridge) {
    throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleNotReady, "当前平台暂不支持报告功能。", { what: "报告服务" });
  }
  return bridge;
}

async function copyText(text) {
  if (!navigator.clipboard?.writeText) {
    throw new DesktopError(ELECKOI_FAILURE_CODES.inputUnsupported, "Clipboard API unavailable", { what: "剪贴板接口" });
  }
  await navigator.clipboard.writeText(text);
}

/**
 * 报告全文 → 剪贴板。失败只回 false、不抛：复制失败不能阻断后面的打开动作
 * （ADR 0041 决定 13，User Story 20）。
 */
async function copyReportText(report, delivery) {
  try {
    await copyText(formatBugReportBody(report, letterOf(delivery)));
    return true;
  } catch {
    return false;
  }
}

/** 渲染期判定表单通道：没配、形状不对、拼不出链接，都不渲染按钮（决定 11）。 */
function formUrlFor(report, delivery) {
  if (!report || !delivery?.form || !isBugReportFormConfig(delivery.form)) return undefined;
  return buildBugReportFormUrl(report, delivery.form);
}

/** 渲染期判定邮件通道：地址不合法就按未配置处理。 */
function mailtoFor(report, delivery) {
  if (!report || !delivery?.mailbox) return undefined;
  return buildBugReportMailto(report, delivery.mailbox, letterOf(delivery));
}

/** 邮件按钮的文案：目的地有显示名就用它。 */
function mailButtonLabel(delivery) {
  return delivery?.mailboxName ? `发送到 ${delivery.mailboxName}` : "用邮件发送";
}

/** 复制那一步的实话：只有真的写进剪贴板才说"已复制"（决定 13）。 */
function copyStateText(copied) {
  return copied ? "全文已复制到剪贴板。" : COPY_FAILED_NOTICE;
}

/** 表单通道的 notice：先说这次发的是全文还是摘要（以及复制成没成），再逐条补降级原因。 */
function formNotice(built, copied) {
  const sentences = [];
  const add = (sentence) => {
    if (!sentences.includes(sentence)) sentences.push(sentence);
  };
  add(built.summarized
    ? `报告较长，这次只带摘要；${copyStateText(copied)}`
    : `已在浏览器打开填好的表单，检查后提交即可；${copyStateText(copied)}`);
  for (const reason of built.reasons) {
    const sentence = FORM_REASON_TEXTS[reason];
    if (sentence) add(sentence);
  }
  return sentences.join("");
}

/** 降级通道旁边的原因句：哪条通道、刚才为什么没成（句子自含"没能打开…"，不再加二次前缀）。 */
function failureHintText(channel, cause) {
  const reason = resolveFailure(cause, { fallback: "外部程序没有打开。" });
  return `${CHANNEL_LABELS[channel] || channel}：${reason.text}`;
}

/**
 * 报告问题对话框：展示主进程收集好的报告，让用户选一条投递通道。
 *
 * 判据（ADR 0041 决定 11 / 13 / 14 / 15）：用户发出去的东西必须是他看过的。所以这里做四件事——
 * 把报告摆出来、让用户勾选与补一句话、按「最可能成功」排通道并逐条投递、把每一次失败落成草稿。
 * 桌面端的报告与脱敏在 Electron 主进程完成；Android 的运行诊断只给原始事实，报告由
 * `bugReportBridge.js` 用共享契约拼。
 */
export function BugReportDialog({ open, onClose, onNotify }) {
  const titleId = useId();
  const descriptionId = useId();
  const failureHintId = useId();
  const dialogRef = useRef(null);
  const primaryButtonRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const closeRef = useRef(() => {});

  onCloseRef.current = onClose;

  // 会话内降级表在模块级：订阅版本号，通道失败/恢复时重渲染（快照内容在渲染期直接读 Map）。
  useSyncExternalStore(subscribeChannelFailures, channelFailureRevisionOf, channelFailureRevisionOf);

  const [preview, setPreview] = useState(null);
  const [includeLogTail, setIncludeLogTail] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // 最多问一次的那批草稿（决定 14）；按份数说话，每次处理最新一份（主进程新到旧给）。
  const [pendingDrafts, setPendingDrafts] = useState([]);

  // 是否发起过投递：只有发起过，关闭时才值得再存一次草稿。
  const attemptedRef = useRef(false);
  // 本次打开是否已经因为「异常结束」自动勾过日志尾——用户手动取消后不许再勾回去。
  const crashHandledRef = useRef(false);
  // 草稿提示同一会话只出现一次（决定 14）。
  const draftsAskedRef = useRef(false);

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    const previousFocus = document.activeElement;
    const focusFrame = window.requestAnimationFrame(() => primaryButtonRef.current?.focus());

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll("button:not(:disabled), input:not(:disabled), textarea:not(:disabled)") || []);
      if (!focusable.length) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open]);

  // 收集参数走 ref：notes 每敲一个字都变，若让 collect 跟着变，打开对话框那个 effect 会被反复触发
  // 并把刚输入的备注清掉。
  const stateRef = useRef({ includeLogTail, notes });
  stateRef.current = { includeLogTail, notes };

  const collect = useCallback(async (overrides = {}) => {
    const logTail = overrides.logTail ?? stateRef.current.includeLogTail;
    const noteText = overrides.noteText ?? stateRef.current.notes;
    const trimmed = noteText.trim();
    return bridgeOrFail().preview({
      includeLogTail: logTail,
      ...(trimmed === "" ? {} : { notes: trimmed }),
    });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    setError("");
    setNotice("");
    setNotes("");
    setIncludeLogTail(false);
    setPreview(null);
    attemptedRef.current = false;
    crashHandledRef.current = false;
    collect({ logTail: false, noteText: "" })
      .then((nextPreview) => {
        if (!active) return;
        setPreview(nextPreview);
        // 崩溃证据默认带上（决定 15）：只自动勾一次，用户取消后不再勾回。
        if (nextPreview.report.session.ended !== false || crashHandledRef.current) return;
        crashHandledRef.current = true;
        setIncludeLogTail(true);
        collect({ logTail: true, noteText: "" })
          .then((withLogTail) => { if (active) setPreview(withLogTail); })
          .catch((cause) => { if (active) setError(resolveFailure(cause, { fallback: "无法生成报告。" }).text); });
      })
      .catch((cause) => {
        if (active) setError(resolveFailure(cause, { fallback: "无法生成报告。" }).text);
      });
    return () => { active = false; };
  }, [open, collect]);

  // 草稿只问一次（决定 14）：同一会话里第二次打开不再问；块按份数说话，处理掉一份后重拉。
  useEffect(() => {
    if (!open || draftsAskedRef.current) return undefined;
    const bridge = bugReportBridge();
    if (typeof bridge?.drafts !== "function") return undefined;
    draftsAskedRef.current = true;
    let active = true;
    bridge.drafts()
      .then((result) => {
        if (active) setPendingDrafts(Array.isArray(result?.drafts) ? result.drafts : []);
      })
      // 草稿列表问不到不是用户能处理的事：块不出现，等下次启动再问。
      .catch(bestEffort);
    return () => { active = false; };
  }, [open]);

  /** 重新拉一次草稿列表：处理掉一份之后，块按剩余份数更新或消失。 */
  const refreshDrafts = useCallback(async () => {
    const bridge = bugReportBridge();
    if (typeof bridge?.drafts !== "function") return;
    try {
      const result = await bridge.drafts();
      setPendingDrafts(Array.isArray(result?.drafts) ? result.drafts : []);
    } catch {
      // 列表问不到就保留已知的那份：块可能多留一会儿，但不能把对话框变成错误页。
      bestEffort();
    }
  }, []);

  /** 尽力把当前报告落成草稿；失败静默，不覆盖原来的错误。 */
  const saveDraftQuietly = useCallback(async () => {
    const bridge = bugReportBridge();
    if (typeof bridge?.saveDraft !== "function") return false;
    const trimmed = stateRef.current.notes.trim();
    try {
      const saved = await bridge.saveDraft({
        includeLogTail: stateRef.current.includeLogTail,
        ...(trimmed === "" ? {} : { notes: trimmed }),
      });
      // Android 的降级实现回 undefined——没落盘就不能说"已保存草稿"。
      return Boolean(saved);
    } catch {
      return false;
    }
  }, []);

  /** 投递失败：显示原因、记下通道失败、尽力落草稿，并按剪贴板那一步的真实结果说下一步。 */
  const failDelivery = useCallback(async (channel, cause, copied) => {
    const saved = await saveDraftQuietly();
    const resolved = resolveFailure(cause, { fallback: "报告没能发出去。" });
    setError(saved ? `${resolved.text}${DRAFT_SAVED_SUFFIX}` : resolved.text);
    if (channel) {
      markChannelFailed(channel, cause);
      setNotice(copied ? COPY_READY_NOTICE : COPY_FAILED_NOTICE);
    }
  }, [saveDraftQuietly]);

  /**
   * 投递动作的统一承载（决定 13）：重新收集 → 尽力复制全文 → 打开外部程序。顺序固定；
   * 复制失败不阻断；打开失败不自动改开别的通道。
   */
  async function deliver(channel, action) {
    attemptedRef.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    let fresh;
    try {
      fresh = await collect();
      setPreview(fresh);
    } catch (cause) {
      setError(resolveFailure(cause, { fallback: "报告没能发出去。" }).text);
      setBusy(false);
      return;
    }
    const copied = await copyReportText(fresh.report, fresh.delivery);
    try {
      await action(fresh, copied);
      // 这一条通道又能用了：把它从降级位上放回去（用户可能刚装好浏览器）。
      clearChannelFailure(channel);
    } catch (cause) {
      await failDelivery(channel, cause, copied);
    } finally {
      setBusy(false);
    }
  }

  async function toggleLogTail(event) {
    const next = event.target.checked;
    setIncludeLogTail(next);
    setError("");
    setBusy(true);
    try {
      setPreview(await collect({ logTail: next }));
    } catch (cause) {
      setError(resolveFailure(cause, { fallback: "无法生成报告。" }).text);
    } finally {
      setBusy(false);
    }
  }

  function sendDirectly() {
    return deliver(null, async (fresh) => {
      const noteText = stateRef.current.notes.trim();
      const result = await bridgeOrFail().send({
        includeLogTail: stateRef.current.includeLogTail,
        ...(noteText === "" ? {} : { notes: noteText }),
      });
      const where = fresh.delivery.mailboxName ? `到 ${fresh.delivery.mailboxName}` : "";
      const receipt = result?.receipt ? `（回执 ${result.receipt}）` : "";
      setNotice(`报告已发送${where}${receipt}，谢谢！`);
    });
  }

  function sendToForm() {
    return deliver("form", async (fresh, copied) => {
      const built = formUrlFor(fresh.report, fresh.delivery);
      if (!built) {
        throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, "表单端点没有配置完整。", { field: "form" });
      }
      await bridgeOrFail().open({ kind: "form", url: built.url });
      // 打开成功只说明系统接住了调用（决定 13）：说清这次发的是全文还是摘要，以及复制成没成。
      setNotice(formNotice(built, copied));
    });
  }

  function sendByMail() {
    return deliver("mail", async (fresh, copied) => {
      const mailto = mailtoFor(fresh.report, fresh.delivery);
      if (!mailto) {
        throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, `收件地址不合法：${fresh.delivery.mailbox}`, { field: "mailbox" });
      }
      await bridgeOrFail().open({ kind: "mail", url: mailto.url });
      setNotice(copied ? MAIL_OPENED_COPY_NOTICE : MAIL_OPENED_NOTICE);
    });
  }

  function copyReport() {
    return deliver(null, async (_fresh, copied) => {
      setNotice(copied
        ? COPY_READY_NOTICE
        : "剪贴板没有写成。可以改用「导出文件」，再自己发给作者。");
    });
  }

  function exportReport() {
    setBusy(true);
    setError("");
    setNotice("");
    const trimmed = notes.trim();
    return bridgeOrFail()
      .export(trimmed === "" ? {} : { notes: trimmed })
      .then((result) => {
        if (result.saved) setNotice(`已导出到 ${result.path}`);
      })
      .catch((cause) => setError(resolveFailure(cause, { fallback: "导出失败。" }).text))
      .finally(() => setBusy(false));
  }

  /**
   * 重新送出草稿：用草稿里的报告走表单通道，没配表单就只复制正文。
   *
   * 打开浏览器只说明系统接住了调用，**不等于提交**（决定 13 / 14）：草稿保留，等用户确认提交后
   * 自己点「丢弃」。处理完重新拉一次列表，块按剩余份数更新。
   */
  async function resendDraft() {
    const draft = pendingDrafts[0];
    if (!draft) return;
    setBusy(true);
    setError("");
    setNotice("");
    const delivery = preview?.delivery;
    const built = formUrlFor(draft.report, delivery);
    let copied = false;
    try {
      const bridge = bridgeOrFail();
      copied = await copyReportText(draft.report, delivery);
      if (!built && !copied) {
        // 既没有表单可走、正文又没复制出去：这份草稿不能删，否则用户手里什么都没了。
        setNotice("没能复制那份草稿，可以先用「导出文件」把它存下来。");
        return;
      }
      if (built) {
        await bridge.open({ kind: "form", url: built.url });
        setNotice(copied
          ? "表单已在浏览器打开；确认提交后再点「丢弃」。"
          : "表单已在浏览器打开；复制没成功，可以点「复制报告」重试。确认提交后再点「丢弃」。");
      } else {
        setNotice("全文已复制到剪贴板；确认发出后再点「丢弃」。");
      }
      await refreshDrafts();
    } catch (cause) {
      // 失败保留草稿：下次还能再试。
      await failDelivery(built ? "form" : null, cause, copied);
    } finally {
      setBusy(false);
    }
  }

  /** 丢弃草稿：删成功块才消失；删失败保留，避免用户以为已经删了。 */
  async function discardDraft() {
    const draft = pendingDrafts[0];
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      await bridgeOrFail().discardDraft(draft.key);
      setPendingDrafts((current) => current.filter((item) => item.key !== draft.key));
      await refreshDrafts();
      setNotice("已丢弃那份草稿。");
    } catch (cause) {
      setError(resolveFailure(cause, { fallback: "草稿没能删掉。" }).text);
    } finally {
      setBusy(false);
    }
  }

  /**
   * 关闭：发起过投递、还在忙的时候关掉（多按了一次关闭、去处理别的事），报告不能就此丢掉——
   * 尽力落一次草稿；单纯打开又关掉不存（决定 14）。
   */
  function close() {
    if (busy && attemptedRef.current) void saveDraftQuietly();
    onCloseRef.current?.();
  }

  closeRef.current = close;

  const report = preview?.report;
  const delivery = preview?.delivery;
  // 渲染期就判定「点得动」：拼不出地址的通道不给按钮，拼得出来的才排进投递链（决定 11）。
  const formUrl = useMemo(() => formUrlFor(report, delivery), [report, delivery]);
  const mailto = useMemo(() => mailtoFor(report, delivery), [report, delivery]);
  const formFailure = channelFailures.get("form");
  const mailFailure = channelFailures.get("mail");
  const hasChannel = preview !== null && hasBugReportChannel(delivery);

  /**
   * 通道描述（决定 11）：表单 > 邮件 > 代发。降级过的通道移到 actions 末尾并挂原因；主按钮是
   * 第一个没降级的通道（表单 > 邮件 > 代发 > 复制）。
   */
  const channelActions = [];
  if (formUrl) channelActions.push({ key: "form", label: "提交到飞书", failure: formFailure, onClick: sendToForm });
  if (mailto) channelActions.push({ key: "mail", label: mailButtonLabel(delivery), failure: mailFailure, onClick: sendByMail });
  if (delivery?.relay) channelActions.push({ key: "relay", label: "直接发送", failure: undefined, onClick: sendDirectly });
  const healthyActions = channelActions.filter((action) => action.failure === undefined);
  const failedActions = channelActions.filter((action) => action.failure !== undefined);
  const primaryKey = healthyActions[0]?.key ?? "copy";

  if (!open) return null;

  const dialog = (
    <SystemBarOverlay className="bug-report-overlay" role="presentation" onMouseDown={close}>
      <section
        ref={dialogRef}
        className="bug-report-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={busy || undefined}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="bug-report-close" type="button" aria-label="关闭报告" title="关闭" onClick={close}>
          <XIcon />
        </button>
        <h2 id={titleId}>报告问题</h2>
        <p id={descriptionId}>报告里只有版本、失败和你要带上的日志尾；发送前可以自己删改。</p>

        {/*
          正文区单独滚动：对话框有 max-height，长失败诊断 + 展开的全文很容易超出一屏。
          以前没有这个容器，`.bug-report-failures` 被 flex 压扁后它的 <ul> 会盖到下面的
          复选框和备注框上（2026-11-05 Windows 验收实测）。提示与按钮留在滚动区外，
          这样失败/成功反馈永远可见。
        */}
        <div className="bug-report-body">

          {pendingDrafts.length ? (
            <section className="bug-report-draft" aria-label="上次没发出去的报告">
              <p>
                {pendingDrafts.length > 1
                  ? `上次有 ${pendingDrafts.length} 份没送出去的报告，先送出最新一份吗？`
                  : `上次有 ${pendingDrafts.length} 份没送出去的报告，要现在送出去吗？`}
              </p>
              <div className="bug-report-draft-actions">
                {/* 预览没到就没有 delivery，重发会静默跳过表单通道；先禁用。 */}
                <button type="button" disabled={busy || preview === null} onClick={resendDraft}>重新送出</button>
                <button type="button" disabled={busy} onClick={discardDraft}>丢弃</button>
              </div>
            </section>
          ) : null}

          {report ? (
            <>
              <dl className="bug-report-summary">
                <div>
                  <dt>版本</dt>
                  <dd>{report.environment.appVersion} · {PLATFORM_LABELS[report.environment.platform] || report.environment.platform} · {report.environment.arch}</dd>
                </div>
                <div>
                  <dt>上次会话</dt>
                  <dd className={report.session.ended ? "" : "is-warning"}>
                    {report.session.ended ? "正常结束" : "异常结束（可能是崩溃）"}
                  </dd>
                </div>
              </dl>

              <section className="bug-report-failures" aria-label="失败">
                <h3>失败（{report.failures.length}）</h3>
                {report.failures.length ? (
                  <ul>
                    {report.failures.map((failure) => (
                      <li key={failure.code}>
                        <code>{failure.code}</code>
                        <span>{failure.message}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>没有记录到失败行。</p>
                )}
              </section>

              <label className="bug-report-toggle">
                <input type="checkbox" checked={includeLogTail} disabled={busy} onChange={toggleLogTail} />
                <span>附带最近的日志尾（已脱敏）</span>
              </label>

              {report.session.ended === false && includeLogTail ? (
                <p className="bug-report-hint">{CRASH_LOG_TAIL_NOTICE}</p>
              ) : null}

              <label className="bug-report-notes">
                <span>补充说明（可选）</span>
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={notes}
                  disabled={busy}
                  placeholder="当时在做什么？点了什么之后出现的？"
                  onChange={(event) => setNotes(event.target.value)}
                />
              </label>
            </>
          ) : (
            <p className="bug-report-loading" role="status">{error ? "报告没准备好。" : "正在收集…"}</p>
          )}

          {report ? (
            <details className="bug-report-preview">
              <summary>查看将要发送的全文</summary>
              <pre>{formatBugReportBody(report, letterOf(delivery))}</pre>
            </details>
          ) : null}

        </div>

        {error ? <p className="bug-report-error" role="alert">{error}</p> : null}
        {notice ? <p className="bug-report-notice" role="status">{notice}</p> : null}
        {report && !hasChannel ? <p className="bug-report-hint">{NO_CHANNEL_HINT}</p> : null}
        {failedActions.length ? (
          <p className="bug-report-hint" id={failureHintId}>
            {failedActions.map((action) => failureHintText(action.key, action.failure)).join(" ")}
          </p>
        ) : null}

        <div className="bug-report-actions">
          {healthyActions.map((action) => (
            <button
              key={action.key}
              ref={primaryKey === action.key ? primaryButtonRef : undefined}
              type="button"
              className={primaryKey === action.key ? "is-primary" : undefined}
              disabled={busy}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
          {report ? (
            <button
              ref={primaryKey === "copy" ? primaryButtonRef : undefined}
              type="button"
              className={primaryKey === "copy" ? "is-primary" : undefined}
              disabled={busy}
              onClick={copyReport}
            >
              <CopyIcon />
              <span>复制报告</span>
            </button>
          ) : null}
          {report ? (
            <button type="button" disabled={busy} onClick={exportReport}>
              <DownloadIcon />
              <span>导出文件</span>
            </button>
          ) : null}
          {failedActions.map((action) => (
            <button
              key={action.key}
              type="button"
              disabled={busy}
              aria-describedby={failureHintId}
              title={failureHintText(action.key, action.failure)}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
          <button type="button" onClick={close}>关闭</button>
        </div>
      </section>
    </SystemBarOverlay>
  );

  const portalTarget = typeof document === "undefined" ? null : document.body;
  return portalTarget ? createPortal(dialog, portalTarget) : dialog;
}
