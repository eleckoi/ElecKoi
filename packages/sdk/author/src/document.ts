import type { ElecKoiAuthorApi } from './contracts'
import { AuthorApiError } from './errors'
import { AUTHOR_API_VERSION } from './version'
import { installRichDocumentMeasurement } from './rich-document'
import { isAuthorDocumentDiagnostic } from './document-diagnostics'

export const AUTHOR_DOCUMENT_META_NAME = 'eleckoi-author-api'

export type AuthorDocumentDeclaration =
  | { kind: 'undeclared' }
  | { kind: 'native'; version: typeof AUTHOR_API_VERSION }
  | { kind: 'unsupported'; error: string }

export interface AuthorDocumentWindow extends Window {
  readonly __ElecKoiDocumentChannel: string
  __ElecKoiCompleteDocument(api?: ElecKoiAuthorApi, error?: Error): void
}

function declaration(document: Document): AuthorDocumentDeclaration {
  const entries = Array.from(document.head.children)
    .filter(meta => meta.tagName === 'META' && meta.getAttribute('name') === AUTHOR_DOCUMENT_META_NAME)
  if (!entries.length) return { kind: 'undeclared' }
  if (entries.length !== 1) return { kind: 'unsupported', error: '原生作者页面只能声明一个 SDK 版本' }
  const version = entries[0]!.getAttribute('content')
  if (version !== AUTHOR_API_VERSION) return { kind: 'unsupported', error: `不支持的原生作者 SDK 版本：${version ?? '(未填写)'}` }
  return { kind: 'native', version }
}

/** Only an explicit document-head declaration selects the native SDK. */
export function readAuthorDocumentDeclaration(source: string, parser = new DOMParser()): AuthorDocumentDeclaration {
  return declaration(parser.parseFromString(source, 'text/html'))
}

// Serialized into the document: keep all dependencies inside this function.
function bootstrap(channel: string, rich: boolean, context: Record<string, unknown> | undefined, measureDocument: typeof installRichDocumentMeasurement, runtimeDiagnostics: boolean, isDiagnostic: typeof isAuthorDocumentDiagnostic): void {
  const page = window as unknown as AuthorDocumentWindow
  if (context !== undefined) Object.defineProperty(page, 'ElecKoiFrontendContext', { value: context, writable: true, configurable: true })
  const send = (type: string, payload: Record<string, unknown> = {}) => page.parent.postMessage({ type, channel, ...payload }, '*')
  const report = (error: unknown) => send('eleckoi:frontend-error', { message: error instanceof Error ? error.message : String(error) })
  const diagnose = (error: unknown, diagnostic = runtimeDiagnostics) => send(diagnostic ? 'eleckoi:frontend-diagnostic' : 'eleckoi:frontend-error', { message: error instanceof Error ? error.message : String(error) })
  let complete = false
  let resolve!: (api: ElecKoiAuthorApi) => void, reject!: (error: Error) => void
  const ready = new Promise<ElecKoiAuthorApi>((accept, fail) => { resolve = accept; reject = fail })
  // Report a missing mount even when the author has not subscribed yet.
  void ready.catch(report)
  Object.defineProperties(page, {
    ElecKoiReady: { value: ready },
    __ElecKoiDocumentChannel: { value: channel },
    __ElecKoiCompleteDocument: { value: (api?: ElecKoiAuthorApi, error?: Error) => {
      if (complete) return
      complete = true
      if (error) reject(error)
      else if (api) { resolve(api); send('eleckoi:frontend-ready') }
      else reject(new Error('原生作者 SDK 未安装'))
    } }
  })
  page.addEventListener('error', event => {
    if (event.target === page) {
      if (isDiagnostic(event)) send('eleckoi:frontend-diagnostic', { message: event.message })
      else diagnose(event.error || new Error(event.message))
    }
    else {
      const element = event.target as HTMLScriptElement | HTMLLinkElement | null
      if (element?.tagName) diagnose(new Error(`资源加载失败：${'src' in element ? element.src : element.href}`), runtimeDiagnostics || isDiagnostic(event))
    }
  }, true)
  page.addEventListener('unhandledrejection', event => diagnose(event.reason))
  if (rich) measureDocument(page, height => send('eleckoi:rich-height', { height }))
  page.addEventListener('pagehide', () => {
    if (!complete) { complete = true; reject(new Error('原生作者页面已关闭')) }
  }, { once: true })
}

/** Installs readiness and measurement before author code, without loading other runtimes. */
export function buildAuthorDocumentSource(source: string, channel: string, rich = false, options: {
  baseUrl?: string; globalStyles?: string[]; context?: Record<string, unknown>; runtimeDiagnostics?: boolean
} = {}): string {
  const document = new DOMParser().parseFromString(source, 'text/html')
  const selected = declaration(document)
  if (selected.kind !== 'native') throw new AuthorApiError('UNSUPPORTED_VERSION', selected.kind === 'unsupported' ? selected.error : '页面没有声明原生作者 SDK 版本')
  const script = document.createElement('script')
  const literal = (value: unknown) => JSON.stringify(value).replaceAll('<', '\\u003c')
  script.textContent = `(${bootstrap.toString()})(${literal(channel)},${JSON.stringify(rich)},${literal(options.context ?? null)},${installRichDocumentMeasurement.toString()},${JSON.stringify(options.runtimeDiagnostics ?? rich)},${isAuthorDocumentDiagnostic.toString()});`
  document.head.prepend(script)
  if (options.baseUrl && !document.head.querySelector('base')) {
    const base = document.createElement('base')
    // srcdoc's preload scanner needs an absolute base before fetching author assets.
    base.href = new URL(options.baseUrl, document.baseURI).href
    document.head.prepend(base)
  }
  for (const url of options.globalStyles || []) {
    const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = url; document.head.insertBefore(link, script)
  }
  const viewport = document.createElement('meta')
  viewport.name = 'viewport'; viewport.content = 'width=device-width,initial-scale=1,viewport-fit=cover'
  if (!document.head.querySelector('meta[name="viewport"]')) document.head.prepend(viewport)
  if (rich) {
    const style = document.createElement('style')
    // Matching the embedding scheme keeps the rich document canvas transparent.
    style.textContent = 'html{color-scheme:light dark}html,body{margin:0;padding:0;min-width:0;background:transparent;overflow:hidden}body{overflow-wrap:anywhere}img,video,canvas{max-width:100%}'
    document.head.prepend(style)
  }
  return '<!doctype html>' + document.documentElement.outerHTML
}
