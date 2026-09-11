import { useEffect, useState } from "react";

export function ChatWaitingReply() {
  const [startedAt] = useState(() => Date.now());
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const tick = () => setElapsedMs(Math.max(0, Date.now() - startedAt));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  return (
    <div className="chat-waiting-reply" role="status" aria-live="polite">
      <span className="chat-waiting-shimmer">Deep diving...</span>
      {elapsedMs >= 15_000 ? (
        <span className="chat-waiting-clock" aria-hidden="true">
          {formatRunDuration(elapsedMs)}
        </span>
      ) : null}
    </div>
  );
}

function formatRunDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0 ? `${minutes}分${String(seconds).padStart(2, "0")}秒` : `${seconds}秒`;
}
