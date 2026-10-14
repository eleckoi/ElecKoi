import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { client: 'lib/types/client.js' }, outDir: 'lib', format: 'cjs', platform: 'browser',
  target: 'es2024', dts: false, sourcemap: true, clean: false, noExternal: [/^@eleckoi\/(?:author-sdk|tavern-native)(?:\/|$)/, /^ajv(?:\/|$)/, /^ajv-formats(?:\/|$)/, /^zod(?:\/|$)/],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: 'window.__ModuleLoader__.load({ id: "@eleckoi/dsh-client-author", factory: (require) => {',
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;'
  }
})
