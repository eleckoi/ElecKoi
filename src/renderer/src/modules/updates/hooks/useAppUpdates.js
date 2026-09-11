import { useCallback, useEffect, useMemo, useState } from "react";
import { desktopClient } from "../../../bridge/desktopClient";

export function useAppUpdates() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const unsubscribe = desktopClient.on("updates.state.changed", (nextStatus) => {
      if (!active) return;
      setStatus(nextStatus);
      setError("");
    });
    void desktopClient.request("query.updates.status", {}).then((nextStatus) => {
      if (!active) return;
      setStatus(nextStatus);
      setError("");
    }).catch((cause) => {
      if (active) setError(cause?.message || "无法读取版本信息。");
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const requestStatus = useCallback(async (route) => {
    setError("");
    try {
      const nextStatus = await desktopClient.request(route, {});
      setStatus(nextStatus);
      return nextStatus;
    } catch (cause) {
      setError(cause?.message || "更新服务暂时不可用。");
      throw cause;
    }
  }, []);

  const check = useCallback(() => requestStatus("command.updates.check"), [requestStatus]);
  const download = useCallback(() => requestStatus("command.updates.download"), [requestStatus]);
  const install = useCallback(async () => {
    setError("");
    try {
      return await desktopClient.request("command.updates.install", {});
    } catch (cause) {
      setError(cause?.message || "无法启动安装。");
      throw cause;
    }
  }, []);

  return useMemo(() => ({ status, error, check, download, install }), [check, download, error, install, status]);
}
