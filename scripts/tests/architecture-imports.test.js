import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { moduleImports, isDshRuntimeImport, isForbiddenRendererDshImport } from '../architecture-imports.mjs'

describe('Official Renderer package boundary', () => {
  it('admits the public pure Client UI entry while retaining Host and SDK restrictions', () => {
    const imports = moduleImports(`
      import { IconSendOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
      export { IconCheckOutlineRegular } from "@deepseek-ai/dsh-client-ui-primitives";
      const documentation = "@deepseek-ai/dsh-sdk";
    `)
    expect(imports).toEqual(['@deepseek-ai/dsh-client-ui-primitives'])
    expect(imports.some(isForbiddenRendererDshImport)).toBe(false)
    expect(imports.some(isDshRuntimeImport)).toBe(false)
    for (const specifier of ['@deepseek-ai/dsh-sdk', '@deepseek-ai/dsh-sdk-client',
      '@deepseek-ai/dsh-host-webserver', '@deepseek-ai/dsh-client-connection',
      '@deepseek-ai/dsh-client-ui-primitives/src/icons', '@deepseek-ai/dsh-client-ui-primitives-other']) {
      expect(isForbiddenRendererDshImport(specifier), specifier).toBe(true)
      expect(isDshRuntimeImport(specifier), specifier).toBe(true)
    }
    expect(isForbiddenRendererDshImport('@deepseek-ai/cordis')).toBe(true)
    expect(isDshRuntimeImport('@eleckoi/dsh-runtime/session')).toBe(true)
    expect(isDshRuntimeImport('@eleckoi/desktop-host')).toBe(true)
  })
  it('admits only the public dependency-free workspace naming fold, keeping its Host package blocked', async () => {
    const specifier = '@deepseek-ai/dsh-api-workspace-controller/default-workspace'
    const require = createRequire(import.meta.url)
    const source = readFileSync(require.resolve(specifier), 'utf8')
    expect(moduleImports(source)).toEqual([])
    const { workspaceDisplayTitle, DEFAULT_WORKSPACE_DIRECTORY } = await import(specifier)
    expect(workspaceDisplayTitle(DEFAULT_WORKSPACE_DIRECTORY, '默认工作区')).toBe('默认工作区')
    expect(workspaceDisplayTitle('合成工作区', '默认工作区')).toBe('合成工作区')
    expect(isForbiddenRendererDshImport(specifier)).toBe(false)
    expect(isDshRuntimeImport(specifier)).toBe(false)
    for (const blocked of ['@deepseek-ai/dsh-api-workspace-controller', '@deepseek-ai/dsh-api-workspace-controller/client',
      '@deepseek-ai/dsh-api-workspace-controller/src/default-workspace', '@deepseek-ai/dsh-api-workspace-controller/default-workspace-other']) {
      expect(isForbiddenRendererDshImport(blocked)).toBe(true)
      expect(isDshRuntimeImport(blocked)).toBe(true)
    }
  })
  it('also detects side-effect imports, type imports, re-exports and literal dynamic loading', () => {
    expect(moduleImports(`
      import '@deepseek-ai/dsh-agent';
      import type { Context } from '@deepseek-ai/cordis';
      export * from '@deepseek-ai/dsh-host-webserver';
      const sdk = import('@deepseek-ai/dsh-sdk');
      const runtime = require('@eleckoi/dsh-runtime');
    `)).toEqual(['@deepseek-ai/dsh-agent', '@deepseek-ai/cordis', '@deepseek-ai/dsh-host-webserver',
      '@deepseek-ai/dsh-sdk', '@eleckoi/dsh-runtime'])
  })
})
