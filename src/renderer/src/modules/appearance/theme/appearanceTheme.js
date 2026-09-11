import {
  Hct,
  MaterialDynamicColors,
  QuantizerCelebi,
  SchemeContent,
  SchemeMonochrome,
  Score,
  hexFromArgb,
} from "@material/material-color-utilities";

const THEME_VARIABLES = [
  "--title-fg", "--title-logo-filter", "--shell-backdrop", "--rail", "--rail-fg", "--list",
  "--chat", "--active", "--blue", "--blue-hover", "--control-bg", "--control-bg-hover",
  "--bubble-bg", "--bubble-fg", "--bubble-fg-shadow", "--bubble-blue", "--bubble-white",
  "--glass-bg", "--glass-bg-strong", "--glass-border", "--chat-header-fg",
  "--chat-header-fg-shadow", "--composer-icon-fg", "--composer-icon-shadow",
];

const DEFAULT_THEME = {
  titleFg: "#111111", titleLogoFilter: "none", shellBackdrop: "#ffffff", rail: "#f0f3f6",
  railFg: "#252525", list: "#f0f3f6", chat: "#ffffff", active: "rgba(38, 49, 72, 0.06)",
  blue: "#13a8ff", blueHover: "#079cf0", controlBg: "#ebebeb", controlBgHover: "#e2e2e2",
  bubbleBg: "#ffffff", bubbleFg: "#181818", bubbleFgShadow: "rgba(255, 255, 255, 0.18)",
  bubbleBlue: "#cdeeff", bubbleWhite: "#ffffff", glassBg: "rgba(255, 255, 255, 0.56)",
  glassBgStrong: "rgba(255, 255, 255, 0.72)", glassBorder: "rgba(255, 255, 255, 0.62)",
  chatHeaderFg: "#111111", chatHeaderFgShadow: "rgba(255, 255, 255, 0.22)",
  composerIconFg: "#111111", composerIconShadow: "rgba(255, 255, 255, 0.22)",
};

const SAMPLE_MAX = 144;
const GRID_COLS = 4;
const GRID_ROWS = 6;
const QUANTIZE_MAX = 128;
const FALLBACK_SEED = 0xff4285f4 | 0;

function clamp(value, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片读取失败，请换一张图片试试。"));
    image.src = src;
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("图片读取失败，请换一张图片试试。"));
    reader.readAsDataURL(file);
  });
}

