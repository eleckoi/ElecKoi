import { z } from 'zod'
import { catalogOf, directoryExists, inScope, relative, normalizePath, globRegex } from '@eleckoi/dsh-client-roleplay/host/virtual-setting-directory.mjs'
import { productFailure, ELECKOI_FAILURE_CODES } from '@eleckoi/dsh-product-api'

export const presetPromptToolset = {
  id: 'presetPrompts', title: '预设提示词', description: '按虚拟目录浏览、搜索和读取当前创作预设的 AI 选读提示词。',
  guide: [
    '本组只读当前工作室绑定的创作预设，不读取编辑目标的角色设定，也不访问工作区磁盘。不传 characterId 或 presetId。路径沿用预设内的文件夹和标题，使用 / 分隔，不带 .md 后缀。',
    '用 glob 查看目录与作者注释，按需用 grep 搜索，再用 read 按准确路径读取正文；已知路径可直接读取。目录仅包含启用 AI 选读的提示词。',
    '目录、搜索和读取结果溢出时，沿用 eleckoi_call_capability，只传提示中的 result，按 next_offset 续读直到 null，也可用 result.query 搜索全文；无需重新执行原操作。',
  ],
}

/** Read the bound preset live; the model cannot choose another preset or write these prompts. */
export function presetPromptCapabilities(readLibrary) {
  const operation = (name, title, schema, run) => ({
    id: `presetPrompts.${name}`, toolsetId: 'presetPrompts', title, effect: 'read', target: 'current-preset',
    inputSchema: { ...z.toJSONSchema(schema) },
    execute(_characterId, input, signal) {
      signal?.throwIfAborted()
      const args = schema.parse(input)
      const library = readLibrary()
      const catalog = catalogOf(library)
      const summary = entry => ({ id: entry.raw.id, path: entry.path, title: entry.raw.title,
        selection_hint: entry.selectionHint, read_strategy: entry.readStrategy, content_delivery: 'tool_result' })
      const scope = normalizePath(args.path ?? '', true)
      if (scope === null || !directoryExists(catalog, scope)) throw productFailure(ELECKOI_FAILURE_CODES.inputInvalid, 'path 必须是预设中存在的虚拟目录。', { field: 'path' })
      const result = run({ args, catalog, summary, scope })
      signal?.throwIfAborted()
      return result
    },
  })
  const path = z.string().optional().describe('可选的准确虚拟目录，递归包含子目录。')
  return [
    operation('glob', '按路径查找预设提示词', z.object({ pattern: z.string().optional(), path }).strict(), ({ args, catalog, summary, scope }) => {
      const match = globRegex(args.pattern?.trim() || '**')
      const files = catalog.entries.filter(entry => inScope(entry.path, scope) && match.test(relative(entry.path, scope))).map(summary)
      return { status: files.length ? 'ok' : 'no_matches', path: scope, files }
    }),
    operation('grep', '搜索预设提示词路径、注释和正文', z.object({ pattern: z.string().min(1), path,
      glob: z.string().optional(), ignore_case: z.boolean().optional(),
      output_mode: z.enum(['files_with_matches', 'content', 'count']).optional(),
    }).strict(), ({ args, catalog, summary, scope }) => {
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
      return { status: matches.length ? 'ok' : 'no_matches', matches }
    }),
    operation('read', '读取 AI 选读提示词正文', z.object({ paths: z.array(z.string().min(1)).min(1) }).strict(), ({ args, catalog, summary }) => {
      const paths = [...new Set(args.paths.map(path => normalizePath(path, false)))]
      if (paths.some(path => path === null || !catalog.byPath.has(path))) throw productFailure(ELECKOI_FAILURE_CODES.lookupNotFound, '存在当前预设没有的可读路径，请重新查看目录。', { what: '预设提示词路径' })
      return { status: 'ok', files: paths.map(path => {
        const entry = catalog.byPath.get(path)
        return { ...summary(entry), group_path: entry.groupPath, content: entry.content }
      }) }
    }),
  ]
}
