import { resolve } from 'node:path'
import { configDefaults, defineConfig } from 'vitest/config'
// @ts-expect-error The Node test runner shares this JavaScript suite declaration.
import { testSuites } from './scripts/test-suites.mjs'

export default defineConfig({
  resolve: {
    alias: {
      '@main': resolve('apps/desktop/src/main'),
      '@product-data': resolve('packages/host/product-data/src'),
      '@shared': resolve('packages/shared/src'),
      '@eleckoi/author-sdk/browser': resolve('packages/sdk/author/src/browser.ts'),
      '@eleckoi/author-sdk': resolve('packages/sdk/author/src/index.ts'),
      '@eleckoi/tavern-frontend': resolve('packages/compatibility/tavern-frontend/src/index.ts'),
      '@eleckoi/compatibility-mvu': resolve('packages/compatibility/mvu/src/index.ts'),
      '@eleckoi/dsh-client-author/runtime': resolve('packages/client/features/dsh-client-author/src/runtime.ts'),
      '@eleckoi/dsh-client-author/audio': resolve('packages/client/features/dsh-client-author/src/audio.ts'),
      '@eleckoi/dsh-client-author/frontends': resolve('packages/client/features/dsh-client-author/src/frontends.ts'),
      '@eleckoi/dsh-product-data/media': resolve('packages/host/product-data/src/storage/media/index.ts'),
      '@eleckoi/dsh-product-data/variables': resolve('packages/host/product-data/src/domain/variables/variableSchema.ts'),
      '@eleckoi/dsh-product-data/frontends': resolve('packages/host/product-data/src/domain/frontends/index.ts'),
      '@eleckoi/dsh-product-data/regex': resolve('packages/host/product-data/src/regex-ejs.ts'),
      '@eleckoi/dsh-product-data': resolve('packages/host/product-data/src/index.ts'),
      '@eleckoi/desktop-host': resolve('apps/desktop-host/src/index.ts'),
      '@eleckoi/dsh-runtime': resolve('packages/host/runtime/src/index.ts')
    }
  },
  test: {
    maxWorkers: 2,
    projects: Object.entries(testSuites).map(([name, suite]: [string, any]) => ({
      extends: true,
      test: {
        name,
        include: suite.include,
        exclude: [...configDefaults.exclude, 'build/**', ...(suite.exclude ?? [])],
        environment: 'node',
        // Windows CI intermittently reports EBUSY while spawning the freshly
        // installed Electron image; these browser probes are smoke tests, so
        // re-run the whole test instead of failing on the launch lock.
        ...(name === 'browser' ? { retry: 2 } : {}),
        server: { deps: { inline: ['@deepseek-ai/dsh-client-ui-primitives'] } }
      }
    }))
  }
})
