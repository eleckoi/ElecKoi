import { Context } from '@deepseek-ai/cordis'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { formatHostDiagnostic, installHostLogExporter } from '../src/hostDiagnostics'
import { productFailure } from '../../product-api/src/productFailure'
import { ELECKOI_FAILURE_CODES } from '../../../shared/src/contracts/errors/codes'

const contexts: Context[] = []
afterEach(async () => { for (const ctx of contexts.splice(0).reverse()) await ctx.fiber.dispose() })
function context() { const ctx = new Context(); contexts.push(ctx); return ctx }

it.each(['rejection', 'exception'])('retains an actual process %s before the official launcher exits', kind => {
  const require = createRequire(import.meta.url)
  const cordis = pathToFileURL(require.resolve('@deepseek-ai/cordis')).href
  const boot = pathToFileURL(require.resolve('@deepseek-ai/dsh-app-boot')).href
  const plugin = pathToFileURL(resolve('packages/host/runtime/dist/host-log-plugin.mjs')).href
  const code = `import { Context } from ${JSON.stringify(cordis)}; import { installFailLoud } from ${JSON.stringify(boot)}; import * as plugin from ${JSON.stringify(plugin)};
    installFailLoud('synthetic'); const ctx = new Context(); await ctx.plugin(plugin);
    let failure = new Error('SYNTHETIC_DEEPEST_PROCESS_ROOT'); for(let i=0;i<10;i++) failure = new Error('Synthetic process wrapper '+i, {cause:failure});
    ${kind === 'rejection' ? 'Promise.reject(failure)' : 'setTimeout(() => { throw failure }, 0)'};`
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, timeout: 20_000 })
  expect(result.status).toBe(1)
  expect(result.stderr).toContain(kind === 'rejection' ? '[ElecKoi Host][unhandledRejection]' : '[ElecKoi Host][uncaughtException]')
  expect(result.stderr).toContain('SYNTHETIC_DEEPEST_PROCESS_ROOT')
}, 30_000)

it('exports early buffered failures and later named warnings with original cause fields', () => {
  const ctx = context(), output: string[] = []
  const cause = Object.assign(new Error('Synthetic storage root'), { code: 'SYNTHETIC_IO', path: '/synthetic/session' })
  ctx.logger.error(new Error('Synthetic startup wrapper', { cause }))
  installHostLogExporter(ctx, text => output.push(text))
  const early = output.join('')
  expect(early).toContain('Synthetic storage root')
  expect(early).toContain('SYNTHETIC_IO')
  expect(early).toContain('/synthetic/session')
  expect(early).toContain('Synthetic startup wrapper')
  ctx.logger('synthetic-provider').warn('Synthetic provider failed: %s', new Error('Synthetic provider root'))
  expect(output.at(-1)).toContain('[synthetic-provider]')
  expect(output.at(-1)).toContain('Synthetic provider root')
  expect(output.at(-1)).toContain('host-diagnostics.test.ts')
})

it('keeps deep aggregate causes, non-enumerable startup diagnostics and circular references', () => {
  const cause = Object.assign(new Error('Synthetic deepest cause'), { code: 'SYNTHETIC_ROOT', details: { endpoint: 'synthetic/failure' } })
  const aggregate = new AggregateError([new Error('Synthetic sibling'), cause], 'Synthetic aggregate', { cause })
  Object.defineProperty(aggregate, 'startup', { value: { failedPlugin: 'synthetic-plugin' } })
  cause.cause = aggregate
  const output = formatHostDiagnostic(aggregate)
  for (const text of ['Synthetic deepest cause', 'Synthetic sibling', 'Synthetic aggregate', 'SYNTHETIC_ROOT', 'synthetic/failure', 'synthetic-plugin', '[Circular']) expect(output).toContain(text)
})

