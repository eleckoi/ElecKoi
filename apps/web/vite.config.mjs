import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { dshClientPages } from '../../scripts/dsh-client-pages.mjs'

const webRoot = import.meta.dirname
const workspaceRoot = resolve(webRoot, '../..')
const require = createRequire(import.meta.url)
const primitivesModule = '@deepseek-ai/dsh-client-ui-primitives'

const platformExports = {
  react: [
    'Children', 'Component', 'Fragment', 'PureComponent', 'Suspense', 'cloneElement',
    'createContext', 'createElement', 'createRef', 'forwardRef', 'isValidElement',
    'lazy', 'memo', 'startTransition', 'useCallback', 'useContext', 'useDebugValue',
    'useDeferredValue', 'useEffect', 'useId', 'useImperativeHandle', 'useInsertionEffect',
    'useLayoutEffect', 'useMemo', 'useReducer', 'useRef', 'useState',
    'useSyncExternalStore', 'useTransition'
  ],
  'react/jsx-runtime': ['Fragment', 'jsx', 'jsxs'],
  'react/jsx-dev-runtime': ['Fragment', 'jsxDEV'],
  'react-dom': ['createPortal', 'flushSync', 'unstable_batchedUpdates'],
  'react-dom/client': ['createRoot', 'hydrateRoot'],
  [primitivesModule]: null
}

function dshPlatformReact() {
  const prefix = '\0eleckoi-dsh-platform:'
  return {
    name: 'eleckoi-dsh-platform-react',
    enforce: 'pre',
    resolveId(source) {
      return Object.hasOwn(platformExports, source) ? prefix + source : null
    },
    load(id) {
      if (!id.startsWith(prefix)) return null
      const source = id.slice(prefix.length)
      const member = source === primitivesModule ? 'primitives' : source === 'react' ? 'react'
        : source === 'react-dom' ? 'reactDom'
          : source === 'react-dom/client' ? 'reactDomClient'
            : source === 'react/jsx-runtime' ? 'jsxRuntime' : 'jsxDevRuntime'
      const names = source === primitivesModule
        ? this.parse(readFileSync(require.resolve(primitivesModule), 'utf8')).body
          .filter(node => node.type === 'ExportNamedDeclaration')
          .flatMap(node => node.specifiers.map(specifier => specifier.exported.name))
        : platformExports[source]
      if (!names.length) this.error(`DSH platform module has no named exports: ${source}`)
      return [
        `const platform = globalThis.__ELECKOI_DSH_PLATFORM__?.${member};`,
        `if (!platform) throw new Error('DSH platform module is unavailable: ${source}');`,
        ...(source === primitivesModule ? [] : ['export default platform;']),
        ...names.map(name => `export const ${name} = platform.${name};`)
      ].join('\n')
    }
  }
}

export default defineConfig({
  root: webRoot,
  base: './',
  resolve: {
    alias: {
      '@renderer': resolve(webRoot, 'src'),
      '@shared': resolve(workspaceRoot, 'packages/shared/src')
    }
  },
  plugins: [dshPlatformReact(), react(), tailwindcss()],
  build: {
    outDir: resolve(webRoot, 'dist'),
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      preserveEntrySignatures: 'strict',
      input: {
        app: resolve(webRoot, 'dsh.html'),
        ...Object.fromEntries(dshClientPages.map(page => [
          `eleckoi-page-${page.key}`,
          resolve(workspaceRoot, `packages/${page.package}/src/${page.entry}`)
        ]))
      },
      output: { entryFileNames: 'assets/[name].js' }
    }
  }
})
