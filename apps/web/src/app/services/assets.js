import { LOCAL_MEDIA_SCHEME } from "@shared/foundation/mediaReference";

export async function initRendererAssets() {
  return undefined;
}

export function assetSrc(src) {
  return assetFetchSrc(src) || "";
}

/** Resolve durable media only in the render copy; saved Markdown keeps its original references. */
export function resolveMarkdownMedia(markdown) {
  if (!markdown?.includes(`${LOCAL_MEDIA_SCHEME}://`)) return markdown;
  return markdown.split(/(`{3,}[\s\S]*?`{3,}|~{3,}[\s\S]*?~{3,}|`[^`\n]*`)/g).map((part, index) => index % 2 ? part
    : part.replace(/(!?\[[^\]\n]*\]\(\s*<?)(eleckoi-media:\/\/[^\s)>]+)(>?)/g,
      (_match, start, reference, end) => `${start}${assetFetchSrc(reference)}${end}`)).join('');
}

export function assetFetchSrc(src) {
  if (!src || typeof document === "undefined" || document.documentElement.dataset.eleckoiMobile !== "true") return src;
  if (new URL(src, window.location.href).protocol !== `${LOCAL_MEDIA_SCHEME}:`) return src;
  const url = new URL("/eleckoi/media/asset", window.location.href);
  url.searchParams.set("reference", src);
  return url.href;
}
