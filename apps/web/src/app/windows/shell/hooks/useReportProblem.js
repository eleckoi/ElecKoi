/**
 * 报告入口的状态与两个入口的接线：社区弹窗的「报告问题」，以及「运行错误」对话框里的同一句按钮。
 *
 * 判据（ADR 0042 决定 17）：用户是在**出错的那一刻**最想报告，所以错误对话框里要有一个入口；
 * 但入口只在真有报告服务时才渲染（`isBugReportAvailable()`，与 `CommunityDialog` 同一条规矩）——
 * 绝不渲染一个点下去必然失败的按钮。点一次就关掉错误、打开报告，不叠两个模态。
 *
 * 三个窗口（主窗口 / 独立聊天窗口 / 安卓）都渲染 `AppToast`，也就都会弹出错误对话框，所以这一套
 * 状态放在这里共用：谁挂了报告对话框，谁的窗口里才有这个按钮。
 *
 * 模块级回调不是必需的（每个 BrowserWindow 是独立渲染进程，模块状态本来就按窗口隔离），
 * 传 prop 就够；集中在这里是为了让三个窗口的接线长得一样。
 */
import { useCallback, useState } from 'react';
import { isBugReportAvailable } from '../components/bugReportBridge.js';

/**
 * 从错误对话框打开报告时，往「补充说明」里预填的那一行。
 *
 * 为什么要有它：渲染层失败只以 `eleckoi-renderer-failure` 诊断行进日志尾，**不进**报告里
 * 折叠出的失败列表（那份列表来自主进程 `phase: failure` 的记录）。不预填的话，用户从错误
 * 里点进报告，可能看到「没有记录到失败行」——刚才那个码只有他记得。这句是可删可改的补充说明，
 * 不改变报告的字段契约。
 *
 * @param failure - 错误对话框手里的失败对象（可能没有码）。
 * @returns 预填文本；没有码时为空串（不写半句没有信息的话）。
 */
export function reportProblemNotes(failure) {
  const code = typeof failure?.code === 'string' ? failure.code.trim() : '';
  return code === '' ? '' : `看到「运行错误」：${code}`;
}

/**
 * 报告入口。
 *
 * @param options - `onDismissNotice`：关掉当前那条错误提示（错误对话框与报告对话框不叠在一起）。
 * @returns `available`（报告服务在不在）、`openReport`（两个入口共用）、`close`、`dialogProps`。
 */
export function useReportProblem({ onDismissNotice } = {}) {
  const [open, setOpen] = useState(false);
  const [initialNotes, setInitialNotes] = useState('');

  /** 打开报告：社区弹窗不传失败，错误对话框把失败传进来（只取码写进补充说明）。 */
  const openReport = useCallback((failure) => {
    onDismissNotice?.();
    setInitialNotes(reportProblemNotes(failure));
    setOpen(true);
  }, [onDismissNotice]);

  const close = useCallback(() => setOpen(false), []);

  return {
    available: isBugReportAvailable(),
    openReport,
    close,
    /** 直接摊给 `<BugReportDialog>`（`onNotify` 由窗口自己给：它知道该往哪个 chat 发提示）。 */
    dialogProps: { open, onClose: close, initialNotes },
  };
}
