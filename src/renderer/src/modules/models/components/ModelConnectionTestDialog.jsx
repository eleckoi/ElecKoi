import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { CheckCircle, CircleNotch, XCircle } from "@phosphor-icons/react";
import { XIcon } from "../../../ui/icons/index.jsx";

const FOCUSABLE = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

function StatusMark({ status }) {
  if (status === "running") return <CircleNotch className="running" size={19} weight="bold" aria-hidden="true" />;
  if (status === "passed") return <CheckCircle className="passed" size={20} weight="fill" aria-hidden="true" />;
  if (status === "failed") return <XCircle className="failed" size={20} weight="fill" aria-hidden="true" />;
  return <span className="pending" aria-hidden="true" />;
}

export function ModelConnectionTestDialog({ state, onDismiss }) {
  const dialogRef = useRef(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!state) return undefined;
    const previousFocus = document.activeElement;
    const dialog = dialogRef.current;
    dialog?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onDismissRef.current?.();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const controls = [...dialog.querySelectorAll(FOCUSABLE)];
      if (!controls.length) {
        event.preventDefault();
        return;
      }
      const first = controls[0];
      const last = controls[controls.length - 1];
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
      window.removeEventListener("keydown", handleKeyDown);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [state?.openedAt]);

  if (!state) return null;

  const message = state.completionMessage || (
    state.finished
      ? state.formatFallbackSuggested
        ? "当前接口格式未通过测试，请尝试其他接口格式。"
        : "这个配置支持完整工具调用，可以用于 Agent。"
      : "正在按当前接口格式验证连接和工具调用。"
  );

  return createPortal(
    <div className="model-connection-test-overlay" onMouseDown={onDismiss}>
      <section
        className="model-connection-test-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="model-connection-test-title"
        aria-describedby="model-connection-test-message"
        aria-busy={!state.finished}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <h2 id="model-connection-test-title">测试连接</h2>
            <p>{state.modelLabel || "未选择模型"}</p>
          </div>
          <button type="button" aria-label="关闭测试连接弹窗" onClick={onDismiss}><XIcon /></button>
        </header>

        <ol className="model-connection-test-steps">
          {state.steps.map((step) => (
            <li className={step.status} key={step.id}>
              <StatusMark status={step.status} />
              <div>
                <span>{step.label}{step.hint ? <small>{step.hint}</small> : null}</span>
                {step.detail ? <p>{step.detail}</p> : null}
              </div>
            </li>
          ))}
        </ol>

        <p className={`model-connection-test-message${state.failed ? " failed" : ""}`} id="model-connection-test-message" role="status" aria-live="polite">
          {message}
        </p>

        <button className="model-connection-test-done" type="button" onClick={onDismiss}>
          {state.finished ? "完成" : "后台继续检测"}
        </button>
      </section>
    </div>,
    document.body,
  );
}
