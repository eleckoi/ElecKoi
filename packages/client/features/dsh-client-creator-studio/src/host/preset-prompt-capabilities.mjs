import { z } from 'zod'
import { catalogOf, directoryExists, inScope, relative, normalizePath, globRegex } from '@eleckoi/dsh-client-roleplay/host/virtual-setting-directory.mjs'
import { requiredSettingCache } from '@eleckoi/dsh-client-roleplay/host/required-setting-cache.mjs'
import { productFailure, ELECKOI_FAILURE_CODES } from '@eleckoi/dsh-product-api'

export const presetPromptToolset = {
  id: 'presetPrompts', title: '预设提示词', description: '按虚拟目录浏览、搜索和读取当前创作预设的 Agent 读取条目。',
  guide: [
    '本组只读当前工作室绑定的创作预设，不读取编辑目标的角色设定，也不访问工作区磁盘。不传 characterId 或 presetId。路径沿用预设内的文件夹和标题，使用 / 分隔，不带 .md 后缀。',
    '先 glob 查看目录、作者注释和 required_entries，再按需 grep 搜索或 read 读取准确路径。搜索不执行模板，也不触发关键词。已知路径可直接 read。',
    'required_entries 是全部已开启的必读条目，不受搜索条件限制；回复前用 read 核对尚未读取的必读项。必读正文已在本轮前置缓存设定区，正常读取只返回编号、标题和回执；选读返回正文。若前置正文已变化，读取直接返回当前正文。提示词常驻和摘要模板不在读取目录中。',
    '目录、搜索和读取结果溢出时，沿用 eleckoi_call_capability，只传提示中的 result，按 next_offset 续读直到 null，也可用 result.query 搜索全文；无需重新执行原操作。',
  ],
}

/** Read the bound preset live; the model cannot choose another preset or write these prompts. */
export function presetPromptCapabilities(readLibrary) {
  const operation = (name, title, schema, run) => ({
    id: `presetPrompts.${name}`, toolsetId: 'presetPrompts', title, effect: 'read', target: 'current-preset',
    inputSchema: z.toJSONSchema(schema),
    execute(_characterId, input, signal, cachedLibrary) {
      signal?.throwIfAborted()
      const args = schema.parse(input)
      const library = readLibrary()
      const catalog = catalogOf(library)
      const cache = requiredSettingCache(cachedLibrary)
      const summary = entry => {
        const cached = entry.readStrategy === 'required' && cache.find(item => item.id === entry.raw.id && item.title === (entry.raw.title.trim() || '未命名设定') && item.content === entry.content)
        return { id: entry.raw.id, path: entry.path, title: entry.raw.title,
          selection_hint: entry.selectionHint, read_strategy: entry.readStrategy,
          content_delivery: cached ? 'cached_reference' : 'tool_result',
          ...(cached ? { cached_reference: cached.reference } : {}) }
      }
      const required = catalog.entries.filter(entry => entry.readStrategy === 'required').map(summary)
      const scope = normalizePath(args.path ?? '', true)
      if (scope === null || !directoryExists(catalog, scope)) throw productFailure(ELECKOI_FAILURE_CODES.inputInvalid, 'path 必须是预设中存在的虚拟目录。', { field: 'path' })
      const result = run({ args, catalog, cache, summary, required, scope })
      signal?.throwIfAborted()
      return result
    },
  })
  const path = z.string().optional().describe('可选的准确虚拟目录，递归包含子目录。')
  return [
    operation('glob', '按路径查找预设提示词', z.object({ pattern: z.string().optional(), path }).strict(), ({ args, catalog, summary, required, scope }) => {
      const match = globRegex(args.pattern?.trim() || '**')
      const files = catalog.entries.filter(entry => inScope(entry.path, scope) && match.test(relative(entry.path, scope))).map(summary)
      return { status: files.length ? 'ok' : 'no_matches', path: scope, required_entries: required, files }
    }),
    operation('grep', '搜索预设提示词路径、注释和正文', z.object({ pattern: z.string().min(1), path,
      glob: z.string().optional(), ignore_case: z.boolean().optional(),
      output_mode: z.enum(['files_with_matches', 'content', 'count']).optional(),
    }).strict(), ({ args, catalog, summary, required, scope }) => {
      const expression = new RegExp(args.pattern, args.ignore_case ? 'i' : '')
      const match = args.glob ? globRegex(args.glob) : null
      const matches = []
      for (const entry of catalog.entries) {
        if (!inScope(entry.path, scope) || match && !match.test(relative(entry.path, scope))) continue
        const hits = `${entry.path}\n${entry.selectionHint}\n${entry.content}`.split('\n')
          .flatMap((text, index) => expression.test(text) ? [{ line: index + 1, text }] : [])
        if (!hits.length) continue
        if (args.output_mode === 'content') matches.push(...hits.map(hit => ({ ...summary(entry), ...hit })))
        else if (args.output_mode === 'count') matches.push({ ...summary(entry), count: hits.length })
        else matches.push(summary(entry))
      }
      return { status: matches.length ? 'ok' : 'no_matches', required_entries: required, matches }
    }),
    operation('read', '读取预设提示词，必读返回前置正文的回执', z.object({ paths: z.array(z.string().min(1)).min(1) }).strict(), ({ args, catalog, cache, summary }) => {
      const paths = [...new Set(args.paths.map(path => normalizePath(path, false)))]
      if (paths.some(path => path === null || !catalog.byPath.has(path))) throw productFailure(ELECKOI_FAILURE_CODES.lookupNotFound, '存在当前预设没有的可读路径，请重新查看目录。', { what: '预设提示词路径' })
      return { status: 'ok', files: paths.map(path => {
        const entry = catalog.byPath.get(path)
        const info = summary(entry)
        const cached = info.cached_reference && cache.find(item => item.reference === info.cached_reference)
        return { ...info, group_path: entry.groupPath, content: cached ? cached.receipt : entry.content }
      }) }
    }),
  ]
}
