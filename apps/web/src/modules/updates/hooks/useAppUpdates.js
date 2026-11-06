import { ELECKOI_FAILURE_CODES } from "@shared/contracts/errors/codes";
import { DesktopError } from "@shared/foundation/DesktopError";
import { useCallback, useEffect, useMemo, useState } from "react";
import { resolveFailure } from "../../../utils/failureText.js";
const updateService = android => android ? window.ElecKoiPlatform?.updates : window.dshDesktop?.updates;
export function useAppUpdates() {
  const android = globalThis.__ELECKOI_CLIENT_PLATFORM__?.kind === "android";
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [dialogRequest, setDialogRequest] = useState(null);
  const requestDialog = useCallback((nextStatus) => {
    setDialogRequest(previous => ({
      id: (previous?.id ?? 0) + 1,
      version: nextStatus?.availableVersion,
      phase: nextStatus?.phase,
    }));
  }, []);
  const showDialog = useCallback(() => {
    if (android) requestDialog(status);
    else void updateService(false)?.open(document.documentElement.lang, false).catch(cause => {
      setError(resolveFailure(cause, { fallback: "更新服务暂时不可用。" }).text);
    });
  }, [android, requestDialog, status]);

  useEffect(() => {
    let active = true;
    let connected, unsubscribe;
    const attach = () => {
      const updates = updateService(android);
      if (!updates) { if (!android) setError("更新服务暂时不可用。"); return; }
      if (connected === updates) return;
      unsubscribe?.(); connected = updates;
      unsubscribe = updates.subscribe((nextStatus) => {
        if (!active) return;
        setStatus(nextStatus);
        setError("");
      });
      void updates.status().then((nextStatus) => {
        if (!active) return;
        setStatus(nextStatus);
        setError("");
      }).catch((cause) => {
        if (active) setError(resolveFailure(cause, { fallback: "无法读取版本信息。" }).text);
      });
    };
    if (android) window.addEventListener('eleckoi:platform-ready', attach);
    attach();
    return () => {
      active = false;
      unsubscribe?.();
      window.removeEventListener('eleckoi:platform-ready', attach);
    };
  }, [android]);

  const requestStatus = useCallback(async (request) => {
    setError("");
    try {
      const nextStatus = await request();
      setStatus(nextStatus);
      return nextStatus;
    } catch (cause) {
      setError(resolveFailure(cause, { fallback: "更新服务暂时不可用。" }).text);
      throw cause;
    }
  }, []);

  const check = useCallback(async () => {
    const nextStatus = await requestStatus(() => {
      const updates = updateService(android);
      if (!updates) throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleNotReady, "更新服务暂时不可用。", { what: "更新服务" });
      return android ? updates.check() : updates.open(document.documentElement.lang, true);
    });
    requestDialog(nextStatus);
    return nextStatus;
  }, [android, requestDialog, requestStatus]);
  const download = useCallback(() => requestStatus(() => {
    const updates = updateService(android);
    if (!updates) throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleNotReady, "更新服务暂时不可用。", { what: "更新服务" });
    return updates.download();
  }), [android, requestStatus]);
  const install = useCallback(async () => {
    setError("");
    try {
      const updates = updateService(android);
      if (!updates?.install) throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleNotReady, "更新安装服务暂时不可用。", { what: "更新安装服务" });
      return await updates.install();
    } catch (cause) {
      setError(resolveFailure(cause, { fallback: "无法启动安装。" }).text);
      throw cause;
    }
  }, [android]);

  return useMemo(() => ({ status, error, check, download, install, showDialog, dialogRequest }),
    [check, download, error, install, showDialog, dialogRequest, status]);
}
