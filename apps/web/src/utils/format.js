import { productLocaleTag } from '../app/i18n/productCopy.js';
import { sourceText } from "../app/i18n/productCopy.js";
export function firstDefault(items, fallback = "") {
  const list = items || [];
  return list.find((item) => item.default)?.id || fallback || list[0]?.id || "";
}

export function formatDate(value, tUi = sourceText) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(
    productLocaleTag(tUi),
    sameYear ? { month: "2-digit", day: "2-digit" } : { year: "2-digit", month: "2-digit", day: "2-digit" },
  );
}
