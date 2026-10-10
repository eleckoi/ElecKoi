/** Generated media placement shared by the default and authored message renderers. */
export function splitMessageMedia(content = '', images = []) {
  const source = String(content);
  const media = Array.isArray(images) ? images : [];
  const segments = [], placed = new Set();
  const text = value => { if (value) segments.push({ kind: 'text', source: value }); };
  let cursor = 0;
  for (const match of source.matchAll(/\[\[IMAGE(?:(?::\s*|\s+)([^\]\r\n]+))?\]\]/gi)) {
    const token = match[1]?.trim();
    const image = token == null ? (media.length === 1 ? media[0] : null)
      : media.find(item => item.id != null && String(item.id) === token)
        || media.find(item => item.frameIndex != null && String(item.frameIndex) === token);
    if (!image || placed.has(image)) continue;
    text(source.slice(cursor, match.index));
    segments.push({ kind: 'image', image }); placed.add(image);
    cursor = match.index + match[0].length;
  }
  text(source.slice(cursor));
  // Explicit markers win over paragraph hints for the same image. Keep unclaimed media visible.
  for (const image of media) {
    if (placed.has(image)) continue;
    const paragraph = Number(image.afterParagraph);
    let remaining = Number.isInteger(paragraph) && paragraph > 0 ? paragraph : Infinity;
    let inserted = false;
    for (let index = 0; index < segments.length && remaining !== Infinity; index++) {
      const segment = segments[index];
      if (segment.kind !== 'text') continue;
      const parts = [...segment.source.matchAll(/\S[\s\S]*?(?:\r?\n\s*\r?\n|$)/g)].filter(part => !/^\u0000ELECKOI_RICH_\d+\u0000\s*$/.test(part[0]));
      if (remaining > parts.length) { remaining -= parts.length; continue; }
      const part = parts[remaining - 1];
      if (!part) continue;
      const end = part.index + part[0].length;
      const replacement = [];
      if (end) replacement.push({ kind: 'text', source: segment.source.slice(0, end) });
      replacement.push({ kind: 'image', image });
      if (end < segment.source.length) replacement.push({ kind: 'text', source: segment.source.slice(end) });
      segments.splice(index, 1, ...replacement); inserted = true; break;
    }
    if (!inserted) segments.push({ kind: 'image', image });
  }
  return segments;
}

/** Preserve interactive documents as whole parts; only locate media in Markdown prose. */
export function splitRichMessageMedia(content = '', images = [], presentation = null) {
  if (!presentation) return splitMessageMedia(content, images);
  const documents = [];
  const source = presentation.parts.map(part => {
    if (part.kind !== 'rich') return part.source;
    const index = documents.push(part.document) - 1;
    return `\u0000ELECKOI_RICH_${index}\u0000`;
  }).join('\n\n');
  return splitMessageMedia(source, images).flatMap(segment => {
    if (segment.kind !== 'text') return [segment];
    const parts = []; let cursor = 0;
    for (const match of segment.source.matchAll(/\u0000ELECKOI_RICH_(\d+)\u0000/g)) {
      if (match.index > cursor) parts.push({ kind: 'text', source: segment.source.slice(cursor, match.index) });
      parts.push({ kind: 'rich', document: documents[Number(match[1])] });
      cursor = match.index + match[0].length;
    }
    if (cursor < segment.source.length) parts.push({ kind: 'text', source: segment.source.slice(cursor) });
    return parts;
  });
}

