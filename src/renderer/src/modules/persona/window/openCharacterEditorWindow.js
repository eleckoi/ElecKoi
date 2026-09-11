const CHARACTER_EDITOR_LABEL = "character-editor";

export function openCharacterEditorWindow(characterId) {
  const id = String(characterId || "").trim();
  if (!id) return;

  const editorUrl = new URL(window.location.href);
  editorUrl.search = `?view=character-editor&character=${encodeURIComponent(id)}`;
  window.open(
    editorUrl.toString(),
    `${CHARACTER_EDITOR_LABEL}-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`,
    "width=1520,height=1120",
  );
}
