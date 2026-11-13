/** Serialized into a message document; all runtime dependencies stay in this function. */
export function installRichDocumentMeasurement(page: Window, publish: (height: number) => void): void {
  let frame = 0
  let mutation: MutationObserver | undefined, resize: ResizeObserver | undefined
  const host = page.frameElement?.ownerDocument.defaultView || page
  const styles = new WeakMap<CSSStyleDeclaration, string>()
  let viewportHeight = -1, viewportWidth = -1
  // Auto-height is an output of content layout. Vertical viewport lengths must
  // instead use the embedding window, or their own output becomes their input.
  const updateViewport = () => {
    const height = host.innerHeight, width = page.innerWidth
    if (height === viewportHeight && width === viewportWidth) return
    viewportHeight = height; viewportWidth = width
    const root = page.document.documentElement
    const probe = host.document.createElement('div')
    probe.style.cssText = 'all:initial!important;position:fixed!important;visibility:hidden!important;pointer-events:none!important;width:0!important;min-height:0!important;max-height:none!important;contain:strict!important'
    host.document.documentElement.append(probe)
    for (const prefix of ['', 's', 'l', 'd']) {
      probe.style.setProperty('height', `100${prefix}vh`, 'important')
      const pixels = probe.getBoundingClientRect().height || height
      for (const [unit, value] of [[`${prefix}vh`, pixels], [`${prefix}vmin`, Math.min(width, pixels)], [`${prefix}vmax`, Math.max(width, pixels)]] as const) {
        root.style.setProperty(`--eleckoi-rich-${unit}`, `${value / 100}px`)
      }
    }
    probe.remove()
  }
  const adaptStyle = (style: CSSStyleDeclaration) => {
    if (styles.get(style) === style.cssText) return
    for (const property of Array.from(style)) {
      const value = style.getPropertyValue(property)
      // CSS strings, comments and URLs are tokens, not dimensions. Preserve
      // them while adapting lengths inside declarations, calc and variables.
      const adapted = value.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\*[\s\S]*?\*\/|url\((?:\\.|[^()"'\\]|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')*\)|(?<![\w-])([+-]?(?:\d*\.\d+|\d+\.?\d*)(?:e[+-]?\d+)?)([sld]?vh|[sld]?vmin|[sld]?vmax)\b/gi,
        (token, number: string | undefined, unit: string) => number === undefined ? token : `calc(${number} * var(--eleckoi-rich-${unit.toLowerCase()}))`)
      if (adapted !== value) style.setProperty(property, adapted, style.getPropertyPriority(property))
    }
    styles.set(style, style.cssText)
  }
  const adaptRules = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      if ('style' in rule) adaptStyle((rule as CSSStyleRule).style)
      if ('cssRules' in rule) adaptRules((rule as CSSGroupingRule).cssRules)
      if (rule.type === 3) adaptSheet((rule as CSSImportRule).styleSheet)
    }
  }
  const adaptSheet = (sheet: CSSStyleSheet | null) => {
    if (!sheet) return
    try { adaptRules(sheet.cssRules) }
    catch (error) {
      // The browser intentionally hides rules from opaque cross-origin sheets.
      if (!(error instanceof DOMException) || error.name !== 'SecurityError') throw error
    }
  }
  const prepareLayout = () => {
    updateViewport()
    for (const element of page.document.querySelectorAll<HTMLElement>('[style]')) adaptStyle(element.style)
    for (const sheet of Array.from(page.document.styleSheets)) adaptSheet(sheet)
    for (const sheet of page.document.adoptedStyleSheets || []) adaptSheet(sheet)
  }
  const measure = () => {
    frame = 0
    const body = page.document.body
    if (!body) return
    prepareLayout()
    const rect = body.getBoundingClientRect()
    const margin = Number.parseFloat(page.getComputedStyle(body).marginBottom) || 0
    let bottom = Math.max(rect.bottom + page.scrollY + margin, rect.top + page.scrollY + body.scrollHeight)
    // Positioned content has no normal-flow body height; measure its actual visible bounds.
    for (const element of body.querySelectorAll('*')) {
      const style = page.getComputedStyle(element)
      if (style.position !== 'absolute' && style.position !== 'fixed') continue
      if (style.display === 'none' || style.visibility === 'hidden') continue
      bottom = Math.max(bottom, element.getBoundingClientRect().bottom + page.scrollY)
    }
    publish(Math.max(1, Math.ceil(bottom)))
  }
  const schedule = () => { if (!frame) frame = page.requestAnimationFrame(measure) }
  const viewportChanged = () => { viewportHeight = -1; schedule() }
  const observe = () => {
    mutation = new MutationObserver(schedule)
    mutation.observe(page.document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true })
    if (typeof ResizeObserver === 'function') { resize = new ResizeObserver(schedule); resize.observe(page.document.body) }
    page.document.fonts?.addEventListener('loadingdone', schedule)
    page.addEventListener('resize', schedule)
    if (host !== page) host.addEventListener('resize', viewportChanged)
    host.visualViewport?.addEventListener('resize', viewportChanged)
    page.document.addEventListener('load', schedule, true)
    // The first size unlocks the staged presentation. Offscreen iframe paint
    // callbacks can be suspended until scrolling, so do not wait for one here.
    measure()
  }
  if (page.document.readyState === 'loading') page.addEventListener('DOMContentLoaded', observe, { once: true })
  else observe()
  page.addEventListener('pagehide', () => {
    mutation?.disconnect(); resize?.disconnect(); page.cancelAnimationFrame(frame)
    page.document.fonts?.removeEventListener('loadingdone', schedule)
    page.removeEventListener('resize', schedule)
    if (host !== page) host.removeEventListener('resize', viewportChanged)
    host.visualViewport?.removeEventListener('resize', viewportChanged)
    page.document.removeEventListener('load', schedule, true)
  }, { once: true })
}
