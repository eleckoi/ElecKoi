import type { Context } from '@deepseek-ai/cordis'
import type { ElecKoiConversations, ConversationClientDetails } from '@eleckoi/dsh-client-conversations/client'
import type { AuthorRequestOptions } from '@eleckoi/author-sdk/browser'
import { NativeSpeechProviders, type NativeSpeechProvider } from './speech-providers.js'
import type { NativeAudioRuntime } from './audio.js'

export const nativeTavernClientMethods = new Set([
  'generation.generate', 'generation.stop', 'chat.create', 'chat.open', 'chat.delete', 'chat.branch',
  'chat.temporary', 'chat.close', 'chat.openHistory', 'worldbook.openEditor', 'extensions.openMenu',
  'tts.speak', 'tts.stop', 'tts.voices',
  'appearance.backgrounds', 'appearance.selectBackground', 'appearance.lockBackground', 'appearance.messageStyle', 'appearance.theme', 'appearance.palette',
])
type Params = Record<string, unknown>
const object = (value: unknown): Params => value && typeof value === 'object' && !Array.isArray(value) ? value as Params : {}

/** Compatibility calls reuse the selected native Session, catalog and mounted product UI. */
export class NativeTavernClient {
  private readonly temporaryChats = new Set<string>()
  private readonly speech: NativeSpeechProviders
  constructor(private readonly options: {
    window: Window
    conversations: ElecKoiConversations
    remote: Pick<Context['remote'], 'eleckoiConversations'>
    createId(): string
    audio?(): NativeAudioRuntime
    speechProviders?: Map<string, NativeSpeechProvider>
    invokeHost?(conversationId: string, method: string, params: Params): Promise<unknown>
    report?(error: unknown): void
    ui(conversationId: string, method: string, params: Params): unknown | Promise<unknown>
  }) { this.speech = new NativeSpeechProviders({ window: options.window, createId: options.createId,
    audio: () => { if (!options.audio) throw new Error('原生语音播放器没有连接。'); return options.audio() },
    providers: options.speechProviders ?? new Map(), host: options.invokeHost, report: options.report ?? (error => globalThis.console.error(error)) }) }

  private details(conversationId: string): ConversationClientDetails {
    const current = this.options.conversations.getDetailsSnapshot()
    if (current.id !== conversationId || current.status !== 'ready' || !current.details) throw new Error('The requested native chat is not ready.')
    return current.details
  }

