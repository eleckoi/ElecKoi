import { defineTool } from '@deepseek-ai/dsh-tools'
import { readToolResult, resultReadParameter } from '@eleckoi/dsh-client-roleplay/host/tool-result-access.mjs'

export const name = 'eleckoi-uploaded-file-tools'
export const inject = ['tools', 'sessionQuery', 'attachments', 'fs']

export function apply(ctx) {
  return ctx.tools.register(defineTool({
    name: 'eleckoi_read_uploaded_file',
    description: '读取当前会话用户上传的文件。传入消息中显示的只读文件路径或完整 sha256 附件编号。默认返回完整正文，可用 offset、limit 显式分页；只允许读取当前会话仍在模型历史中的上传文件。',
    parameters: {
      file_path: { type: 'string', description: '读取原文件时必填：文件的只读路径或完整 sha256 附件编号。' },
      offset: { type: 'integer', description: '从第几个字节开始，默认 0。' },
      limit: { type: 'integer', description: '可选的本页字节数；省略时读取剩余全部正文。' },
      result: resultReadParameter
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args, exec) {
      if (Object.hasOwn(args, 'result')) return readToolResult(ctx, args, exec, 'uploads')
      const sessionId = exec?.agent?.session?.id
      if (!sessionId) return { status: 'error', message: '当前没有可读取的会话。' }
      const requested = String(args.file_path || '').trim()
      const offset = args.offset ?? 0
      if (!Number.isSafeInteger(offset) || offset < 0) return { status: 'error', message: 'offset 必须是非负整数。' }
      if (args.limit !== undefined && (!Number.isSafeInteger(args.limit) || args.limit < 1)) return { status: 'error', message: 'limit 必须是正整数。' }
      const surface = await ctx.sessionQuery.readSurface(sessionId)
      const files = surface.events.flatMap((event) => {
        if (event.type !== 'user/message') return []
        const message = event.data?.message ?? event.data
        if (message?.source?.kind !== 'user' || !Array.isArray(message.content)) return []
        return message.content.filter((part) => part?.type === 'file').map((part) => part.attachment)
      }).filter(Boolean)
      const reference = files.find((file) => {
        if (!/^sha256:[a-f0-9]{64}$/.test(String(file.attachmentId))) return false
        const hostPath = ctx.attachments.fileHostPath(file)
        const processPath = hostPath && ctx.fs.processPathFromHostPath(hostPath)
        return requested === file.attachmentId || requested === hostPath || requested === processPath
      })
      if (!reference) return { status: 'error', message: '此文件不在当前会话的可读附件中。' }
      const limit = args.limit ?? Infinity
      const chunks = []
      let position = 0
      let selected = 0
      for await (const chunk of ctx.attachments.readFileStream(reference, exec.signal)) {
        const end = position + chunk.length
        if (end > offset && selected < limit) {
          const start = Math.max(0, offset - position)
          const count = Math.min(chunk.length - start, limit - selected)
          chunks.push(chunk.subarray(start, start + count))
          selected += count
        }
        position = end
      }
      const bytes = Buffer.concat(chunks)
      if (bytes.includes(0)) return { status: 'error', message: '此文件是二进制内容，无法作为文本读取。' }
      return {
        status: 'ok', name: reference.name, offset, bytes: bytes.length,
        next_offset: offset + bytes.length < reference.bytes ? offset + bytes.length : null,
        content: new TextDecoder().decode(bytes)
      }
    }
  }))
}
