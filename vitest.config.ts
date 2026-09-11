import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@main': resolve('src/main'),
      '@shared': resolve('src/shared'),
      '@eleckoi/dsh-runtime': resolve('packages/dsh-runtime/src/index.ts')
    }
  },
  test: {
    environment: 'node'
  }
})
