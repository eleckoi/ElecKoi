import { useLayoutEffect, useRef } from 'react';

/** Share the loaded component rules with an editor hosted in a ShadowRoot. */
export function useShadowControlStyles(surfaceRef) {
  const styleRef = useRef(null);
  const signatureRef = useRef('');
  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    const root = surface?.getRootNode();
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
  useLayoutEffect(() => () => { styleRef.current?.remove(); styleRef.current = null; }, []);
}
