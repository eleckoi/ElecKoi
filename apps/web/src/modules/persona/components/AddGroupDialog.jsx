import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { SystemBarOverlay } from '../../../ui/ui/SystemBarOverlay.jsx';
export function AddGroupDialog({ title = "添加分组", value, onChange, onConfirm, onCancel }) {
  return (
    <SystemBarOverlay className="character-group-dialog-backdrop">
      <form
        className="character-group-dialog"
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm();
        }}
      >
        <h3>{title}</h3>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") onCancel();
          }}
          placeholder="填写分组"
          autoFocus
        />
        <div>
          <Button data-dsh-control variant="primary" className="character-dialog-confirm" type="submit" disabled={!value.trim()}>
            确定
          </Button>
          <Button data-dsh-control variant="outline" type="button" onClick={onCancel}>
            取消
          </Button>
        </div>
      </form>
    </SystemBarOverlay>
  );
}
