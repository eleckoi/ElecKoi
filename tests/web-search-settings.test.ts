import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TavilyClient } from '../src/main/modules/agentTools/TavilyClient'
import { WebSearchSettingsRepository } from '../src/main/modules/agentTools/WebSearchSettingsRepository'
import { SqliteDatabase } from '../src/main/platform/sqlite/SqliteDatabase'

const directories: string[] = []
const databases: SqliteDatabase[] = []

afterEach(() => {
  for (const database of databases.splice(0)) database.close()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function repository() {
  const directory = mkdtempSync(join(tmpdir(), 'eleckoi-web-search-test-'))
  directories.push(directory)
  const database = new SqliteDatabase(join(directory, 'eleckoi.sqlite3'))
  database.open()
  databases.push(database)
  const cipher = {
    encrypt: (value: string) => `secure:${Buffer.from(value).toString('base64')}`,
    decrypt: (value: string) => Buffer.from(value.slice('secure:'.length), 'base64').toString()
  }
  return { database, settings: new WebSearchSettingsRepository(database, cipher) }
}

describe('web search settings', () => {
  it('keeps provider selection global and never persists a plaintext Tavily key', () => {
    const { database, settings } = repository()

    expect(settings.read()).toEqual({ mode: 'provider_native', apiKeyConfigured: false, maxResults: 5 })
    expect(settings.update({ mode: 'tavily', maxResults: 8 })).toEqual({
      mode: 'tavily', apiKeyConfigured: false, maxResults: 8
    })
    expect(settings.saveTavilyApiKey('tvly-secret')).toEqual({
      mode: 'tavily', apiKeyConfigured: true, maxResults: 8
    })
    expect(database.native.prepare('SELECT payloadJson FROM global_tool_config WHERE singletonId = 1').get())
      .not.toMatchObject({ payloadJson: expect.stringContaining('tvly-secret') })
    expect(settings.runtimeSettings()).toEqual({ mode: 'tavily', maxResults: 8, tavilyApiKey: 'tvly-secret' })
    expect(settings.removeTavilyApiKey().apiKeyConfigured).toBe(false)
  })

  it('updates only the web-search slice of the shared global tool configuration', () => {
    const { database, settings } = repository()
    settings.update({ mode: 'provider_native', maxResults: 5 })
    database.native.prepare('UPDATE global_tool_config SET payloadJson = ? WHERE singletonId = 1')
      .run(JSON.stringify({ version: 1, futureTool: { enabled: true }, webSearch: { mode: 'provider_native', maxResults: 5, tavilyApiKey: '' } }))

    settings.update({ mode: 'tavily', maxResults: 3 })

    const row = database.native.prepare('SELECT payloadJson FROM global_tool_config WHERE singletonId = 1').get() as { payloadJson: string }
    expect(JSON.parse(row.payloadJson)).toMatchObject({
      futureTool: { enabled: true },
      webSearch: { mode: 'tavily', maxResults: 3 }
    })
  })

  it('tests Tavily through the usage endpoint without exposing the key in results', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      key: { usage: 12, limit: 100 }, account: { current_plan: 'Project' }
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const client = new TavilyClient(request)

    await expect(client.test('tvly-test')).resolves.toEqual({
      ok: true, plan: 'Project', used: 12, limit: 100
    })
    expect(request).toHaveBeenCalledWith('https://api.tavily.com/usage', expect.objectContaining({
      method: 'GET', redirect: 'error', headers: expect.objectContaining({ Authorization: 'Bearer tvly-test' })
    }))
  })
})
