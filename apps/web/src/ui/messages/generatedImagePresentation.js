/** Image positions use only the declared, standalone frame marker and exact frame ID. */
export function generatedImageSegments(content, images, streaming = false, appendUnplaced = true) {
  let text = String(content || '');
  if (streaming) text = text.replace(/\[\[IMAGE:(?:\d+\]?)?$/, '');
  const segments = [], used = new Set();
  const marker = /^[\t ]*\[\[IMAGE:(\d+)\]\][\t ]*$/gm;
  let start = 0, match;
  while ((match = marker.exec(text))) {
    const candidates = images.filter(image => image.frameId === Number(match[1]));
    if (candidates.length !== 1 || used.has(candidates[0].id)) continue;
    const before = text.slice(start, match.index);
    if (before.trim()) segments.push({ type: 'text', content: before });
    const image = candidates[0];
    used.add(image.id);
    const previous = segments.at(-1);
    if (previous?.type === 'images' && !before.trim()) previous.images.push(image);
    else segments.push({ type: 'images', images: [image] });
    start = match.index + match[0].length;
  }
  const rest = text.slice(start);
  if (rest.trim()) segments.push({ type: 'text', content: rest });
  const remaining = images.filter(image => !used.has(image.id));
  if (!streaming && appendUnplaced && remaining.length) segments.push({ type: 'images', images: remaining });
  return segments;
}

export function generatedImagesByBlock(blocks, images, streaming) {
  if (!images?.length) return new Map();
  const placed = new Set();
  const byBlock = new Map(blocks.map(block => {
    const available = images.filter(image => !placed.has(image.id));
    const matched = generatedImageSegments(block.displayContent ?? block.text, available, streaming, false)
      .flatMap(segment => segment.type === 'images' ? segment.images : []);
    for (const image of matched) placed.add(image.id);
    return [block.id, matched];
  }));
  if (!streaming && blocks.length) byBlock.get(blocks.at(-1).id).push(...images.filter(image => !placed.has(image.id)));
  return byBlock;
}
