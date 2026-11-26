export function conversationPreviewText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}