const srgbToLinear = (channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
const linearToSrgb = (channel) => channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;

function linearToOklab(r, g, b) {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const L = Math.cbrt(l);
  const M = Math.cbrt(m);
  const S = Math.cbrt(s);
  return {
    l: 0.2104542553 * L + 0.793617785 * M - 0.0040720468 * S,
    a: 1.9779984951 * L - 2.428592205 * M + 0.4505937099 * S,
    b: 0.0259040371 * L + 0.7827717662 * M - 0.808675766 * S,
  };
}

function oklabToLinear({ l, a, b }) {
  const L = l + 0.3963377774 * a + 0.2158037573 * b;
  const M = l - 0.1055613458 * a - 0.0638541728 * b;
  const S = l - 0.0894841775 * a - 1.291485548 * b;
  const lc = L ** 3;
  const mc = M ** 3;
  const sc = S ** 3;
  return [
    4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc,
    -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc,
    -0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc,
  ];
}

function oklabOf(r, g, b) {
  return linearToOklab(srgbToLinear(r / 255), srgbToLinear(g / 255), srgbToLinear(b / 255));
}

function inGamut(lab) {
  return oklabToLinear(lab).every((value) => value >= -0.0015 && value <= 1.0015);
}

function oklch(tone, chroma, hue) {
  const l = clamp(tone);
  const at = (nextChroma) => ({ l, a: Math.cos(hue) * nextChroma, b: Math.sin(hue) * nextChroma });
  let nextChroma = Math.max(0, chroma);
  if (!inGamut(at(nextChroma))) {
    let low = 0;
    let high = nextChroma;
    for (let index = 0; index < 14; index += 1) {
      const middle = (low + high) / 2;
      if (inGamut(at(middle))) low = middle;
      else high = middle;
    }
    nextChroma = low;
  }
  return oklabToLinear(at(nextChroma)).map((value) => Math.round(clamp(linearToSrgb(value)) * 255));
}

function rgbToHex(rgb) {
  return `#${rgb.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function parseHex(value) {
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ];
}

function rgba(value, alpha) {
  return `rgba(${parseHex(value).join(", ")}, ${clamp(alpha).toFixed(3)})`;
}

function luminanceRgb([r, g, b]) {
  return 0.2126 * srgbToLinear(r / 255) + 0.7152 * srgbToLinear(g / 255) + 0.0722 * srgbToLinear(b / 255);
}

function luminance(value) {
  return luminanceRgb(parseHex(value));
}

function contrast(left, right) {
  const a = luminance(left);
  const b = luminance(right);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function ensureContrast(foreground, background, ratio) {
  if (contrast(foreground, background) >= ratio) return foreground;
  const lab = oklabOf(...parseHex(foreground));
  const chroma = Math.hypot(lab.a, lab.b);
  const hue = Math.atan2(lab.b, lab.a);
  const step = luminance(background) > 0.32 ? -0.02 : 0.02;
  let best = foreground;
  let bestRatio = contrast(foreground, background);
  let tone = lab.l;
  for (let index = 0; index < 52; index += 1) {
    tone += step;
    if (tone < 0 || tone > 1) continue;
    const candidate = rgbToHex(oklch(tone, chroma, hue));
    const candidateRatio = contrast(candidate, background);
    if (candidateRatio > bestRatio) {
      best = candidate;
      bestRatio = candidateRatio;
    }
    if (candidateRatio >= ratio) return candidate;
  }
  return best;
}

function readImage(image, crop = null) {
  const sourceWidth = crop ? crop.width : image.naturalWidth;
  const sourceHeight = crop ? crop.height : image.naturalHeight;
  const scale = Math.min(1, SAMPLE_MAX / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("当前环境无法读取图片颜色。");
  if (crop) context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
  else context.drawImage(image, 0, 0, width, height);

  const data = context.getImageData(0, 0, width, height).data;
  const opaquePixels = new Int32Array(width * height);
  let opaqueCount = 0;
  const buckets = new Map();
  const cellLuminance = new Float64Array(GRID_COLS * GRID_ROWS);
  const cellA = new Float64Array(GRID_COLS * GRID_ROWS);
  const cellB = new Float64Array(GRID_COLS * GRID_ROWS);
  const cellCount = new Int32Array(GRID_COLS * GRID_ROWS);

  for (let y = 0; y < height; y += 1) {
    const gridY = Math.min(GRID_ROWS - 1, Math.floor((y / height) * GRID_ROWS));
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (data[offset + 3] < 180) continue;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      opaquePixels[opaqueCount] = ((0xff << 24) | (r << 16) | (g << 8) | b) | 0;
      opaqueCount += 1;
      const lab = oklabOf(r, g, b);
      const gridX = Math.min(GRID_COLS - 1, Math.floor((x / width) * GRID_COLS));
      const cellIndex = gridY * GRID_COLS + gridX;
      cellLuminance[cellIndex] += luminanceRgb([r, g, b]);
      cellA[cellIndex] += lab.a;
      cellB[cellIndex] += lab.b;
      cellCount[cellIndex] += 1;
      const lq = clamp(Math.round(lab.l * 31), 0, 31);
      const aq = clamp(Math.round(lab.a * 128), -63, 63);
      const bq = clamp(Math.round(lab.b * 128), -63, 63);
      const key = ((lq * 128) + (aq + 64)) * 128 + (bq + 64);
      const bucket = buckets.get(key) || [0, 0, 0, 0];
      bucket[0] += lab.l;
      bucket[1] += lab.a;
      bucket[2] += lab.b;
      bucket[3] += 1;
      buckets.set(key, bucket);
    }
  }
  if (!opaqueCount) return null;
  const samples = [...buckets.values()].map((bucket) => ({
    l: bucket[0] / bucket[3], a: bucket[1] / bucket[3], b: bucket[2] / bucket[3], weight: bucket[3],
  }));
  const cells = [];
  for (let index = 0; index < cellLuminance.length; index += 1) {
    const count = cellCount[index];
    cells.push({
      x: ((index % GRID_COLS) + 0.5) / GRID_COLS,
      y: (Math.floor(index / GRID_COLS) + 0.5) / GRID_ROWS,
      luminance: count ? cellLuminance[index] / count : 0.5,
      a: count ? cellA[index] / count : 0,
      b: count ? cellB[index] / count : 0,
    });
  }
  return { samples, cells, pixels: opaquePixels.subarray(0, opaqueCount) };
}

function choosePolarity(reading) {
  let darkMass = 0;
  let lightMass = 0;
  let luminance = 0;
  let weight = 0;
  for (const sample of reading.samples) {
    if (sample.l < 0.45) darkMass += sample.weight;
    if (sample.l > 0.72) lightMass += sample.weight;
    luminance += sample.l * sample.weight;
    weight += sample.weight;
  }
  const dark = darkMass > lightMass * 1.15
    ? true
    : lightMass > darkMass * 1.15
      ? false
      : luminance / Math.max(weight, 1) < 0.52;
  return { dark };
}

function pickSeed(reading) {
  if (!reading.pixels?.length) return { argb: FALLBACK_SEED, achromatic: true };
  const counts = QuantizerCelebi.quantize(reading.pixels, QUANTIZE_MAX);
  if (!counts.size) return { argb: FALLBACK_SEED, achromatic: true };
  const top = Score.score(counts)[0] ?? FALLBACK_SEED;
  if (counts.has(top)) return { argb: top, achromatic: false };
  const dominant = [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? FALLBACK_SEED;
  return { argb: dominant, achromatic: true };
}

function buildTheme(seed, polarity) {
  const Scheme = seed.achromatic ? SchemeMonochrome : SchemeContent;
  const scheme = new Scheme(Hct.fromInt(seed.argb), polarity.dark, 0);
  const role = (name) => hexFromArgb(MaterialDynamicColors[name].getArgb(scheme));
  const dark = polarity.dark;
  const onSurface = role("onSurface");
  const theme = {
    isDark: dark, seedHex: hexFromArgb(seed.argb), bg: role("surfaceContainer"),
    pinned: role("secondaryContainer"), surface: role("surfaceContainerLow"), text: onSurface,
    muted: role("onSurfaceVariant"), soft: role("outline"), line: role("outlineVariant"),
    searchBg: role("surfaceContainerHighest"), tabbarBg: role("surfaceContainerHigh"),
    chatBg: role("surfaceContainer"), messageBg: role("surfaceContainerHighest"), messageFg: onSurface,
    userBg: role("secondaryContainer"), userFg: role("onSecondaryContainer"),
    composerBg: role("surfaceContainerHigh"), accent: role("primary"), accentFg: role("onPrimary"),
  };
  theme.text = ensureContrast(theme.text, theme.pinned, 4.5);
  theme.muted = ensureContrast(theme.muted, theme.pinned, 4);
  return theme;
}

function centerCrop(image, aspect) {
  let width = image.naturalWidth;
  let height = Math.round(width / aspect);
  if (height > image.naturalHeight) {
    height = image.naturalHeight;
    width = Math.round(height * aspect);
  }
  return {
    x: Math.round((image.naturalWidth - width) / 2),
    y: Math.round((image.naturalHeight - height) / 2),
    width,
    height,
  };
}

export function applyAppearanceTheme(theme) {
  const root = document.documentElement;
  if (!theme?.colors) {
    for (const name of THEME_VARIABLES) root.style.removeProperty(name);
    return;
  }
  const colors = { ...DEFAULT_THEME, ...theme.colors };
  const values = {
    "--title-fg": colors.titleFg, "--title-logo-filter": colors.titleLogoFilter,
    "--shell-backdrop": colors.shellBackdrop, "--rail": colors.rail, "--rail-fg": colors.railFg,
    "--list": colors.list, "--chat": colors.chat, "--active": colors.active, "--blue": colors.blue,
    "--blue-hover": colors.blueHover, "--control-bg": colors.controlBg, "--control-bg-hover": colors.controlBgHover,
    "--bubble-bg": colors.bubbleBg, "--bubble-fg": colors.bubbleFg,
    "--bubble-fg-shadow": colors.bubbleFgShadow, "--bubble-blue": colors.bubbleBlue,
    "--bubble-white": colors.bubbleWhite, "--glass-bg": colors.glassBg,
    "--glass-bg-strong": colors.glassBgStrong, "--glass-border": colors.glassBorder,
    "--chat-header-fg": colors.chatHeaderFg, "--chat-header-fg-shadow": colors.chatHeaderFgShadow,
    "--composer-icon-fg": colors.composerIconFg, "--composer-icon-shadow": colors.composerIconShadow,
  };
  for (const [name, value] of Object.entries(values)) root.style.setProperty(name, value);
}

export async function createAppearanceThemeFromImageSource(dataUrl, source = {}) {
  const paletteImage = await loadImage(source.paletteDataUrl || dataUrl);
  const displayImage = source.paletteDataUrl ? await loadImage(dataUrl) : paletteImage;
  const paletteReading = readImage(paletteImage);
  const crop = source.crop || centerCrop(displayImage, 45 / 77);
  const displayReading = readImage(displayImage, crop) || paletteReading;
  if (!paletteReading || !displayReading) throw new Error("这张图片没有可用于取色的不透明像素。");
  const polarity = choosePolarity(displayReading);
  const seed = pickSeed(paletteReading);
  const generated = buildTheme(seed, polarity);
  const colors = {
    titleFg: generated.text, titleLogoFilter: "none", shellBackdrop: generated.bg,
    rail: generated.surface, railFg: generated.text, list: generated.surface, chat: generated.chatBg,
    active: generated.pinned, blue: generated.accent, blueHover: generated.accent,
    controlBg: generated.searchBg, controlBgHover: generated.tabbarBg,
    bubbleBg: generated.messageBg, bubbleFg: generated.messageFg,
    bubbleFgShadow: generated.isDark ? "rgba(0, 0, 0, 0.28)" : "rgba(255, 255, 255, 0.18)",
    bubbleBlue: generated.userBg, bubbleWhite: generated.messageBg,
    glassBg: rgba(generated.composerBg, generated.isDark ? 0.74 : 0.66),
    glassBgStrong: rgba(generated.composerBg, generated.isDark ? 0.86 : 0.78),
    glassBorder: rgba(generated.line, generated.isDark ? 0.46 : 0.58),
    chatHeaderFg: generated.text,
    chatHeaderFgShadow: generated.isDark ? "rgba(0, 0, 0, 0.3)" : "rgba(255, 255, 255, 0.32)",
    composerIconFg: generated.text,
    composerIconShadow: generated.isDark ? "rgba(0, 0, 0, 0.3)" : "rgba(255, 255, 255, 0.32)",
  };
  return {
    version: 2,
    mode: generated.isDark ? "deep" : "light",
    seed: generated.seedHex,
    source: { name: source.name || "theme-image", size: source.size || dataUrl.length, type: source.type || "image/png", crop },
    colors,
    created_at: new Date().toISOString(),
  };
}

export async function createAppearanceThemeFromFile(file) {
  const dataUrl = await readFileAsDataUrl(file);
  return createAppearanceThemeFromImageSource(dataUrl, { name: file.name, size: file.size, type: file.type });
}
