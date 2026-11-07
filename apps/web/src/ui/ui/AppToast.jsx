import React from "react";
import { AppErrorDialog } from "./AppErrorDialog.jsx";

export function AppToast({ notice, onDismiss, onReportProblem }) {
  if (!notice?.message) return null;
  if (notice.type === "error") {
    return <AppErrorDialog notice={notice} onDismiss={onDismiss} onReportProblem={onReportProblem} />;
  }

  return (
    <div className={`app-toast ${notice.type || "info"}`} role="status" aria-live="polite">
      <span className="app-toast-icon" aria-hidden="true" />
      <span>{notice.message}</span>
    </div>
  );
}
