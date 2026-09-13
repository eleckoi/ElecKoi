const STANDALONE_TAG = /^[ \t]{0,3}<\/?([A-Za-z][A-Za-z0-9:_-]*)(?:[ \t]+[^<>\r\n]*)?\/?>[ \t]*$/;
const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})([^\r\n]*)$/;
const HTML_TAG_NAMES = new Set([
  "a", "abbr", "address", "area", "article", "aside", "audio", "b", "base", "bdi", "bdo",
  "blockquote", "body", "br", "button", "canvas", "caption", "cite", "code", "col", "colgroup",
  "data", "datalist", "dd", "del", "details", "dfn", "dialog", "div", "dl", "dt", "em", "embed",
  "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6",
  "head", "header", "hgroup", "hr", "html", "i", "iframe", "img", "input", "ins", "kbd", "label",
  "legend", "li", "link", "main", "map", "mark", "menu", "meta", "meter", "nav", "noscript",
  "object", "ol", "optgroup", "option", "output", "p", "picture", "pre", "progress", "q", "rp", "rt",
  "ruby", "s", "samp", "script", "search", "section", "select", "slot", "small", "source", "span",
  "strong", "style", "sub", "summary", "sup", "table", "tbody", "td", "template", "textarea",
  "tfoot", "th", "thead", "time", "title", "tr", "track", "u", "ul", "var", "video", "wbr",
]);

function linesWithEndings(source) {
  const lines = [];
  const pattern = /([^\r\n]*)(\r\n|\r|\n|$)/g;
  for (let match = pattern.exec(source); match && (match[0] || match.index < source.length); match = pattern.exec(source)) {
    lines.push({ text: match[1], ending: match[2] });
    if (!match[2]) break;
  }
  return lines;
}

/**
 * Normalizes only the render copy of roleplay Markdown.
 *
 * CommonMark keeps a standalone HTML-style tag open until a blank line. When a model places a
 * fenced block immediately after that tag, the fence is parsed as literal text. XML-style wrapper
 * names must also be removed before parsing so their body is still processed as Markdown. This
 * mirrors Android's sanitized unknown-element wrappers without executing authored HTML.
 */
export function normalizeMarkdownForRendering(markdown) {
  if (!markdown || !markdown.includes("<")) return markdown;

  const lines = linesWithEndings(markdown);
  let fenceCharacter = "";
  let fenceLength = 0;
  return lines.map((line, index) => {
    const fence = FENCE.exec(line.text);
    if (fenceCharacter) {
      if (
        fence
        && fence[1][0] === fenceCharacter
        && fence[1].length >= fenceLength
        && !fence[2].trim()
      ) {
        fenceCharacter = "";
        fenceLength = 0;
      }
      return line.text + line.ending;
    }

    if (fence) {
      fenceCharacter = fence[1][0];
      fenceLength = fence[1].length;
      return line.text + line.ending;
    }

    const wrapper = STANDALONE_TAG.exec(line.text);
    if (!wrapper) return line.text + line.ending;

    // Remove only unknown standalone wrapper lines. Standard HTML keeps its existing sanitized
    // behavior, while the wrapper body remains normal Markdown with source line breaks intact.
    if (!HTML_TAG_NAMES.has(wrapper[1].toLowerCase())) return line.ending;

    const nextFence = FENCE.exec(lines[index + 1]?.text || "");
    return line.text + line.ending + (line.ending && nextFence ? line.ending : "");
  }).join("");
}
