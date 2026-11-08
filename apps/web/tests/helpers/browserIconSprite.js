import { ICON_SYMBOLS } from '@deepseek-ai/dsh-client-ui-primitives';

/** Isolated browser fixtures use the same public icon artwork as the installed theme. */
export function installBrowserIconSprite() {
  const namespace = 'http://www.w3.org/2000/svg';
  const sprite = document.createElementNS(namespace, 'svg');
  sprite.setAttribute('data-dsh-icon-sprite', '');
  sprite.setAttribute('aria-hidden', 'true');
  sprite.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
  for (const [id, source] of Object.entries(ICON_SYMBOLS)) {
    const artwork = new DOMParser().parseFromString(source, 'image/svg+xml').documentElement;
    const symbol = document.createElementNS(namespace, 'symbol');
    for (const { name, value } of artwork.attributes) if (!['width', 'height', 'xmlns', 'class', 'aria-hidden'].includes(name)) symbol.setAttribute(name, value);
    symbol.id = id;
    symbol.append(...[...artwork.childNodes].map(node => document.importNode(node, true)));
    sprite.append(symbol);
  }
  document.body.prepend(sprite);
}