it('preserves a product failure through Cordis without adding a stack to its wire fields', async () => {
  const ctx = context(), output: string[] = []
  installHostLogExporter(ctx, text => output.push(text))
  const failure = productFailure(ELECKOI_FAILURE_CODES.stateMismatch, 'Synthetic product configuration root', { what: 'synthetic marker' })
  expect(Object.getPrototypeOf(failure)).toBe(Object.prototype)
  expect(Object.keys(failure).sort()).toEqual(['code', 'details', 'isDSHRemoteError', 'message'])
  expect(JSON.parse(JSON.stringify(failure))).toEqual(failure)
  await expect(ctx.plugin({ name: 'synthetic-product-failure', apply() { throw failure } })).rejects.toMatchObject(failure)
  for (const text of ['Synthetic product configuration root', 'synthetic marker', 'host-diagnostics.test.ts']) expect(output.join('')).toContain(text)
})

it('preserves trailing errors and Unicode beyond the official formatter line length', () => {
  const ctx = context(), output: string[] = []
  installHostLogExporter(ctx, text => output.push(text))
  const failure = new Error(`${'合成🧪'.repeat(6000)} SYNTHETIC_FINAL_CAUSE`)
  ctx.logger.error('Synthetic operation failed', failure)
  expect(output.join('')).toContain(failure.message)
  expect(output.join('')).toContain('SYNTHETIC_FINAL_CAUSE')
})

it('keeps structured non-Error failures and redacts credentials before the stream write', () => {
  const ctx = context(), output: string[] = []
  installHostLogExporter(ctx, text => output.push(text))
  ctx.logger.error({ code: 'synthetic/invalid', message: 'Synthetic failure', details: { endpoint: 'synthetic/read', api_key: 'synthetic-private-value' } })
  expect(output.join('')).toContain('synthetic/invalid')
  expect(output.join('')).toContain('synthetic/read')
  expect(output.join('')).toContain('<redacted>')
  expect(output.join('')).not.toContain('synthetic-private-value')
})

it('exports a real Cordis plugin activation failure without replacing its reason', async () => {
  const ctx = context(), output: string[] = []
  installHostLogExporter(ctx, text => output.push(text))
  const cause = new Error('Synthetic plugin root')
  const plugin = ctx.plugin({ name: 'synthetic-failure', apply() { throw new Error('Synthetic plugin wrapper', { cause }) } })
  await expect(plugin).rejects.toThrow('Synthetic plugin wrapper')
  expect(output.join('')).toContain('Synthetic plugin root')
  expect(output.join('')).toContain('Synthetic plugin wrapper')
  expect(output.join('')).toContain('host-diagnostics.test.ts')
})

it('releases exporters, tolerates failed sinks and does not create another growing log buffer', async () => {
  const ctx = context(), output: string[] = []
  const owner = ctx.extend()
  const initial = ctx.logger.exporters.size
  installHostLogExporter(owner, text => output.push(text))
  for (let index = 0; index < 1200; index++) ctx.logger.warn('Synthetic warning %d', index)
  expect(output).toHaveLength(1200)
  expect(ctx.logger.buffer).toHaveLength(ctx.logger.bufferSize)
  await owner.fiber.dispose()
  expect(ctx.logger.exporters.size).toBe(initial)
  ctx.logger.warn('Synthetic after disposal')
  expect(output).toHaveLength(1200)
  installHostLogExporter(ctx, () => { throw new Error('Synthetic stream write failure') })
  expect(() => ctx.logger.error('Synthetic operation remains intact')).not.toThrow()
})

it('marks an already-overwritten startup buffer instead of claiming a complete capture', () => {
  const ctx = context(), output: string[] = []
  for (let index = 0; index < 1200; index++) ctx.logger.warn('Synthetic startup %d', index)
  installHostLogExporter(ctx, text => output.push(text))
  expect(output[0]).toContain('[diagnostic-gap]')
  expect(output.at(-1)).toContain('Synthetic startup 1199')
})
