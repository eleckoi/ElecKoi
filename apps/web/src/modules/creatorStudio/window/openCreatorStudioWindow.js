/** Open creation in the resident application window. */
export function openCreatorStudioWindow() {
  window.dispatchEvent(new CustomEvent('eleckoi:shell-action', { detail: 'creatorStudio' }));
}
