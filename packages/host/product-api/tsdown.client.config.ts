import { defineConfig } from 'tsdown'

const id = '@eleckoi/dsh-product-api'

export default defineConfig({
  entry: { client: 'lib/types/client/index.js' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  target: 'es2024',
  dts: false,
  sourcemap: true,
  clean: false,
  noExternal: ['zod', '@deepseek-ai/dsh-typert-protocol/remote-info', '@deepseek-ai/dsh-util-values'],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;'
  }
})
