import { useLayoutEffect, useRef } from 'react';

const iconSprites = new WeakMap();

/** SVG fragment references resolve inside their own tree, including ShadowRoots. */
function retainIconSprite(root) {
  let entry = iconSprites.get(root);
  if (!entry) {
    const owner = root.ownerDocument;
    const sprite = owner.createElementNS('http://www.w3.org/2000/svg', 'svg');
    sprite.setAttribute('data-eleckoi-shadow-icon-sprite', '');
    sprite.setAttribute('aria-hidden', 'true');
    sprite.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    let source;
    const sync = () => sprite.replaceChildren(...[...(source?.childNodes || [])].map(node => node.cloneNode(true)));
    const symbols = new MutationObserver(sync);
    const connect = () => {
      const next = owner.querySelector('svg[data-dsh-icon-sprite]');
      if (source === next) return;
      symbols.disconnect();
      source = next;
      if (source) symbols.observe(source, { childList: true, subtree: true, attributes: true, characterData: true });
      sync();
    };
    const documentChildren = new MutationObserver(connect);
    root.append(sprite);
    documentChildren.observe(owner.body, { childList: true });
    connect();
    entry = { users: 0, dispose() {
      symbols.disconnect(); documentChildren.disconnect(); sprite.remove(); iconSprites.delete(root);
    } };
    iconSprites.set(root, entry);
  }
  entry.users++;
  return () => { if (--entry.users === 0) entry.dispose(); };
}

/** Share loaded component rules and active theme artwork with a ShadowRoot editor. */
export function useShadowControlStyles(surfaceRef) {
  const styleRef = useRef(null);
  const signatureRef = useRef('');
  const iconsRef = useRef(null);
  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    const root = surface?.getRootNode();
    if (iconsRef.current?.root !== root) {
      iconsRef.current?.release();
      iconsRef.current = root instanceof ShadowRoot ? { root, release: retainIconSprite(root) } : null;
    }
    if (!(root instanceof ShadowRoot)) return;
    const names = new Set([...root.querySelectorAll('[data-dsh-control], [data-dsh-control] *')].flatMap(node => [...node.classList]));
    if (!names.size) return;
    const signature = [...names].sort().join(' ');
    if (styleRef.current?.parentNode === root && signatureRef.current === signature) return;
    const pattern = new RegExp(`\\.(?:${[...names].map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\w-])`);
    function rules(list) {
      return [...list].flatMap(rule => {
        if (rule instanceof CSSStyleRule) return pattern.test(rule.selectorText) ? [rule.cssText] : [];
        if (!('cssRules' in rule)) return [];
        const children = rules(rule.cssRules);
        return children.length ? [`${rule.cssText.slice(0, rule.cssText.indexOf('{'))}{${children.join('\n')}}`] : [];
      });
    }
    const css = [...document.styleSheets].flatMap(sheet => {
      // Cross-origin sheets cannot supply these locally loaded component rules.
      try { return rules(sheet.cssRules); } catch (error) { if (error.name === 'SecurityError') return []; throw error; }
    }).join('\n');
    if (styleRef.current?.parentNode !== root) {
      styleRef.current?.remove();
      styleRef.current = document.createElement('style');
      root.append(styleRef.current);
    }
    if (styleRef.current.textContent !== css) styleRef.current.textContent = css;
    signatureRef.current = signature;
  });
  useLayoutEffect(() => () => {
    styleRef.current?.remove(); styleRef.current = null;
    iconsRef.current?.release(); iconsRef.current = null;
  }, []);
}
