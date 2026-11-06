import { sourceText } from "../../../app/i18n/productCopy.js";
const labels = {
  off: "关闭",
  minimal: "极低",
  low: "低",
  medium: "中",
  high: "高",
  xhigh: "极高",
  max: "最高",
};

export const reasoningEffortIds = Object.freeze(Object.keys(labels));

export function reasoningEffortLabel(effort, tUi = sourceText) {
  return labels[effort] ? tUi(labels[effort]) : effort;
}

export function reasoningOptions(efforts, defaultLabel = "跟随提供方默认", tUi = sourceText) {
  if (!efforts?.length) return [{ id: "", label: tUi("未声明推理能力") }];
  return [
    { id: "", label: tUi(defaultLabel) },
    ...efforts.map((id) => ({ id, label: reasoningEffortLabel(id, tUi) })),
  ];
}
