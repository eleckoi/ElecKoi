export function AppToast({ notice }) {
  if (!notice?.message) return null;

  return (
    <div className={`app-toast ${notice.type || "info"}`} role="status" aria-live="polite">
      <span className="app-toast-icon" aria-hidden="true" />
      <span>{notice.message}</span>
    </div>
  );
}
