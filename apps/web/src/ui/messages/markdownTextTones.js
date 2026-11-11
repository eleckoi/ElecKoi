const DIALOGUE_QUOTE_PATTERN = /("[^"\n]*?")|(“[^”\n]*?”)|(«[^»\n]*?»)|(「[^」\n]*?」)|(『[^』\n]*?』)|(＂[^＂\n]*?＂)/g;
const FENCE_PATTERN = /^[ \t]{0,3}(`{3,}|~{3,})([^\r\n]*)$/;
const UNDERLINE_TAG_PATTERN = /^<(\/?)u\s*>/i;
const HIGHLIGHT_NAMES = Object.freeze({
  quote: "eleckoi-roleplay-quote",
  underline: "eleckoi-roleplay-underline",
});
const HIGHLIGHT_STYLE_ID = "eleckoi-markdown-text-tone-highlights";
const EMPTY_UNDERLINES = Object.freeze([]);

function ensureHighlightStyles(document) {
  if (document.getElementById(HIGHLIGHT_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = HIGHLIGHT_STYLE_ID;
  style.textContent = `
.markdown-message::highlight(${HIGHLIGHT_NAMES.underline}),
.markdown-message *::highlight(${HIGHLIGHT_NAMES.underline}) {
  color: var(--chat-underline-color, currentColor);
  text-decoration-line: underline;
  text-decoration-color: currentColor;
}
.markdown-message::highlight(${HIGHLIGHT_NAMES.quote}),
.markdown-message *::highlight(${HIGHLIGHT_NAMES.quote}) {
  color: var(--chat-quote-color, #4176e6);
}`;
  document.head.append(style);
}

function sourceLines(markdown) {
  const lines = [];
  const pattern = /([^\r\n]*)(\r\n|\r|\n|$)/g;
  for (let match = pattern.exec(markdown); match && (match[0] || match.index < markdown.length); match = pattern.exec(markdown)) {
    lines.push({ text: match[1], start: match.index });
    if (!match[2]) break;
  }
  return lines;
}

function underlinePairs(markdown) {
  const pairs = [];
  let pending = null;
  let fenceCharacter = "";
  let fenceLength = 0;

  for (const line of sourceLines(markdown)) {
    const fence = FENCE_PATTERN.exec(line.text);
    if (fenceCharacter) {
      if (fence && fence[1][0] === fenceCharacter && fence[1].length >= fenceLength && !fence[2].trim()) {
        fenceCharacter = "";
        fenceLength = 0;
      }
      continue;
    }
    if (fence) {
      fenceCharacter = fence[1][0];
      fenceLength = fence[1].length;
      continue;
    }

    for (let cursor = 0; cursor < line.text.length;) {
      if (line.text[cursor] === "`") {
        let runLength = 1;
        while (line.text[cursor + runLength] === "`") runLength += 1;
        const marker = "`".repeat(runLength);
        const closing = line.text.indexOf(marker, cursor + runLength);
        cursor = closing < 0 ? cursor + runLength : closing + runLength;
        continue;
      }

      const tag = UNDERLINE_TAG_PATTERN.exec(line.text.slice(cursor));
      if (!tag) {
        cursor += 1;
        continue;
      }
      const start = line.start + cursor;
      const end = start + tag[0].length;
      if (tag[1]) {
        if (pending) {
          pairs.push({ ...pending, closeStart: start, closeEnd: end });
          pending = null;
        }
      } else if (!pending) {
        pending = { openStart: start, openEnd: end };
      }
      cursor += tag[0].length;
    }
  }
  return pairs;
}

function visibleNeedle(markdown) {
  return markdown
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(`+)([\s\S]*?)\1/g, "$2")
    .replace(/<[^>]+>/g, "")
    .replace(/\\([\\`*{}\[\]()#+\-.!_>~|])/g, "$1")
    .replace(/(\*\*|__)([^\r\n]+?)\1/g, "$2")
    .replace(/([*_])([^\r\n]+?)\1/g, "$2")
    .replace(/~~([^\r\n]+?)~~/g, "$1")
    .trim();
}

export function prepareMarkdownTextTones(markdown) {
  const source = String(markdown || "");
  if (!/<u\s*>/i.test(source)) return { markdown: source, underlineTexts: EMPTY_UNDERLINES };
  const pairs = underlinePairs(source);
  if (!pairs.length) return { markdown: source, underlineTexts: EMPTY_UNDERLINES };

  const underlineTexts = pairs
    .map((pair) => visibleNeedle(source.slice(pair.openEnd, pair.closeStart)))
    .filter(Boolean);
  const removals = pairs
    .flatMap((pair) => [[pair.openStart, pair.openEnd], [pair.closeStart, pair.closeEnd]])
    .sort((left, right) => right[0] - left[0]);
  let rendered = source;
  for (const [start, end] of removals) rendered = rendered.slice(0, start) + rendered.slice(end);
  return { markdown: rendered, underlineTexts };
}

function textNodes(root, includeCode) {
  const nodes = [];
  const walker = root.ownerDocument.createTreeWalker(root, 4);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || parent.closest("button, [aria-hidden='true'], [inert]")) continue;
    if (!includeCode && parent.closest("pre, code")) continue;
    nodes.push(node);
  }
  return nodes;
}

