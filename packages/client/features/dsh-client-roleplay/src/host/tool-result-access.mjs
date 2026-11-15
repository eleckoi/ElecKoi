import { productFailure, ELECKOI_FAILURE_CODES } from '@eleckoi/dsh-product-api'

export const RESULT_READERS = Object.freeze({
  settings: 'eleckoi_read_setting_files',
  variables: 'eleckoi_read_variables',
  creator: 'eleckoi_call_capability',
})

const sources = Object.freeze({
  settings: ['eleckoi_glob_setting_files', 'eleckoi_grep_setting_files', 'eleckoi_read_setting_files', 'eleckoi_apply_setting_patch'],
  variables: ['eleckoi_glob_variables', 'eleckoi_grep_variables', 'eleckoi_read_variables', 'eleckoi_apply_variable_patch'],
  creator: ['eleckoi_list_toolsets', 'eleckoi_describe_toolset', 'eleckoi_call_capability'],
})

export const resultReadParameter = {
  type: 'object',
  description: '续读本工具组的溢出结果。只传 result，不同时传普通业务参数；file_path 使用溢出提示的准确路径。按 next_offset 连续读取直到 null，无总量或页数上限；query 为区分大小写的文字搜索。文件失效时重新查询源数据，不重做写操作。',
  additionalProperties: false,
  properties: {
    file_path: { type: 'string', required: true },
    offset: { type: 'integer', description: 'UTF-8 字节偏移量，默认 0；后续使用 next_offset。' },
    limit: { type: 'integer', description: '本页最多读取字节数，默认 32768；搜索时为本页命中数，默认 50。可续读全部结果。' },
    query: { type: 'string', description: '可选的文字搜索，不是正则表达式。' },
  },
}

export function resultDomain(toolName) {
  return Object.keys(sources).find(domain => sources[domain].includes(toolName))
}

export function canReadResult(domain, toolName) {
  return sources[domain]?.includes(toolName) === true
}

export function readToolResult(ctx, args, exec, domain) {
  if (Object.keys(args).some(key => key !== 'result') || !args.result || typeof args.result !== 'object' || Array.isArray(args.result)) {
    throw productFailure(ELECKOI_FAILURE_CODES.inputInvalid, '续读工具结果时只传 result，不同时传普通业务参数。', { field: 'result' })
  }
  const store = ctx.get('spillStore')
  if (typeof store?.readResult !== 'function') throw productFailure(ELECKOI_FAILURE_CODES.lifecycleNotReady, '当前 Host 未提供本工具组的结果续读服务。', { what: '工具结果续读服务' })
  return store.readResult(args.result, exec, domain)
}
