export function AddGroupDialog({ title = "添加分组", value, onChange, onConfirm, onCancel }) {
  return (
    <div className="character-group-dialog-backdrop">
      <form
        className="character-group-dialog"
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm();
        }}
      >
        <h3>{title}</h3>
        <input value={value} onChange={(event) => onChange(event.target.value)} placeholder="填写分组" autoFocus />
        <div>
          <button className="character-dialog-confirm" type="submit" disabled={!value.trim()}>
            确定
          </button>
          <button type="button" onClick={onCancel}>
            取消
          </button>
        </div>
      </form>
    </div>
  );
}
