export async function saveSettingLibraryFile(json, suggestedName) {
  // The Android host exposes its own save completion/cancellation contract.
  // Prefer it even when Chromium advertises the browser picker API.
  if (typeof window.ElecKoiPlatform?.saveText === "function") {
    const result = await window.ElecKoiPlatform.saveText(suggestedName, json, "application/json");
    return !result?.cancelled;
  }
  if (typeof window.showSaveFilePicker === "function") {
    const handle = await window.showSaveFilePicker({
      suggestedName,
      types: [{ description: "ElecKoi 设定库", accept: { "application/json": [".json"] } }],
    });
    const writer = await handle.createWritable();
    await writer.write(json);
    await writer.close();
    return true;
  }
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = suggestedName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
