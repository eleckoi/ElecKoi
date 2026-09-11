function previousUserIndex(items, beforeIndex) {
  for (let index = beforeIndex - 1; index >= 0; index -= 1) {
    if (items[index]?.role === "user") return index;
  }
  return -1;
}

export function findRegenerateBranchUserIndex(items, targetMessageId = "", editingUserInput = false) {
  const targetId = String(targetMessageId || "").trim();
  if (!targetId) return -1;
  const targetIndex = items.findIndex((item) => item?.id === targetId);
  if (targetIndex < 0) return -1;
  if (items[targetIndex]?.role === "assistant") return previousUserIndex(items, targetIndex);
  if (items[targetIndex]?.role === "user" && editingUserInput) return targetIndex;
  return -1;
}
