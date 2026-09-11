import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ModelRepository } from '../src/main/modules/models/ModelRepository'
import { SqliteDatabase } from '../src/main/platform/sqlite/SqliteDatabase'

const directories: string[] = []
const databases: SqliteDatabase[] = []

afterEach(() => {
  for (const database of databases.splice(0)) database.close()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function createRepository() {
  const directory = mkdtempSync(join(tmpdir(), 'eleckoi-model-provider-test-'))
  directories.push(directory)
  const database = new SqliteDatabase(join(directory, 'eleckoi.sqlite3'))
  database.open()
  databases.push(database)
  const cipher = {
    encrypt: (value: string) => `enc:${value}`,
    decrypt: (value: string) => value.startsWith('enc:') ? value.slice(4) : value
  }
  return new ModelRepository(database, cipher)
}

describe('model repository providers', () => {
  it.each([
    ['zhipu', 'https://open.bigmodel.cn/api/paas/v4', '', {}],
    ['zai', 'https://api.z.ai/api/paas/v4', '', {}],
    ['moonshot', 'https://api.moonshot.cn/v1', '', {}],
    ['openai_image', 'https://api.openai.com/v1', 'gpt-image-2', { width: 1024, height: 1536, quality: 'auto', background: 'auto' }],
    ['novelai_image', 'https://image.novelai.net', 'nai-diffusion-4-5-full', { width: 832, height: 1216, steps: 28, scale: 5, sampler: 'k_euler_ancestral' }]
  ] as const)('persists Android-aligned defaults for %s', (provider, baseUrl, model, imageSettings) => {
    const repository = createRepository()
    repository.save({ id: `${provider}-config`, provider })
    expect(repository.list()[0]).toMatchObject({
      provider,
      base_url: baseUrl,
      model,
      api_format: 'chat_completions',
      enabled: provider !== 'openai_image' && provider !== 'novelai_image',
      image_settings: imageSettings
    })
  })

  it('never resolves an image configuration as the chat runtime model', () => {
    const repository = createRepository()
    repository.save({ id: 'image', provider: 'openai_image', api_key: 'image-key', enabled: true })
    repository.save({
      id: 'chat',
      provider: 'custom',
      api_key: 'chat-key',
      base_url: 'https://chat.example/v1',
      model: 'chat-model',
      model_options: [{ id: 'chat-model', name: 'chat-model' }],
      api_format: 'chat_completions',
      enabled: true
    })
    expect(repository.resolve({
      capability: 'chat',
      config_id: 'image',
      model: 'gpt-image-2',
      parameters: { stream: true, temperature: 1, top_p: 1 }
    }, 'system'))
      .toMatchObject({ apiKey: 'chat-key', baseUrl: 'https://chat.example/v1', model: 'chat-model' })
  })

  it('deletes every configuration owned by an optional provider in one transaction', () => {
    const repository = createRepository()
    repository.ensureDefault()
    repository.save({ id: 'novelai-primary', provider: 'novelai_image', name: 'NovelAI 主配置' })
    repository.save({ id: 'novelai-secondary', provider: 'novelai_image', name: 'NovelAI 备用配置' })

    const remaining = repository.deleteProvider('novelai_image')

    expect(remaining.map((item) => item.id)).toEqual(['deepseek-default'])
    expect(repository.list().some((item) => item.provider === 'novelai_image')).toBe(false)
  })

  it('refuses to delete fixed provider entries', () => {
    const repository = createRepository()
    repository.ensureDefault()

    expect(() => repository.deleteProvider('deepseek')).toThrow('固定模型入口不能删除。')
    expect(() => repository.deleteProvider('custom')).toThrow('固定模型入口不能删除。')
    expect(repository.list().map((item) => item.id)).toEqual(['deepseek-default'])
  })
})