  async invoke(conversationId: string, method: string, params: Params, request: AuthorRequestOptions): Promise<unknown> {
    request.signal.throwIfAborted()
    const conversations = this.options.conversations
    if (method === 'tts.voices') return this.speech.voices(conversationId, params)
    if (method === 'tts.stop') return this.speech.stop()
    if (method === 'tts.speak') { await this.speech.speak(conversationId, params.text as string, params, request.signal); return true }
    const ui = (name: string, value: Params = {}) => this.options.ui(conversationId, name, value)
    const navigate = async (id: string) => {
      request.signal.throwIfAborted(); request.commitContextChange?.()
      await ui('compatibility.navigate', { id })
      const selected = conversations.getDetailsSnapshot()
      if (id && (selected.id !== id || selected.status !== 'ready' || !selected.details)) throw new Error('Native chat navigation did not open the requested conversation.')
      if (!id && selected.id) throw new Error('Native chat navigation did not close the conversation.')
      return selected.details
    }
    if (method.startsWith('appearance.')) {
      if (method === 'appearance.theme') request.commitContextChange?.()
      return ui('compatibility.appearance', { method, args: params.args })
    }
    if (method === 'chat.openHistory') return ui('ui.openHistory')
    if (method === 'worldbook.openEditor') return ui('compatibility.openWorldbook', params)
    if (method === 'extensions.openMenu') return ui('compatibility.openExtension', params)
    if (method === 'generation.stop') return { cancelled: await conversations.cancelGeneration(conversationId) }
    if (method === 'chat.close') {
      const target = typeof params.id === 'string' && params.id ? params.id : conversationId
      if (target !== conversationId) throw new Error('Only the selected chat can be closed.')
      await navigate('')
      if (this.temporaryChats.delete(target)) await conversations.delete(target)
      return null
    }
    if (method === 'chat.open' || method === 'chat.delete') {
      if (typeof params.id !== 'string' || !params.id) throw new TypeError('A native chat id is required.')
      const catalog = await conversations.refresh()
      request.signal.throwIfAborted()
      if (!catalog.some(item => item.id === params.id)) throw new Error(`Native chat does not exist: ${params.id}`)
      if (method === 'chat.open') {
        const opened = await navigate(params.id)
        if (conversationId !== params.id && this.temporaryChats.delete(conversationId)) await conversations.delete(conversationId)
        return opened?.conversation ?? null
      }
      if (params.id === conversationId) await navigate('')
      await conversations.delete(params.id)
      this.temporaryChats.delete(params.id)
      return { deletedId: params.id }
    }
    if (method === 'chat.create' || method === 'chat.temporary') {
      const current = conversations.getDetailsSnapshot()
      const currentDetails = current.id === conversationId && current.status === 'ready' ? current.details : null
      const characterId = typeof params.characterId === 'string' && params.characterId ? params.characterId : currentDetails?.metadata.characterId
      if (!characterId) throw new Error('Choose a native character before creating a chat, or pass an explicit characterId.')
      const metadata = { ...currentDetails?.metadata, characterId, ...(typeof params.characterId === 'string' && params.characterId ? { characterName: typeof params.characterName === 'string' ? params.characterName : '' } : {}) }
      const created = await conversations.create({ title: typeof params.title === 'string' ? params.title : metadata.characterName || 'New chat', metadata })
      request.signal.throwIfAborted()
      if (method === 'chat.temporary') {
        this.temporaryChats.add(created.conversation.id)
        try { await navigate(created.conversation.id) }
        catch (error) { this.temporaryChats.delete(created.conversation.id); await conversations.delete(created.conversation.id); throw error }
      }
      return { ...created.conversation, name: created.conversation.title }
    }
    const details = this.details(conversationId)
    if (method === 'generation.generate') {
      const kind = typeof params.type === 'string' ? params.type : 'normal'
      const settings = object(params.options), requestId = this.options.createId()
      let result
      const groupId = typeof params.groupId === 'string' ? params.groupId : details.metadata.groupId
      if (kind === 'normal' && typeof groupId === 'string' && groupId) {
        const draft = conversations.readInputDraft(conversationId)
        result = await conversations.groupGenerate({ conversationId, groupId, requestId, signal: request.signal, options: settings,
          ...(draft.trim() ? { text: draft } : {}),
          ...(Array.isArray(settings.images) ? { images: settings.images as Parameters<ElecKoiConversations['send']>[0]['images'] } : {}),
          ...(Array.isArray(settings.files) ? { files: settings.files as string[] } : {}),
          ...(Array.isArray(params.memberIds) ? { memberIds: params.memberIds as string[] } : {}) })
        if (draft.trim() && conversations.getDetailsSnapshot().id === conversationId && conversations.readInputDraft(conversationId) === draft) conversations.writeInputDraft(conversationId, '')
      } else if (kind === 'continue') {
        result = await conversations.continue({ conversationId, requestId, signal: request.signal })
      } else if (kind === 'regenerate' || kind === 'swipe' || kind === 'normal' && !conversations.readInputDraft(conversationId).trim()) {
        const assistant = details.messages.findLast(message => message.role === 'assistant')
        const input = kind === 'normal' || assistant?.inputEventSeq === undefined ? details.messages.findLast(message => message.role === 'user')
          : details.messages.find(message => message.role === 'user' && message.sessionEventSeq === assistant.inputEventSeq)
        if (!input || !Number.isSafeInteger(input.sessionEventSeq)) throw new Error('There is no native user input to generate from; enter a message first.')
        result = await conversations.regenerate({ conversationId, requestId, eventSeq: input.sessionEventSeq!, signal: request.signal })
      } else if (kind === 'normal') {
        const draft = conversations.readInputDraft(conversationId)
        result = await conversations.send({ conversationId, requestId, text: draft, signal: request.signal,
          ...(Array.isArray(settings.images) ? { images: settings.images as Parameters<ElecKoiConversations['send']>[0]['images'] } : {}) })
        if (conversations.getDetailsSnapshot().id === conversationId && conversations.readInputDraft(conversationId) === draft) conversations.writeInputDraft(conversationId, '')
      } else throw new Error(`Native Agent generation mode is not connected: ${kind}`)
      request.signal.throwIfAborted()
      if (result.cancelled) throw new Error('Native Agent generation was cancelled.')
      const reply = result.details?.messages.findLast(message => message.role === 'assistant')
      return reply?.content ?? ''
    }
    if (method === 'chat.branch') {
      let history = details
      if (typeof params.messageId === 'string') {
        while (history.hasMore && history.beforeSequence !== null) {
          const page = await conversations.pageOlder(conversationId, history.beforeSequence)
          request.signal.throwIfAborted()
          if (!page) throw new Error('The native history changed while locating the branch message.')
          history = this.details(conversationId)
        }
      }
      const index = typeof params.messageId === 'string' ? history.messages.findIndex(message => message.id === params.messageId) : Number(params.index)
      const row = history.messages[index]
      if (!Number.isSafeInteger(index) || index < 0 || !row) throw new TypeError('The branch message index does not exist.')
      if (row.id !== 'opening' && !Number.isSafeInteger(row.sessionEventSeq)) throw new Error('The branch message has no native Session event.')
      const title = typeof params.name === 'string' && params.name ? params.name : `${details.conversation.title} · ${index + 1}`
      const retained = [...new Set(history.messages.slice(0, index + 1).flatMap(message => message.turnId ? [message.turnId] : []))]
      const response = await this.options.remote.eleckoiConversations.fork(conversationId, row.id === 'opening' ? undefined : row.continuationEventSeqs?.at(-1) ?? row.sessionEventSeq, retained, title)
      if (!response.ok) throw new Error(response.error.message)
      await conversations.refresh(); request.signal.throwIfAborted()
      return { id: response.value, name: title }
    }
    throw new Error(`Unknown native Tavern client method: ${method}`)
  }

  async dispose(): Promise<void> {
    this.speech.dispose()
    const ids = [...this.temporaryChats]; this.temporaryChats.clear()
    for (const id of ids) await this.options.conversations.delete(id)
  }
}
