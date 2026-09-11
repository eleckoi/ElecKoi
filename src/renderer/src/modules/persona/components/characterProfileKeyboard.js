const EDITABLE_TARGET_SELECTOR = [
  "input",
  "textarea",
  "select",
  "[contenteditable]:not([contenteditable='false'])",
  "[role='textbox']",
  "[role='combobox']",
].join(",");

const BLOCKING_OVERLAY_SELECTOR = [
  "dialog[open]",
  "[aria-modal='true']",
  "[role='dialog']",
  ".character-manager-overlay",
].join(",");

export function characterDeckKeyDirection(event, overlayOpen = false) {
  if (
    overlayOpen
    || event.defaultPrevented
    || event.isComposing
    || event.altKey
    || event.ctrlKey
    || event.metaKey
    || event.target?.closest?.(EDITABLE_TARGET_SELECTOR)
  ) return 0;

  if (event.key === "ArrowLeft") return -1;
  if (event.key === "ArrowRight") return 1;
  return 0;
}

export function hasBlockingCharacterOverlay(documentRef) {
  return Boolean(documentRef?.querySelector?.(BLOCKING_OVERLAY_SELECTOR));
}

export function preventPointerFocus(event) {
  event.preventDefault();
}
