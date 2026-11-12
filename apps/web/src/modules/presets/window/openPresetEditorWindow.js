const SECTIONS = new Set(['profile', 'prompts', 'tools', 'regex', 'scripts']);

export function openPresetEditorWindow(presetId, section = 'profile') {
  const id = String(presetId || '').trim();
  if (!id) return;
  const url = new URL(window.location.href);
  url.search = new URLSearchParams({ view: 'preset-editor', preset: id, section: SECTIONS.has(section) ? section : 'profile' }).toString();
  window.open(url.toString(), `preset-editor-${encodeURIComponent(id)}`, 'width=1520,height=1120');
}
