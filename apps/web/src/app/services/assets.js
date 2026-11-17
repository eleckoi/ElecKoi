import { LOCAL_MEDIA_SCHEME } from "@shared/foundation/mediaReference";

export async function initRendererAssets() {
  return undefined;
}

export function assetSrc(src) {
  return assetFetchSrc(src) || "";
}

export function avatarSources(src) {
  if (!src || !src.startsWith(`${LOCAL_MEDIA_SCHEME}://asset/v1/`)) return { src: assetSrc(src) };
  const reference = new URL(src);
  if (reference.search || reference.hash) return { src: assetSrc(src) };
  const thumbnail = size => {
    const url = new URL(reference.href);
    url.searchParams.set('thumbnail', String(size));
    return assetSrc(url.href);
  };
  return { src: thumbnail(256), srcSet: `${thumbnail(256)} 1x, ${thumbnail(512)} 2x` };
}

/** Cover renditions follow the displayed long edge at each device pixel density. */
export function coverSources(src, width, ratio = 1) {
  if (!src || !src.startsWith(`${LOCAL_MEDIA_SCHEME}://asset/v1/`)) return { src: assetSrc(src) };
  const reference = new URL(src);
  if (reference.search || reference.hash) return { src: assetSrc(src) };
  const edge = Math.max(width, width / ratio);
  const sizes = [256, 512, 1024, 2048];
  const rendition = density => {
    const size = sizes.find(value => value >= edge * density);
    if (!size) return assetSrc(src);
    const url = new URL(src); url.searchParams.set('thumbnail', String(size)); return assetSrc(url.href);
  };
  return { src: rendition(1), srcSet: `${rendition(1)} 1x, ${rendition(2)} 2x, ${rendition(3)} 3x` };
}

export function assetFetchSrc(src) {
  if (!src || typeof document === "undefined" || document.documentElement.dataset.eleckoiMobile !== "true") return src;
  if (new URL(src, window.location.href).protocol !== `${LOCAL_MEDIA_SCHEME}:`) return src;
  const url = new URL("/eleckoi/media/asset", window.location.href);
  url.searchParams.set("reference", src);
  return url.href;
}
