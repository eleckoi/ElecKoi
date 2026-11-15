import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { ELECKOI_FAILURE_CODES } from "@shared/contracts/errors/codes";
import { DesktopError } from "@shared/foundation/DesktopError";
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import '../../../ui/styles/product-dialogs.css';
import { OfficialMarkdown } from '../../../ui/messages/OfficialMarkdown.jsx';
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { resolveFailure } from "../../../utils/failureText.js";

const VISIBLE_PHASES = new Set(["available", "downloading", "verifying", "ready", "installing", "error"]);

export function AppUpdateController({ updates }) {
  return globalThis.__ELECKOI_CLIENT_PLATFORM__?.kind === 'android' ? <AndroidAppUpdateController updates={updates} /> : null;
}

function AndroidAppUpdateController({ updates }) {
  const tUi = useProductTranslation();
  const status = updates?.status ?? null;
  const android = globalThis.__ELECKOI_CLIENT_PLATFORM__?.kind === 'android';
  const [dismissedKey, setDismissedKey] = useState("");
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    if (status?.phase !== "error") setActionError("");
  }, [status?.phase, updates?.dialogRequest]);

  const dialogRequest = updates?.dialogRequest;
  const explicitlyRequested = dialogRequest?.version === status?.availableVersion && dialogRequest?.phase === status?.phase;
  const dialogKey = status?.availableVersion ? `${status.phase}:${status.availableVersion}:${dialogRequest?.id ?? 0}` : "";
  const open = Boolean(
    status?.availableVersion
    && VISIBLE_PHASES.has(status.phase)
    && dismissedKey !== dialogKey
    && !(android && status.phase === 'error' && !status.manualCheck && !explicitlyRequested)
  );

  const close = useCallback(() => {
    if (!dialogKey || status?.phase === "installing") return;
    setDismissedKey(dialogKey);
    setActionError("");
  }, [dialogKey, status?.phase]);

  const download = useCallback(async () => {
    setActionError("");
    try {
      if (status?.failedOperation === 'check') await updates?.check?.();
      else await updates?.download?.();
    } catch (error) {
      setActionError(resolveFailure(error, { fallback: tUi("下载更新失败，请稍后重试。") }).text);
    }
  }, [updates, status?.failedOperation]);

  const install = useCallback(async () => {
    setActionError("");
    try {
      const result = await updates?.install?.();
      if (!result) throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleNotReady, "更新服务暂时不可用。", { what: "更新服务" });
      if (!result.accepted) {
        setActionError(result.reason === "agent_running"
          ? tUi("当前仍有回复正在生成，请停止生成后再重启更新。")
          : tUi("更新尚未下载完成，请稍后再试。")
        );
      }
    } catch (error) {
      setActionError(resolveFailure(error, { fallback: tUi("无法启动安装，请稍后重试。") }).text);
    }
  }, [updates]);

  if (!open) return null;
  return (
    <UpdateDialog
      status={status}
      actionError={actionError}
      onClose={close}
      onDownload={download}
      onInstall={install}
    />
  );
}

function UpdateDialog({ status, actionError, onClose, onDownload, onInstall }) {
  const tUi = useProductTranslation();
  const android = globalThis.__ELECKOI_CLIENT_PLATFORM__?.kind === 'android';
  const descriptionId = useId();
  const installing = status.phase === "installing";
  const downloading = status.phase === "downloading";
  const verifying = status.phase === "verifying";
  const busy = downloading || verifying;
  const ready = status.phase === "ready";
  const failed = status.phase === "error";
  const retryInstall = failed && status.failedOperation === 'install';
  const progressPercent = Math.round(status.progress?.percent ?? 0);
  const title = installing ? tUi("正在更新") : verifying ? tUi("正在校验") : downloading ? tUi("正在下载") : failed ? tUi("更新失败") : tUi("版本就绪");
  const releaseUrl = android ? status.releaseUrl : `https://github.com/eleckoi/ElecKoi/releases/tag/${encodeURIComponent(`v${status.availableVersion}`)}`;
  const description = useMemo(() => {
    if (installing) return tUi("正在重启并安装更新…");
    if (ready) return tUi("更新已下载，重启后即可完成安装。");
    if (verifying) return tUi("正在校验下载内容，请稍候。");
    if (downloading) return status.message || tUi("正在后台下载更新{value0}", {value0: progressPercent > 0 ? ` · ${progressPercent}%` : "…"});
    if (failed) return status.message || tUi("更新失败，请稍后重试。");
    if (android) return tUi("前往下载 APK，下载后由系统确认安装。");
    return tUi("新版本已准备好，下载期间仍可继续使用 ElecKoi。");
  }, [android, downloading, failed, installing, progressPercent, ready, verifying, status.message, tUi]);



  return <Modal open title={`v${status.availableVersion} ${title}`} closeLabel={tUi('关闭')} onClose={() => { if (!installing) onClose(); }}
    className="product-dialog app-update-modal" contentClassName="product-dialog-content" footer={<div className="product-dialog-actions">
            <Button variant="outline" type="button" disabled={installing} onClick={onClose}>
              {busy ? tUi("隐藏") : ready ? tUi("稍后重启") : tUi("稍后")}
            </Button>
            <Button variant="primary"
              type="button"
              disabled={busy || installing}
              onClick={ready || retryInstall ? onInstall : onDownload}
            >
              {installing
                ? tUi("正在重启")
                : verifying
                  ? tUi("正在校验")
                : downloading
                  ? tUi("下载中 {value0}%", {value0: progressPercent})
                  : ready
                    ? tUi("重启并更新")
                    : failed
                      ? retryInstall ? tUi("重试安装") : status.failedOperation === 'check' ? tUi("重新检查") : tUi("重新下载")
                      : android ? tUi("前往下载") : tUi("下载更新")}
            </Button>
          </div>}>
      <div className="app-update-body">
        <a className="app-update-release-link" href={releaseUrl} target="_blank" rel="noopener noreferrer">{tUi('前往下载')}</a>
        <section className="app-update-notes-section" aria-label={tUi("本次更新")} tabIndex={0}>
          <div className="app-update-notes">
            <OfficialMarkdown content={status.releaseNotes || status.releaseName || tUi("包含稳定性改进和问题修复。")} />
          </div>
        </section>

        <footer className="app-update-footer">
          {busy ? <div className="app-update-download-progress">
            <div className="app-update-progress" role="progressbar" aria-label={tUi("更新下载进度")}
              aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent}>
              <i style={{ width: `${progressPercent}%` }} />
            </div>
            <span>{progressPercent}%</span>
          </div> : null}
          <p id={descriptionId} className="app-update-status" role={failed ? "alert" : "status"}>{description}</p>
          <span>
            {tUi("当前版本 v")}{status.currentVersion}
            {status.downloadSizeBytes ? tUi(" · 约 {value0}", {value0: formatBytes(status.downloadSizeBytes)}) : ""}
          </span>
          {actionError ? <p className="app-update-error" role="alert">{actionError}</p> : null}

        </footer>
      </div>
    </Modal>;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const megabytes = bytes / (1024 * 1024);
  return megabytes >= 10 ? `${Math.round(megabytes)} MB` : `${megabytes.toFixed(1)} MB`;
}
