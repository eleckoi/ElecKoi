import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const desktopRoot = import.meta.dirname
const workspaceRoot = resolve(desktopRoot, '../..')
const webRoot = resolve(workspaceRoot, 'apps/web')
const sharedRoot = resolve(workspaceRoot, 'packages/shared/src')

export default defineConfig({
  main: {
    build: { lib: { entry: resolve(desktopRoot, 'src/main/main.ts') } },
    resolve: { alias: { '@main': resolve(desktopRoot, 'src/main'), '@shared': sharedRoot } },
    plugins: [externalizeDepsPlugin({
      exclude: ['@eleckoi/author-sdk', '@eleckoi/compatibility-mvu', 'electron-updater']
    })]
  },
  preload: {
    build: {
      lib: { entry: { preload: resolve(desktopRoot, 'src/preload/preload.ts'), 'preload-update-dialog': resolve(desktopRoot, 'src/preload/updateDialog.ts') } },
      rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } }
    },
    resolve: { alias: { '@shared': sharedRoot } },
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    root: webRoot,
    build: {
      outDir: resolve(desktopRoot, 'out/renderer'),
      rollupOptions: { input: resolve(webRoot, 'index.html') }
    },
    server: { cors: { origin: 'dsh-app://app' }, fs: { allow: [workspaceRoot] } },
    resolve: { alias: { '@renderer': resolve(webRoot, 'src'), '@shared': sharedRoot } },
    plugins: [react(), tailwindcss()]
  }
})