function pointAt(nodes, offset) {
  let cursor = 0;
  for (const node of nodes) {
    const next = cursor + node.data.length;
    if (offset <= next) return { node, offset: Math.max(0, offset - cursor) };
    cursor = next;
  }
  const last = nodes.at(-1);
  return last ? { node: last, offset: last.data.length } : null;
}

function normalizedText(raw) {
  let value = "";
  const offsets = [];
  let whitespace = false;
  for (let index = 0; index < raw.length; index += 1) {
    if (/\s/.test(raw[index])) {
      if (!whitespace) {
        value += " ";
        offsets.push(index);
        whitespace = true;
      }
      continue;
    }
    whitespace = false;
    value += raw[index];
    offsets.push(index);
  }
  return { value, offsets };
}

function underlineRanges(root, needles, previous = []) {
  if (!needles.length) return [];
  const nodes = textNodes(root, true);
  const raw = nodes.map((node) => node.data).join("");
  const searchable = normalizedText(raw);
  const ranges = [];
  let cursor = 0;
  for (const needle of needles) {
    const normalizedNeedle = needle.replace(/\s+/g, " ").trim();
    if (!normalizedNeedle) continue;
    const index = searchable.value.indexOf(normalizedNeedle, cursor);
    if (index < 0) continue;
    const rawStart = searchable.offsets[index];
    const rawEnd = searchable.offsets[index + normalizedNeedle.length - 1] + 1;
    const start = pointAt(nodes, rawStart);
    const end = pointAt(nodes, rawEnd);
    if (start && end) {
      let range = previous[ranges.length];
      if (!range || range.startContainer !== start.node || range.startOffset !== start.offset
        || range.endContainer !== end.node || range.endOffset !== end.offset) {
        range = root.ownerDocument.createRange();
        range.setStart(start.node, start.offset);
        range.setEnd(end.node, end.offset);
      }
      ranges.push(range);
    }
    cursor = index + normalizedNeedle.length;
  }
  return ranges;
}

function quoteRanges(node) {
  const ranges = [];
  if (node.parentElement && !node.parentElement.closest("button, pre, code, [aria-hidden='true'], [inert]")) {
    DIALOGUE_QUOTE_PATTERN.lastIndex = 0;
    for (const match of node.data.matchAll(DIALOGUE_QUOTE_PATTERN)) {
      const range = node.ownerDocument.createRange();
      range.setStart(node, match.index || 0);
      range.setEnd(node, (match.index || 0) + match[0].length);
      ranges.push(range);
    }
  }
  return ranges;
}

function highlightRuntime(root) {
  const view = root?.ownerDocument?.defaultView;
  const registry = view?.CSS?.highlights;
  const Highlight = view?.Highlight;
  return registry && typeof Highlight === "function" ? { registry, Highlight } : null;
}

export function registerMarkdownTextToneHighlights(root, underlineTexts) {
  if (!root) return () => {};
  ensureHighlightStyles(root.ownerDocument);
  const runtime = highlightRuntime(root);
  if (!runtime) return () => {};
  const quotes = new Map();
  let underlines = [], needles = underlineTexts;
  const replace = (tone, previous, next) => {
    const name = HIGHLIGHT_NAMES[tone];
    let highlight = runtime.registry.get(name);
    if (!highlight && !next.length) return;
    if (!highlight) {
      highlight = new runtime.Highlight();highlight.priority = tone === 'underline' ? 1 : 0;
      runtime.registry.set(name, highlight);
    }
    const retained = new Set(next);
    for (const range of previous) if (!retained.has(range)) highlight.delete(range);
    for (const range of next) highlight.add(range);
    if (!highlight.size) runtime.registry.delete(name);
  };
  const updateQuotes = node => {
    const previous = quotes.get(node) || [];
    const next = root.contains(node) ? quoteRanges(node) : [];
    replace('quote', previous, next);
    if (next.length) quotes.set(node, next); else quotes.delete(node);
  };
  const collect = (node, dirty) => {
    if (node.nodeType === 3) { dirty.add(node); return; }
    const walker = root.ownerDocument.createTreeWalker(node, 4);
    for (let text = walker.nextNode(); text; text = walker.nextNode()) dirty.add(text);
  };
  const updateUnderlines = () => {
    const next = underlineRanges(root, needles, underlines);
    replace('underline', underlines, next);underlines = next;
  };
  const initial = new Set();collect(root, initial);initial.forEach(updateQuotes);updateUnderlines();
  const observer = new root.ownerDocument.defaultView.MutationObserver(records => {
    const dirty = new Set();
    for (const record of records) {
      if (record.type === 'childList') {
        record.addedNodes.forEach(node => collect(node, dirty));
        record.removedNodes.forEach(node => collect(node, dirty));
      } else collect(record.target, dirty);
    }
    dirty.forEach(updateQuotes);
    if (needles.length || underlines.length) updateUnderlines();
  });
  observer.observe(root, { childList: true, characterData: true, subtree: true,
    attributes: true, attributeFilter: ['aria-hidden', 'inert'] });
  const dispose = () => {
    observer.disconnect();
    for (const ranges of quotes.values()) replace('quote', ranges, []);
    quotes.clear();replace('underline', underlines, []);underlines = [];
  };
  dispose.update = next => {
    if (next.length === needles.length && next.every((needle, index) => needle === needles[index])) return;
    needles = next;updateUnderlines();
  };
  return dispose;
}
