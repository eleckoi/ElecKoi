window.__ModuleLoader__.load({
  id: '@eleckoi/dsh-client-conversations',
  factory(require) {
    const React = require('react')
    // 边界⑥ 的信封拆解只有一份实现（@eleckoi/dsh-product-api 的 client 面）。
    const { unwrapOrFail, internalFailure, failureAlreadyPublished, rejectionIsAwaitedElsewhere, bestEffort, productFailure, ELECKOI_FAILURE_CODES } = require('@eleckoi/dsh-product-api')
    /**
     * 载体不是产品失败（例如 LLM 的 `LlmFailure`：`{ message, code, status }`）时的折法：
     * 折成兜底码，provider 的 message 当诊断（不写 `details.what`，所以它仍能给用户看），
     * provider 的 code / status 进详情供日志诊断。
     */
    const providerFailure = (error, fallback) => internalFailure(
      typeof error?.message === 'string' && error.message.trim() ? error.message : fallback,
      {
        ...typeof error?.code === 'string' && error.code ? { code: error.code } : {},
        ...error?.status !== undefined ? { status: error.status } : {}
      })
    /** 失败已经由被调方发了快照，这里只留一行诊断（console 会被主窗口转发进主日志）。 */
    const reportClientFailure = (what, error) => console.error(`[eleckoi-client-failure] ${what}`, error)
    const EMPTY_ITEMS = Object.freeze([])
    const MessagesPage = React.lazy(() => import(new URL('eleckoi-page-messages.js', new URL(globalThis.__ELECKOI_CLIENT_ASSETS__.script, location.href)).href)
      .then(module => ({ default: module.MessagesPage })))

    // Chat publishes new immutable block values when text changes. Weak keys
    // release derived text with the corresponding loaded history or live frame.
    const contentTextCache = new WeakMap()
    function contentText(content) {
      if (!Array.isArray(content)) return ''
      if (!contentTextCache.has(content)) contentTextCache.set(content,
        content.filter(block => block?.type === 'text').map(block => String(block.text || '')).join(''))
      return contentTextCache.get(content)
    }

    const assistantContentCache = new WeakMap()
    function assistantContent(blocks) {
      if (!Array.isArray(blocks)) return { text: '', final: '', live: { started: false, content: '' } }
      let cached = assistantContentCache.get(blocks)
      if (!cached) {
        const text = blocks.filter(block => block?.kind === 'text').map(block => String(block.text || '')).join('')
        cached = { text, final: finalReplyText(text), live: liveFinalReply(text) }
        assistantContentCache.set(blocks, cached)
      }
      return cached
    }
    const assistantText = blocks => assistantContent(blocks).text

    const FinalOpenTag = '<FINAL>'
    const FinalCloseTag = '</FINAL>'

    const removeLeadingLineBreak = value => value.replace(/^(?:\r\n|\r|\n)/, '')
    const removeTrailingLineBreak = value => value.replace(/(?:\r\n|\r|\n)$/, '')

    function withoutPartialFinalClose(value) {
      for (let length = FinalCloseTag.length - 1; length > 0; length -= 1) {
        if (value.endsWith(FinalCloseTag.slice(0, length))) {
          return removeTrailingLineBreak(value.slice(0, -length))
        }
      }
      return value
    }

    function finalReplyText(value) {
      const markerIndex = value.indexOf(FinalOpenTag)
      if (markerIndex < 0) return value
      const content = removeLeadingLineBreak(value.slice(markerIndex + FinalOpenTag.length))
      return removeTrailingLineBreak(content.replace(/(?:\r\n|\r|\n)?<\/FINAL>/g, ''))
    }

    function liveFinalReply(value) {
      const markerIndex = value.indexOf(FinalOpenTag)
      if (markerIndex < 0) return { started: false, content: '' }
      return {
        started: true,
        content: withoutPartialFinalClose(finalReplyText(value))
      }
    }

    const processText = content => Array.isArray(content)
      ? content.map(block => block?.type === 'text' ? String(block.text || '') : JSON.stringify(block)).join('\n')
      : ''

    const processKind = name => name === 'subagent' || name === 'subagent_fork' ? 'subagent' : 'tool'

    const orderedChatEntries = snapshot => Array.isArray(snapshot?.order)
      ? snapshot.order.map(key => ({ key, node: snapshot.nodes?.get(key) }))
        .filter(entry => entry.node && entry.node.visibility !== 'hidden')
      : []

    const orderedChatNodes = snapshot => orderedChatEntries(snapshot).map(entry => entry.node)

    const sameReferences = (left = [], right = []) => left === right
      || left.length === right.length && left.every((item, index) => item === right[index])

    const sameRecord = (left, right) => left === right || Boolean(left && right)
      && Object.keys(left).length === Object.keys(right).length
      && Object.keys(left).every(key => Object.prototype.hasOwnProperty.call(right, key) && left[key] === right[key])

    const processFields = ['id', 'kind', 'status', 'toolName', 'arguments', 'summary', 'detail', 'displayDetail',
      'startedAtMillis', 'completedAtMillis', 'parentId']
    function sameProcess(left, right) {
      if (left === right) return true
      const before = Array.isArray(left) ? left : EMPTY_ITEMS
      const after = Array.isArray(right) ? right : EMPTY_ITEMS
      return before.length === after.length && before.every((item, index) => item === after[index]
        || processFields.every(key => item?.[key] === after[index]?.[key]))
    }

    function sameStreamSnapshot(left, right) {
      return ['id', 'status', 'runId', 'requestId', 'messageId', 'renderKey', 'dshTurn',
        'nodeKey', 'content', 'error'].every(key => left?.[key] === right?.[key])
        && sameProcess(left?.process, right?.process)
    }

    function sameDisplayProjection(left, id, input) {
      return left?.id === id && left.input.length === input.length && left.input.every((message, index) => {
        const next = input[index]
        return ['id', 'role', 'variableStateJson', 'status', 'createdAt'].every(key => message[key] === next[key])
          && (message.role === 'assistant' && message.status === 'streaming' || message.content === next.content)
          && sameReasoningInput(message.reasoning, next.reasoning)
      })
    }

    function sameReasoningInput(left = EMPTY_ITEMS, right = EMPTY_ITEMS) {
      return left === right || left.length === right.length && left.every((item, index) => item.id === right[index].id && item.text === right[index].text)
    }

    function reasoningText(item) {
      return typeof item.detail === 'string' && item.detail.trim() ? item.detail : item.summary || ''
    }

    const messageAttachmentFields = new Set(['inputImageAttachments', 'inputFileAttachments', 'generatedImageAttachments'])
    function reuseMessage(source, message) {
      if (!source || Object.keys(source).length !== Object.keys(message).length) return message
      return Object.keys(message).every(key => {
        if (!Object.prototype.hasOwnProperty.call(source, key)) return false
        if (source[key] === message[key]) return true
        if (key === 'processTiming') return sameRecord(source[key], message[key])
        if (key === 'process') return sameReferences(source[key], message[key])
        return messageAttachmentFields.has(key) && Array.isArray(source[key]) && Array.isArray(message[key])
          && source[key].length === message[key].length
          && source[key].every((item, index) => sameRecord(item, message[key][index]))
      }) ? source : message
    }

    function nodeTurn(node) {
      const turn = node?.location?.kind === 'step' || node?.location?.kind === 'turn'
        ? node.location.turn?.turn : node?.data?.turn
      return Number.isSafeInteger(turn) && turn > 0 ? Number(turn) : undefined
    }

    function turnProcessTiming(node) {
      const turn = node?.location?.kind === 'step' || node?.location?.kind === 'turn' ? node.location.turn : undefined
      if (!turn) return undefined
      const startedAtMillis = turn.start?.time
      const completedAtMillis = turn.end?.time
      if (!Number.isFinite(startedAtMillis) && !Number.isFinite(completedAtMillis)) return undefined
      return {
        ...(Number.isFinite(startedAtMillis) ? { startedAtMillis } : {}),
        ...(Number.isFinite(completedAtMillis) ? { completedAtMillis } : {}),
      }
    }

    function toolProcess(block, parentId = '', cache) {
      if (!block?.callId) return []
      const cached = cache?.get(block)
      if (cached?.parentId === parentId) return cached.items
      const settled = block.kind === 'tool-result'
      const name = settled ? block.call?.name || block.callId : block.name || block.callId
      const item = {
        id: String(block.callId), kind: processKind(name),
        status: settled ? block.isError || block.meta?.source === 'eleckoi-auto-illustration' && block.meta?.status === 'partial' ? 'error' : 'complete' : 'running',
        toolName: name,
        arguments: settled ? block.call?.argsRaw || '' : block.argsRaw || '',
        summary: name,
        detail: settled ? processText(block.content) || block.error?.reason || block.error?.code || '' : '',
        startedAtMillis: Number(settled ? block.callTime : block.time) || 0,
        ...(settled ? { completedAtMillis: Number(block.time) || 0 } : {}),
        ...(parentId ? { parentId } : {})
      }
      const items = [item, ...(block.subCalls || []).flatMap(child => toolProcess(child, item.id, cache))]
      cache?.set(block, { parentId, items })
      return items
    }

    function officialProcess(snapshot, options = {}) {
      const byTurn = new Map()
      const positionsByTurn = new Map()
      const append = (turn, item) => {
        if (!Number.isSafeInteger(turn) || turn < 0) return
        let items = byTurn.get(turn)
        if (!items) { items = []; byTurn.set(turn, items); positionsByTurn.set(turn, new Map()) }
        const positions = positionsByTurn.get(turn)
        const index = positions.get(item.id)
        if (index === undefined) { positions.set(item.id, items.length); items.push(item) }
        else items[index] = item
      }
      const nodes = options.nodes || orderedChatNodes(snapshot)
      // Idle maintenance has no turn owner. Only turn-owned requests belong
      // to an AI processing row; the official command card owns manual work.
      const compactions = (options.trajectory?.requests || [])
        .filter(request => request.purpose === 'compaction' && Number.isSafeInteger(request.turn) && request.turn > 0)
      let nextCompaction = 0
      const appendCompactionsThrough = seq => {
        while (nextCompaction < compactions.length && compactions[nextCompaction].startSeq <= seq) {
          const request = compactions[nextCompaction++]
          append(request.turn, {
            id: `compaction:${request.startSeq}`, kind: 'compaction', status: request.status,
            toolName: 'compaction', arguments: '', summary: '',
            detail: request.error || processText(request.summary),
            startedAtMillis: request.startedAt,
            ...(request.completedAt === null ? {} : { completedAtMillis: request.completedAt }),
          })
        }
      }
      for (const node of nodes) {
        appendCompactionsThrough(node.anchorSeq)
        const turn = node.location?.kind === 'step' || node.location?.kind === 'turn'
          ? node.location.turn.turn : node.data?.turn
        const cached = options.processCache?.get(node)
        // Node identity changes on content or location updates. Image outcomes
        // are a separate projection and must also invalidate assistant actions.
        const illustrationInput = node.kind === 'assistant-step' ? options.illustrations : undefined
        const skipNarrative = options.skipNarrativeNodes?.has(node) === true
        if (cached && cached.illustrations === illustrationInput
          && cached.includeAllNarrative === options.includeAllNarrative
          && cached.skipNarrative === skipNarrative && cached.narrativeText === options.narrativeText) {
          for (const item of cached.items) append(turn, item)
          continue
        }
        const items = []
        const appendNode = (owner, item) => { items.push(item); append(owner, item) }
        if (node.kind === 'turn-error' || node.kind === 'turn-max-tokens') {
          appendNode(turn, { id: `${node.kind}:${node.key}`, kind: 'action',
            toolName: node.kind === 'turn-error' ? 'turn_error' : 'turn_max_tokens', status: 'error',
            arguments: '', summary: node.kind === 'turn-error' ? '生成失败' : '输出达到模型长度上限',
            detail: JSON.stringify(node.data), startedAtMillis: Number(node.data.time) || 0,
            completedAtMillis: Number(node.data.time) || 0 })
        }
        if (node.kind === 'model-retry') {
          for (const attempt of node.data.attempts) {
            const status = { scheduled: 'running', started: 'complete', cancelled: 'cancelled' }[attempt.retryState]
            if (!status) throw productFailure(ELECKOI_FAILURE_CODES.dataShapeInvalid, `未知模型重试状态：${attempt.retryState}`, { what: '模型重试状态' })
            const maximum = attempt.mode === 'normal' ? attempt.maxRetries : '∞'
            const title = { scheduled: '等待重试模型请求', started: '已重试模型请求', cancelled: '模型重试已取消' }[attempt.retryState]
            appendNode(turn, { id: `model-retry:${node.key}:${attempt.retry}`, kind: 'action', toolName: 'model_retry', status,
              arguments: '', summary: `${title}（${attempt.retry}/${maximum}）`,
              detail: JSON.stringify({ provider: attempt.provider, mode: attempt.mode, retry: attempt.retry,
                ...(attempt.mode === 'normal' ? { maxRetries: attempt.maxRetries } : {}), delayMs: attempt.delayMs, failure: attempt.failure }),
              startedAtMillis: attempt.time })
          }
        }
        if (node.kind === 'assistant-step') {
          const blocks = node.data?.blocks || []
          const raw = assistantText(blocks)
          const imageOpen = '<ACTION_CALL name="generate_image">'
          const imageStart = raw.indexOf(imageOpen)
          const finalStart = raw.indexOf(FinalOpenTag)
          if (imageStart >= 0 && (finalStart < 0 || imageStart < finalStart)) {
            const imageEnd = raw.indexOf('</ACTION_CALL>', imageStart + imageOpen.length)
            const batches = (options.illustrations || []).filter(batch => batch.turn === turn && batch.step === node.data?.step)
            const batch = batches.length === 1 ? batches[0] : undefined
            appendNode(turn, { id: `illustration:${turn}:${node.data?.step}`, kind: 'action', toolName: 'generate_image',
              status: batch ? batch.status === 'generating' ? 'running' : batch.status === 'complete' ? 'complete' : 'error'
                : node.data?.status === 'running' ? 'running' : 'error',
              arguments: raw.slice(imageStart + imageOpen.length, imageEnd < 0 ? finalStart < 0 ? undefined : finalStart : imageEnd).trim(),
              summary: '自动配图', detail: batch?.error || '', startedAtMillis: Number(node.data?.time) || 0 })
          }
          const hasToolCall = blocks.some(block => block?.kind === 'tool-call')
          blocks.forEach((block, index) => {
            if (block?.kind === 'reasoning' && block.text) appendNode(turn, {
              id: `reasoning:${turn}:${node.data?.step ?? 0}:${index}`,
              kind: 'reasoning', status: node.data?.status === 'running' ? 'running' : 'complete',
              toolName: 'reasoning', arguments: '', summary: '', detail: block.text,
              startedAtMillis: Number(node.data?.time) || 0,
            })
            const narrativeText = typeof options.narrativeText === 'function'
              ? options.narrativeText(String(block?.text || ''))
              : block?.text
            if ((hasToolCall || options.includeAllNarrative === true)
              && !options.skipNarrativeNodes?.has(node)
              && block?.kind === 'text' && narrativeText) appendNode(turn, {
              id: `narrative:${turn}:${node.data?.step ?? 0}:${index}`,
              kind: 'narrative', status: node.data?.status === 'running' ? 'running' : 'complete',
              toolName: 'assistant_narrative', arguments: '', summary: narrativeText, detail: narrativeText,
              startedAtMillis: Number(node.data?.time) || 0,
            })
          })
        }
        if (node.kind === 'tool-call') {
          for (const item of toolProcess(node.data?.root, '', options.toolCache)) appendNode(turn, item)
        }
        options.processCache?.set(node, { items, illustrations: illustrationInput,
          includeAllNarrative: options.includeAllNarrative, skipNarrative, narrativeText: options.narrativeText })
      }
      appendCompactionsThrough(Number.POSITIVE_INFINITY)
      return byTurn
    }

    function mergedProcess(product = [], official = []) {
      const items = [...product]
      const positions = new Map()
      items.forEach((item, index) => { if (!positions.has(item.id)) positions.set(item.id, index) })
      for (const item of official) {
        const index = positions.get(item.id)
        if (index === undefined) { positions.set(item.id, items.length); items.push(item) }
        else {
          const merged = { ...items[index], ...item }
          if (!sameRecord(items[index], merged)) items[index] = merged
        }
      }
      return sameReferences(product, items) ? product : items
    }

    const inputAttachmentCache = new WeakMap()
    function inputAttachments(content) {
      if (!Array.isArray(content)) return { images: EMPTY_ITEMS, files: EMPTY_ITEMS }
      let cached = inputAttachmentCache.get(content)
      if (!cached) {
        cached = { images: collectInputImages(content), files: collectInputFiles(content) }
        inputAttachmentCache.set(content, cached)
      }
      return cached
    }
    const inputImages = content => inputAttachments(content).images
    const inputFiles = content => inputAttachments(content).files
    const collectInputImages = content => Array.isArray(content) ? content.flatMap(block => {
      const attachment = block?.type === 'image' ? block.attachment : null
      return attachment?.attachmentId ? [{ ...attachment }] : []
    }) : []

    const collectInputFiles = content => Array.isArray(content) ? content.flatMap(block => {
      const attachment = block?.type === 'file' ? block.attachment : null
      return attachment?.attachmentId ? [{ ...attachment }] : []
    }) : []

    async function waitForOfficialSession(session, eventSource, requestId, executionTurn) {
      return new Promise((resolve, reject) => {
        let settled = false
        const disposers = []
        const finish = (error, value) => {
          if (settled) return
          settled = true
          clearTimeout(timeout)
          for (const dispose of disposers) dispose()
          if (error) reject(error)
          else resolve(value)
        }
        const timeout = setTimeout(() => {
          finish(productFailure(ELECKOI_FAILURE_CODES.timeoutExpired, '等待 DSH 会话完成超时。', { what: 'DSH 会话完成' }))
        }, 10 * 60 * 1000)
        const check = () => {
          if (settled) return
          const snapshot = session.getSnapshot()
          if (snapshot?.promptError?.op === 'send') {
            finish(providerFailure(snapshot.promptError.error, '生成失败。'))
            return
          }
          // Agent execution errors arrive separately from prompt admission and journal frames.
          if (snapshot?.lastAgentError) {
            finish(new Error(snapshot.lastAgentError))
            return
          }
          if (snapshot?.openError || snapshot?.removed) {
            finish(new Error(snapshot.openError?.message || 'DSH 会话已关闭。'))
            return
          }
          if (snapshot?.running) return
          const events = (eventSource.getSnapshot()?.entries || [])
            .filter(entry => entry.type === 'event').map(entry => entry.event)
          const userIndex = events.findLastIndex(event => event.type === 'user/message'
            && event.data?.source?.kind === 'user' && event.data.source.rpcId === requestId)
          const ended = Number.isSafeInteger(executionTurn)
            ? events.find(event => event.type === 'turn/end' && event.data?.turn === executionTurn)
            : userIndex < 0 ? undefined : events.slice(userIndex + 1).find(event => event.type === 'turn/end')
          if (!ended) return
          const reason = ended.data?.reason
          if (reason?.kind === 'error') finish(providerFailure(reason.error, snapshot.lastAgentError || '生成失败。'))
          else finish(null, { cancelled: reason?.kind === 'aborted' || reason?.kind === 'interrupted' })
        }
        disposers.push(session.subscribe(check), eventSource.subscribe(check))
        check()
      })
    }

    function pendingSubmissionImages(submission) {
      return (submission?.attachments || []).flatMap((attachment, index) => {
        if (attachment?.type !== 'image' || !attachment.value?.previewUrl) return []
        return [{
          attachmentId: `pending-${submission.requestId}-${index}`,
          name: attachment.value.name || '',
          dataUrl: attachment.value.previewUrl,
          ...(attachment.value.width ? { width: attachment.value.width } : {}),
          ...(attachment.value.height ? { height: attachment.value.height } : {})
        }]
      })
    }

    function pendingSubmissionFiles(submission) {
      return (submission?.attachments || []).flatMap((attachment, index) => {
        if (attachment?.type !== 'file' || !attachment.value) return []
        const file = attachment.value
        return [{
          attachmentId: file.attachmentId || `pending-${submission.requestId}-file-${index}`,
          name: file.name || '文件',
          bytes: Number(file.bytes) || 0
        }]
      })
    }

    function officialMessages(snapshot, details, runtimeSessionId, processByTurn = new Map(), pendingSubmissions = [], sessionRunning, inputLinks = [], abortedTurns = [], regeneratingInputTurn, illustrations = [], loadedEntries) {
      if (!snapshot) return (details?.messages || []).filter(message => message.id === 'opening')
      const entries = loadedEntries || orderedChatEntries(snapshot)
      const nodes = entries.map(entry => entry.node)
      const assistantEntriesByTurn = new Map()
      const userTurns = new Map()
      let nextTailTurn
      // Unstamped inputs belong to the next completed tail in the loaded window.
      // Resolve every boundary in one reverse pass, including queued inputs.
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const entry = entries[index], node = entry.node
        if (node.kind === 'turn-tail' && nodeTurn(node) !== undefined) nextTailTurn = nodeTurn(node)
        if (node.kind === 'user' || node.kind === 'steering') userTurns.set(node, nodeTurn(node) ?? nextTailTurn)
        if (node.kind === 'assistant-step') {
          const turn = nodeTurn(node), current = assistantEntriesByTurn.get(turn) || []
          current.push(entry); assistantEntriesByTurn.set(turn, current)
        }
      }
      for (const current of assistantEntriesByTurn.values()) current.reverse()
      const imagesByTurn = new Map()
      for (const batch of illustrations) {
        const images = batch.frames.map(frame => ({ ...frame.attachment, id: `${batch.batchId}:${frame.id}`,
          batchId: batch.batchId, frameId: frame.id, width: frame.width, height: frame.height,
          status: frame.status, ...(frame.error ? { error: frame.error } : {}) }))
        imagesByTurn.set(batch.turn, [...(imagesByTurn.get(batch.turn) || []), ...images])
      }
      const failuresByTurn = new Map(nodes.filter(node => node.kind === 'turn-error').map(node => [nodeTurn(node), node.data]))
      const failedTurns = new Set(failuresByTurn.keys())
      const endedTurns = new Set(nodes.filter(node => node.kind === 'turn-tail')
        .map(nodeTurn).filter(Number.isSafeInteger))
      const aborted = new Set(abortedTurns)
      const closedTurns = new Set(nodes.filter(node => node.kind === 'turn-tail' && node.data?.closing)
        .map(nodeTurn).filter(Number.isSafeInteger))
      const supersededInputTurns = new Set(inputLinks.filter(link => link.kind !== 'subagent' && Number.isSafeInteger(link.inputTurn)
        && link.inputTurn > 0 && link.inputTurn !== link.turn).map(link => link.inputTurn))
      if (Number.isSafeInteger(regeneratingInputTurn) && regeneratingInputTurn > 0) supersededInputTurns.add(regeneratingInputTurn)
      const latestOpenAssistantByTurn = new Map()
      entries.forEach((entry, index) => {
        const turn = nodeTurn(entry.node)
        if (entry.node.kind !== 'assistant-step' || !Number.isSafeInteger(turn) || closedTurns.has(turn)) return
        const blocks = entry.node.data?.blocks || []
        const hasActivity = assistantContent(blocks).live.started
          || (processByTurn.get(turn) || []).length > 0
        // The official Session can publish the running assistant-step before
        // its first text/process event. Keep that real DSH node visible while
        // the Session is running; do not manufacture a product-only row.
        if (hasActivity || (entry.node.data?.status === 'running' && sessionRunning === true && !failedTurns.has(turn))) {
          latestOpenAssistantByTurn.set(turn, index)
        }
      })
      const projected = entries.flatMap((entry, nodeIndex) => {
        const node = entry.node
        if (node.kind === 'user' || node.kind === 'steering') {
          const input = node.data
          const dshTurn = userTurns.get(node)
          return [{
            role: 'user', seq: input.seq, time: input.time, content: contentText(input.content),
            images: inputImages(input.content), files: inputFiles(input.content), dshMessageId: input.messageId || '',
            sessionEventSeq: input.seq,
            requestId: input.source?.kind === 'user' ? input.source.rpcId || '' : '',
            // `null` means this official input has not entered a DSH turn.
            dshTurn: dshTurn ?? null
          }]
        }
        if (node.kind === 'turn-process') {
          const turn = nodeTurn(node)
          const process = processByTurn.get(turn) || []
          if (!Number.isSafeInteger(turn) || closedTurns.has(turn) || supersededInputTurns.has(turn)
            || latestOpenAssistantByTurn.has(turn) || process.length === 0) return []
          // Compaction can precede the first assistant step. Its real DSH
          // turn-process node owns this row until the assistant takes over.
          return [{
            role: 'assistant', seq: node.anchorSeq, time: process[0].startedAtMillis,
            content: '', displayContent: '', nodeKey: entry.key, dshTurn: turn,
            processTiming: turnProcessTiming(node),
            pending: sessionRunning === true && !endedTurns.has(turn) && !aborted.has(turn)
              && node.location?.turn?.status !== 'closed',
            interrupted: aborted.has(turn),
          }]
        }
        if (node.kind === 'assistant-step') {
          const turn = nodeTurn(node)
          if (!Number.isSafeInteger(turn) || closedTurns.has(turn) || latestOpenAssistantByTurn.get(turn) !== nodeIndex) return []
          const { text: raw, live } = assistantContent(node.data?.blocks)
          const finalNode = node.data?.finalNode
          return [{
            role: 'assistant', seq: finalNode?.seq ?? node.data?.seq ?? node.anchorSeq ?? Number.MAX_SAFE_INTEGER,
            time: node.data?.time, content: raw,
            displayContent: live.started ? live.content : '',
            dshMessageId: finalNode?.messageId || '', nodeKey: entry.key, dshTurn: turn,
            processTiming: turnProcessTiming(node),
            // Only a durable assistant/message has a mutation target. DSH can
            // also close a live-only interruption with a fractional view seq.
            sessionEventSeq: Number.isSafeInteger(finalNode?.seq) ? finalNode.seq : undefined,
            // An unknown session state is not proof that generation is still
            // running. During Session rebind DSH can publish the historical
            // assistant-step before the new Session state arrives; treating
            // that gap as streaming hides the normal message actions.
            pending: sessionRunning === true && !endedTurns.has(turn)
              && !aborted.has(turn) && node.location?.turn?.status !== 'closed' && node.data?.status !== 'interrupted',
            interrupted: aborted.has(turn) || node.data?.status === 'interrupted' || finalNode?.interrupted === true,
          }]
        }
        if (node.kind !== 'turn-tail' || !node.data?.closing) return []
        const tail = node.data
        const closing = tail.closing
        const finalNode = closing.finalNode
        const closingAssistant = (assistantEntriesByTurn.get(tail.turn) || EMPTY_ITEMS).find(candidate =>
          ((finalNode.messageId && candidate.node.data?.messageId === finalNode.messageId)
            || (Number.isSafeInteger(finalNode.seq) && candidate.node.data?.seq === finalNode.seq)))
        const closingContent = assistantContent(closing.blocks)
        return [{
          role: 'assistant', seq: finalNode.seq, time: finalNode.time, content: closingContent.text,
          displayContent: closingContent.final,
          dshMessageId: finalNode.messageId || '', interrupted: aborted.has(tail.turn) || finalNode.interrupted === true,
          usage: closing.usage, turnUsage: tail.tokenUsage, sessionEventSeq: finalNode.seq, dshTurn: tail.turn,
          processTiming: turnProcessTiming(node),
          nodeKey: closingAssistant?.key || ''
        }]
      })
      const admittedRequestIds = new Set(projected.map(item => item.requestId).filter(Boolean))
      for (const submission of pendingSubmissions) {
        if (!submission?.requestId || admittedRequestIds.has(submission.requestId)) continue
        if (submission.placement !== 'transcript' && submission.placement !== 'steering') continue
        projected.push({
          role: 'user', seq: Number.MAX_SAFE_INTEGER, time: submission.time || Date.now(),
          content: submission.text || '', images: pendingSubmissionImages(submission),
          files: pendingSubmissionFiles(submission), dshMessageId: '', requestId: submission.requestId,
          pending: true
        })
      }
      projected.sort((left, right) => {
        const leftSeq = Number.isFinite(left.seq) ? left.seq : Number.MAX_SAFE_INTEGER
        const rightSeq = Number.isFinite(right.seq) ? right.seq : Number.MAX_SAFE_INTEGER
        if (leftSeq !== rightSeq) return leftSeq - rightSeq
        return Number(left.time || 0) - Number(right.time || 0)
      })
      const product = Array.isArray(details?.messages) ? details.messages : []
      const opening = product.filter(message => message.id === 'opening')
      const candidates = product.filter(message => message.id !== 'opening')
      const matched = new Map()
      const claimedCandidates = new Set()
      const byMessageId = new Map(), bySequence = new Map()
      const indexCandidate = (lookup, role, key, index) => {
        let byKey = lookup.get(role)
        if (!byKey) { byKey = new Map(); lookup.set(role, byKey) }
        const indices = byKey.get(key) || []
        indices.push(index); byKey.set(key, indices)
      }
      candidates.forEach((candidate, index) => {
        if (candidate.dshMessageId) indexCandidate(byMessageId, candidate.role, candidate.dshMessageId, index)
        indexCandidate(bySequence, candidate.role, candidate.sessionEventSeq, index)
      })
      const availableCandidate = indices => {
        while (indices?.length && claimedCandidates.has(candidates[indices[0]])) indices.shift()
        return indices?.[0] ?? Number.POSITIVE_INFINITY
      }
      for (let index = 0; index < projected.length; index += 1) {
        const item = projected[index]
        const sourceIndex = Math.min(item.dshMessageId
          ? availableCandidate(byMessageId.get(item.role)?.get(item.dshMessageId)) : Number.POSITIVE_INFINITY,
        availableCandidate(bySequence.get(item.role)?.get(item.seq)))
        if (Number.isFinite(sourceIndex)) {
          const source = candidates[sourceIndex]
          claimedCandidates.add(source)
          matched.set(index, source)
        }
      }
      const inputLinksByTurn = new Map()
      for (const link of inputLinks) if (!inputLinksByTurn.has(link.turn)) inputLinksByTurn.set(link.turn, link)
      const sourceBySequence = new Map()
      projected.forEach((item, index) => {
        if (!sourceBySequence.has(item.seq)) sourceBySequence.set(item.seq, matched.get(index))
      })
      const visible = projected.map((item, index) => {
        const source = matched.get(index)
        const id = source?.id || item.dshMessageId || item.nodeKey || (item.requestId
          ? `dsh-pending-${item.requestId}`
          : `dsh-${runtimeSessionId}-${item.seq}-${item.role}`)
        const runtimeVariableState = item.role === 'assistant' && Number.isSafeInteger(item.dshTurn)
          ? details?.runtimeVariableStateByTurn?.[String(item.dshTurn)]
          : undefined
        const sourceVariableState = source?.variableSnapshotAvailable === false ? undefined
          : source?.nativeVariableStateJson ?? source?.variableStateJson
        const historicalVariableState = runtimeVariableState ?? sourceVariableState
        const failure = item.role === 'assistant' ? failuresByTurn.get(item.dshTurn) : undefined
        const message = {
          ...(source || {}), id, conversationId: details?.conversation?.id || source?.conversationId || '',
          ...(Number.isInteger(source?.productSequence ?? source?.sequence) ? { productSequence: source.productSequence ?? source.sequence } : {}),
          runtimeSessionId, dshMessageId: item.dshMessageId || source?.dshMessageId || '',
          sessionEventSeq: item.sessionEventSeq,
          ...(item.requestId ? { requestId: item.requestId } : {}),
          ...(Object.prototype.hasOwnProperty.call(item, 'dshTurn') ? { dshTurn: item.dshTurn } : {}),
          ...(item.role === 'assistant' && Number.isSafeInteger(item.dshTurn) ? {
            dshTurn: item.dshTurn,
            inputEventSeq: inputLinksByTurn.get(item.dshTurn)?.inputEventSeq,
            renderKey: `dsh-reply-${runtimeSessionId}-${item.dshTurn}`
          } : {}),
          ...(item.nodeKey ? { dshNodeKey: item.nodeKey } : {}),
          // `sequence` is the durable DSH event position. `messageIndex` is only
          // the current visible list position and must be rebuilt after sorting.
          sequence: item.seq, messageIndex: index,
          role: item.role, content: item.content,
          // Product projection owns an explicit display value, including an
          // intentional empty result. Only an unmapped live message uses the
          displayContent: !item.pending && source?.content === item.content && typeof source.displayContent === 'string'
            ? source.displayContent
            : item.displayContent ?? item.content,
          // The product database supplies the completed state for this exact
          // DSH turn; a missing historical value stays explicitly unavailable.
          variableStateJson: historicalVariableState ?? '{}',
          variableSnapshotAvailable: typeof historicalVariableState === 'string',
          nativeVariableStateJson: historicalVariableState,
          createdAt: source?.createdAt || new Date(item.time || Date.now()).toISOString(),
          ...(item.kind ? { kind: item.kind } : {}),
          error: failure?.message || '',
          status: failure ? 'error' : item.pending ? 'streaming' : item.interrupted ? 'cancelled' : 'complete',
          process: mergedProcess(source?.process, processByTurn.get(item.dshTurn)),
          processTiming: item.processTiming,
          ...(item.turnUsage || source?.turnUsage ? { turnUsage: item.turnUsage || source.turnUsage } : {}),
          ...(item.images?.length ? { inputImageAttachments: item.images } : {}),
          ...(item.role === 'assistant' && imagesByTurn.get(item.dshTurn)?.length ? { generatedImageAttachments: imagesByTurn.get(item.dshTurn) } : {}),
          ...(item.files?.length ? { inputFileAttachments: item.files } : {})
        }
        const hasAttachments = Boolean(message.inputImageAttachments?.length || message.generatedImageAttachments?.length || message.inputFileAttachments?.length)
        const hasProcess = Array.isArray(message.process) && message.process.length > 0
        const hasText = String(message.content || '').trim().length > 0
        return { message, keep: hasText || hasAttachments || hasProcess || message.status === 'streaming' }
      }).filter(item => item.keep).map(item => item.message)
      const anchor = visible.findIndex(message => Number.isSafeInteger(sourceBySequence.get(message.sequence)?.messageIndex))
      const firstFloor = !details?.hasMore || anchor < 0 ? opening.length : Math.max(opening.length,
        sourceBySequence.get(visible[anchor].sequence).messageIndex
          - visible.slice(0, anchor).filter(message => message.kind !== 'turn-error').length)
      let messageFloor = firstFloor
      return [...opening, ...visible.map(message => reuseMessage(sourceBySequence.get(message.sequence), { ...message,
        messageIndex: message.kind === 'turn-error' ? undefined : messageFloor++ }))]
    }

    class ConversationCatalog {
      constructor(remote, sessions, uiConversation, fileUpload, regexRules, conversation) {
        this.remote = remote
        this.sessions = sessions
        this.uiConversation = uiConversation
        this.fileUpload = fileUpload
        this.regexRules = regexRules
        this.conversation = conversation
        this.snapshot = { status: 'loading', items: [], error: '' }
        this.listeners = new Set()
        this.detailsSnapshot = { id: '', status: 'idle', details: null, error: '' }
        this.detailsListeners = new Set()
        this.chatSnapshot = { details: this.detailsSnapshot, stream: null }
        this.chatListeners = new Set()
        this.modelSelectionSnapshot = { provider: '', model: '' }
        this.modelSelectionListeners = new Set()
        this.detailGeneration = 0
        this.timelineSnapshot = { id: '', status: 'idle', timeline: null, error: '' }
        this.timelineListeners = new Set()
        this.timelineGeneration = 0
        this.previewStreams = new Set()
        this.streamSnapshot = { id: '', status: 'idle', runId: '', requestId: '', messageId: '', nodeKey: '', sequence: 0, content: '', process: [], error: '' }
        this.streamState = this.streamSnapshot
        this.chatSnapshot = { details: this.detailsSnapshot, stream: this.streamSnapshot }
        this.streamListeners = new Set()
        this.generationListeners = new Set()
        this.streamGeneration = 0
        this.streamFrame = undefined
        // A DSH cancel is asynchronous. Keep the run identity locally so
        // late Session snapshots cannot reopen the renderer's live row while
        // the official cancellation is settling.
        this.cancelledStreamRuns = new Set()
        this.cancelledStreamConversations = new Set()
        this.preferredSessions = new Map()
        this.selectionWriteQueue = Promise.resolve()
        this.sessionReference = null
        this.sessionTarget = null
        this.sessionTrajectoryTarget = null
        this.stopSessionTarget = () => {}
        this.stopSessionState = () => {}
        this.stopSessionGeneration = () => {}
        this.stopProjections = () => {}
        this.statsSnapshot = { id: '', stats: null }
        this.latestStatsSnapshot = this.statsSnapshot
        this.statsListeners = new Set()
        this.sessionBindingGeneration = 0
        this.activeRequests = new Map()
        this.sessionMutations = new Map()
        this.detailInvalidationFences = new Set()
        this.generation = 0
        this.disposed = false
        this.changeFeedAbort = null
        this.changeFeed = null
        this.stopEvents = () => {}
        this.stopSessionList = () => {}
        this.stopRegexRules = () => {}
        this.displayProjectionSignature = null
        this.displayProjectionGeneration = 0
        this.displayProjectionResults = new Map()
        this.displayProjectionPromise = null
        this.officialProjectionSignature = null
        this.lastAcceptedSession = null
        this.nodeProcessCache = new WeakMap()
        this.toolProcessCache = new WeakMap()
        this.inputContinuationsValue = undefined
        this.inputContinuationLinks = EMPTY_ITEMS
      }

      getSnapshot = () => this.snapshot

      subscribe = listener => {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
      }

      getDetailsSnapshot = () => this.detailsSnapshot

      getSessionReference(runtimeSessionId) {
        if (this.disposed || !runtimeSessionId || !this.sessionTarget
          || this.sessionReference?.sessionId !== runtimeSessionId) return null
        return this.sessionReference
      }

      getStatsSnapshot = () => this.statsSnapshot

      generationEvents(entries) {
        return entries.filter(entry => entry.type === 'event'
          && ['turn/start', 'turn/end', 'assistant/message'].includes(entry.event.type)).map(entry => entry.event)
      }

      subscribeGeneration = listener => {
        this.generationListeners.add(listener)
        const reference = this.sessionReference
        if (reference?.binding && this.sessionTarget) listener({
          conversationId: this.detailsSnapshot.id, runtimeSessionId: reference.sessionId, kind: 'baseline',
          running: reference.binding.session.getSnapshot().running === true,
          events: this.generationEvents(reference.binding.eventSource.getSnapshot().entries),
        })
        return () => this.generationListeners.delete(listener)
      }

      publishGeneration(change) {
        for (const listener of this.generationListeners) listener(change)
      }

      getGenerationReply(runtimeSessionId, turn, eventSeq) {
        if (this.disposed || this.sessionReference?.sessionId !== runtimeSessionId || !this.sessionTarget
          || !Number.isSafeInteger(turn) || !Number.isSafeInteger(eventSeq)) {
          return { status: 'unavailable', reason: '生成消息的正式 Session 或轮次身份不可用。' }
        }
        const details = this.detailsSnapshot.details
        if (!details || details.runtimeSessionId !== runtimeSessionId) return { status: 'pending' }
        const matches = details.messages.filter(message => message.role === 'assistant'
          && message.runtimeSessionId === runtimeSessionId && message.dshTurn === turn
          && message.sessionEventSeq === eventSeq && message.status === 'complete')
        if (matches.length === 1) return { status: 'ready', message: matches[0] }
        if (matches.length > 1) return { status: 'unavailable', reason: '生成结果对应多个相同正式身份的消息。' }
        const tails = (this.officialProjectionSignature?.runtimeSessionId === runtimeSessionId
          ? this.officialProjectionSignature.nodes : []).filter(node => node.kind === 'turn-tail'
          && node.data?.turn === turn && node.data?.closing?.finalNode?.seq === eventSeq)
        if (tails.length > 1) return { status: 'unavailable', reason: '生成结果对应多个正式关闭节点。' }
        // A settled empty reply may deliberately have no visible product row.
        // Only its exact closing node in the published projection proves that
        // the product row decision has completed, not an ahead-of-publication target.
        return tails.length === 1 ? { status: 'ready', message: null } : { status: 'pending' }
      }

      subscribeStats = listener => {
        this.statsListeners.add(listener)
        return () => this.statsListeners.delete(listener)
      }

      publishStats(id, stats) {
        this.latestStatsSnapshot = { id, stats }
        const request = this.activeRequests.get(id)
        if (request?.statsPending) {
          // Rewound baseline counts belong to the retained prefix. Hand off
          // the display only when the new run records its first settled step.
          if (request.statsBaselineSteps === undefined
            || !(stats?.sessionStats?.steps > request.statsBaselineSteps)) return
          request.statsPending = false
        }
        this.statsSnapshot = { id, stats }
        for (const listener of this.statsListeners) listener()
      }

      async readImage(conversationId, attachment) {
        if (this.disposed) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleDisposed, 'DSH 聊天服务已关闭，无法读取图片。', { what: 'DSH 聊天服务' })
        if (!attachment?.attachmentId) throw productFailure(ELECKOI_FAILURE_CODES.lookupNotFound, '图片不可用。', { what: '图片附件' })
        const runtimeSessionId = this.runtimeSessionId(conversationId)
          || (this.detailsSnapshot.id === conversationId ? this.detailsSnapshot.runtimeSessionId : '')
        if (!runtimeSessionId) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleNotReady, '当前聊天缺少 DSH Session。', { what: '当前聊天的 DSH 会话' })
        if (this.detailsSnapshot.id === conversationId) await this.bindOfficialSession(conversationId)
        if (attachment.batchId) {
          const cached = this.uiConversation.peekImageUrl(runtimeSessionId, attachment)
          if (cached) return cached
          const value = this.unwrap(await this.remote.eleckoiConversations.readGeneratedImage(conversationId,
            attachment.batchId, attachment.frameId, attachment.attachmentId), '图片读取失败。')
          const url = `data:${value.mediaType};base64,${value.data}`
          this.uiConversation.seedImageUrl(runtimeSessionId, attachment, url)
          return url
        }
        return this.uiConversation.imageUrl(runtimeSessionId, attachment)
      }

      async regenerateImage(conversationId, image) {
        if (!image?.batchId || !Number.isSafeInteger(image.frameId)) throw productFailure(ELECKOI_FAILURE_CODES.dataShapeInvalid, '图片缺少生图指令编号。', { what: '图片的生图指令编号' })
        let failure
        try {
          await this.mutateSession(conversationId, async () => this.unwrap(
            await this.remote.eleckoiConversations.regenerateImage(conversationId, image.batchId, image.frameId), '图片重新生成失败。'))
        } catch (error) { failure = error }
        await this.sessions.refresh()
        await this.bindOfficialSession(conversationId)
        await this.refreshDetails()
        if (failure) throw failure
      }

      rememberSession(characterId, sessionId) {
        if (characterId && sessionId) this.preferredSessions.set(characterId, sessionId)
      }

      preferredSession(characterId) {
        return this.preferredSessions.get(characterId) || ''
      }

      forgetSession(characterId, sessionId) {
        if (this.preferredSessions.get(characterId) === sessionId) this.preferredSessions.delete(characterId)
      }

      normalizeSelection(value) {
        const preferred = value?.preferred_sessions
        return {
          active_conversation_id: typeof value?.active_conversation_id === 'string' ? value.active_conversation_id : '',
          preferred_sessions: preferred && typeof preferred === 'object' && !Array.isArray(preferred)
            ? Object.fromEntries(Object.entries(preferred).filter(([key, item]) => key && typeof item === 'string' && item))
            : {}
        }
      }

      unwrap(result, fallback) {
        return unwrapOrFail(result, fallback)
      }

      async readSelection() {
        const document = this.unwrap(await this.remote.settings.describe(), '读取当前聊天记录失败。')
        const namespace = document?.namespaces?.find(item => item.ns === 'eleckoi-client-conversations')
        return this.normalizeSelection(namespace?.value?.selection)
      }

      saveSelection(value) {
        const selection = this.normalizeSelection(value)
        const operation = this.selectionWriteQueue.then(async () => {
          const document = this.unwrap(await this.remote.settings.describe(), '读取聊天选择状态失败。')
          const namespace = document?.namespaces?.find(item => item.ns === 'eleckoi-client-conversations')
          this.unwrap(await this.remote.settings.mutate('eleckoi-client-conversations', [{
            op: 'set', path: ['selection'], value: selection
          }], namespace?.revision), '保存当前聊天记录失败。')
          return selection
        })
        // `operation` 由调用方 await（`return operation`）；这里只为队列只留一条拒绝。
        this.selectionWriteQueue = operation.catch(rejectionIsAwaitedElsewhere)
        return operation
      }

      async readModelSelection(conversationId) {
        const selected = this.unwrap(
          await this.remote.eleckoiConversationModels.current(conversationId),
          '读取全局模型失败。'
        )
        this.publishModelSelection(selected)
        return selected
      }

      async readAuthorState(conversationId) {
        if (!conversationId) throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, '请先打开一个聊天。', { what: '打开一个聊天' })
        return this.unwrap(
          await this.remote.eleckoiConversations.authorState(conversationId),
          '读取作者接口上下文失败。'
        )
      }

      async exportArchive(conversationId) {
        if (!conversationId) throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, '请选择要导出的聊天记录。', { what: '选择要导出的聊天记录' })
        return this.unwrap(
          await this.remote.eleckoiConversations.exportArchive(conversationId),
          '导出聊天记录失败。'
        )
      }

      async importArchive(characterId, json) {
        if (!characterId) throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, '请先选择角色，再导入聊天记录。', { what: '选择要导入聊天记录的角色' })
        return this.unwrap(
          await this.remote.eleckoiConversations.importArchive(characterId, json),
          '导入聊天记录失败。'
        )
      }

      async revealFile(conversationId, attachmentId, name) {
        if (!conversationId) throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, '当前聊天不可用。', { what: '打开一个聊天' })
        this.unwrap(
          await this.remote.eleckoiConversations.revealFile(conversationId, attachmentId, name),
          '无法在文件管理器中显示该文件。'
        )
      }

      async readTrajectory(conversationId) {
        if (!conversationId) throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, '请先打开一个聊天。', { what: '打开一个聊天' })
        if (conversationId !== this.detailsSnapshot.id) await this.open(conversationId)
        await this.bindOfficialSession(conversationId)
        const binding = this.sessionReference?.binding
        if (!binding) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleNotReady, '当前聊天的 DSH Session 尚未就绪。', { what: '当前聊天的 DSH 会话' })
        const target = this.uiConversation.binding(binding).target('trajectory')
        const snapshot = target.getSnapshot()
        if (!snapshot) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleNotReady, 'DSH 轨迹投影尚未就绪。', { what: 'DSH 轨迹投影' })
        return snapshot
      }

      async replaceAuthorVariableState(conversationId, state) {
        if (!conversationId) throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, '请先打开一个聊天。', { what: '打开一个聊天' })
        const stateJson = JSON.stringify(state)
        const saved = this.unwrap(
          await this.remote.eleckoiConversations.replaceVariableState(conversationId, stateJson),
          '保存作者接口变量失败。'
        )
        if (this.timelineSnapshot.id === conversationId) void this.refreshTimeline().catch(failureAlreadyPublished)
        return JSON.parse(saved || '{}')
      }

      async selectModel(conversationId, selection) {
        const selected = this.unwrap(
          await this.remote.eleckoiConversationModels.select(conversationId, selection),
          '保存全局模型失败。'
        )
        this.publishModelSelection(selected)
        return selected
      }

      getModelSelectionSnapshot = () => this.modelSelectionSnapshot

      subscribeModelSelection = listener => {
        this.modelSelectionListeners.add(listener)
        return () => this.modelSelectionListeners.delete(listener)
      }

      publishModelSelection(selection) {
        this.modelSelectionSnapshot = { ...selection }
        for (const listener of this.modelSelectionListeners) listener()
      }

      subscribeDetails = listener => {
        this.detailsListeners.add(listener)
        return () => this.detailsListeners.delete(listener)
      }

      getChatSnapshot = () => this.chatSnapshot

      subscribeChat = listener => {
        this.chatListeners.add(listener)
        return () => this.chatListeners.delete(listener)
      }

      publishChatSnapshot() {
        this.chatSnapshot = { details: this.detailsSnapshot, stream: this.streamSnapshot }
        for (const listener of this.chatListeners) listener()
      }

      getTimelineSnapshot = () => this.timelineSnapshot

      subscribeTimeline = listener => {
        this.timelineListeners.add(listener)
        return () => this.timelineListeners.delete(listener)
      }

      getStreamSnapshot = () => this.streamSnapshot

      subscribeStream = listener => {
        this.streamListeners.add(listener)
        return () => this.streamListeners.delete(listener)
      }

      publish(next) {
        this.snapshot = next
        for (const listener of this.listeners) listener()
      }

      openingChangeAllowed(id, runtimeSessionId) {
        const binding = this.sessionReference?.binding
        const state = binding?.session.getSnapshot()
        const identities = binding?.session.projections?.faceOf('eleckoiInputContinuations')?.getSnapshot()
        const inbox = binding?.session.projections?.faceOf('inbox')?.getSnapshot()
        return Boolean(this.sessionReference?.sessionId === runtimeSessionId
          && state?.openState === 'open' && !state.removed && !state.running
          && !state.pendingSubmissions?.length && !this.activeRequests.has(id) && !this.sessionMutations.has(id)
          && Array.isArray(identities?.inputs) && identities.inputs.length === 0
          && Array.isArray(inbox?.['next-turn']) && inbox['next-turn'].length === 0
          && Array.isArray(inbox?.['next-step']) && inbox['next-step'].length === 0)
      }

      prepareDetails(next, officialProjectionSignature = null) {
        const request = this.activeRequests.get(next.id)
        const opening = next.details?.messages.find(message => message.id === 'opening')
        if (opening) {
          const canChangeOpening = this.openingChangeAllowed(next.id, next.runtimeSessionId)
          if (opening.canChangeOpening !== canChangeOpening) {
            next = { ...next, details: { ...next.details, messages: next.details.messages.map(message =>
              message === opening ? { ...message, canChangeOpening } : message) } }
          }
        }
        if (Number.isSafeInteger(request?.rewindEventSeq) && next.details) {
          // The selected input owns the visible branch while the Host rewinds.
          // A refresh of the retiring Session must not put its old replies back.
          // Interrupted process-only rows have an official Chat position but
          // no editable surface event. Their sequence still belongs to the
          // retained prefix; sessionEventSeq is only the mutation address.
          const messages = next.details.messages.filter(message => message.id === 'opening'
            || message.sequence <= request.rewindEventSeq)
          next = { ...next, details: { ...next.details, messages } }
        }
        next = this.applyDisplayProjection(next)
        this.detailsSnapshot = next
        this.officialProjectionSignature = officialProjectionSignature
        // The active chat observes regex configuration even when its editor
        // has never been opened, so existing change notifications reach it.
        const characterId = next.details?.metadata?.characterId
        if (next.status === 'ready' && characterId
          && this.regexRules?.getSnapshot?.(characterId)?.status === 'idle') {
          void this.regexRules.read(characterId).catch(error => {
            console.error('读取聊天正则配置失败：', error)
          })
        }
        return next
      }

      publishDetails(next, officialProjectionSignature = null) {
        next = this.prepareDetails(next, officialProjectionSignature)
        for (const listener of this.detailsListeners) listener()
        this.publishChatSnapshot()
        if (next.status === 'ready' && next.details) this.scheduleDisplayProjection(next.id, next.details)
      }

      // Commit the official DSH projection and the product's live status as one
      // renderer-visible publication. The transcript remains ElecKoi-owned so
      // the roleplay presentation can keep its one-line activity row and
      // final-body marker while DSH remains the source of truth.
      publishOfficialState(nextDetails, officialProjectionSignature, nextStream) {
        const details = this.prepareDetails(nextDetails, officialProjectionSignature)
        this.streamState = nextStream
        this.cancelStreamFrame()
        this.streamSnapshot = this.streamState
        this.chatSnapshot = { details: this.detailsSnapshot, stream: this.streamSnapshot }
        for (const listener of this.detailsListeners) listener()
        for (const listener of this.streamListeners) listener()
        for (const listener of this.chatListeners) listener()
        if (details.status === 'ready' && details.details) this.scheduleDisplayProjection(details.id, details.details)
      }

      displayProjectionInput(messages) {
        return messages.filter(message => (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string')
          .map(message => ({
            id: message.id,
            role: message.role,
            content: message.content,
            variableStateJson: typeof message.nativeVariableStateJson === 'string' ? message.nativeVariableStateJson
              : typeof message.variableStateJson === 'string' ? message.variableStateJson : '{}',
            status: message.status,
            createdAt: message.createdAt,
            ...(message.role === 'assistant' ? { reasoning: (message.process || [])
              .filter(item => item.kind === 'reasoning' && item.status !== 'running')
              .map(item => ({ id: item.id, text: reasoningText(item) })) } : {})
          }))
      }

      applyDisplayProjection(next) {
        if (next.status !== 'ready' || !next.details || this.displayProjectionResults.size === 0) return next
        let changed = false
        const messages = next.details.messages.map(message => {
          const cached = this.displayProjectionResults.get(message.id)
          const result = cached?.result
          if (!cached || cached.role !== message.role
            || !result
            || typeof result.displayContent !== 'string'
            || typeof result.variableStateJson !== 'string') return message
          let projected = message
          if (message.status !== 'streaming' && result.sourceContent === message.content
            && (message.displayContent !== result.displayContent || message.variableStateJson !== result.variableStateJson)) {
            projected = { ...projected, displayContent: result.displayContent, variableStateJson: result.variableStateJson }
          }
          if (Array.isArray(result.reasoning) && message.process?.length) {
            const byId = new Map(result.reasoning.map(item => [item.id, item]))
            let processChanged = false
            const process = message.process.map(item => {
              const display = byId.get(item.id)
              if (item.kind !== 'reasoning' || item.status === 'running' || !display
                || display.sourceText !== reasoningText(item) || typeof display.displayText !== 'string'
                || item.displayDetail === display.displayText) return item
              processChanged = true
              return { ...item, displayDetail: display.displayText }
            })
            if (processChanged) projected = { ...projected, process }
          }
          if (projected !== message) changed = true
          return projected
        })
        return changed ? { ...next, details: { ...next.details, messages } } : next
      }

      scheduleDisplayProjection(id, details) {
        const projectDisplay = this.remote?.eleckoiConversations?.projectDisplay
        if (this.disposed || !id || typeof projectDisplay !== 'function') return null
        const input = this.displayProjectionInput(details.messages || [])
        // Live text is rendered directly. Keep its row for depth calculations,
        // but only settled text changes request a regex display projection.
        if (sameDisplayProjection(this.displayProjectionSignature, id, input)) return this.displayProjectionPromise
        this.displayProjectionSignature = { id, input }
        const generation = ++this.displayProjectionGeneration
        const operation = projectDisplay.call(this.remote.eleckoiConversations, id, input).then((response) => {
          const results = this.unwrap(response, '生成消息显示内容失败。')
          if (!Array.isArray(results)) throw productFailure(ELECKOI_FAILURE_CODES.dataShapeInvalid, '消息显示投影返回的数据格式不正确。', { what: '消息显示投影结果' })
          const current = this.detailsSnapshot
          if (this.disposed || generation !== this.displayProjectionGeneration
            || current.id !== id || current.status !== 'ready' || !current.details) return
          const byId = new Map(results.map(result => [result?.id, result]))
          const projectedResults = new Map()
          for (const message of input) {
            const result = byId.get(message.id)
            if (!result || result.sourceContent !== message.content
              || typeof result.displayContent !== 'string'
              || typeof result.variableStateJson !== 'string') continue
            projectedResults.set(message.id, { role: message.role, result })
          }
          this.displayProjectionResults = projectedResults
          const projected = this.applyDisplayProjection(current)
          if (projected !== current) this.publishDetails(projected)
        }).catch((error) => {
          if (generation === this.displayProjectionGeneration) this.displayProjectionSignature = null
          console.error('ElecKoi 消息显示投影失败：', error)
        })
        this.displayProjectionPromise = operation
        return operation
      }

      publishTimeline(next) {
        this.timelineSnapshot = next
        for (const listener of this.timelineListeners) listener()
      }

      publishStream(next, publication = 'immediate') {
        if (sameStreamSnapshot(next, this.streamState)) return
        this.streamState = next
        if (publication === 'animation-frame' && typeof requestAnimationFrame === 'function') {
          if (this.streamFrame !== undefined) return
          this.streamFrame = requestAnimationFrame(() => {
            this.streamFrame = requestAnimationFrame(() => {
              this.streamFrame = requestAnimationFrame(() => {
                this.streamFrame = undefined
                this.flushStream()
              })
            })
          })
          return
        }
        this.cancelStreamFrame()
        this.flushStream()
      }

      flushStream() {
        if (this.streamSnapshot === this.streamState) return
        this.streamSnapshot = this.streamState
        for (const listener of this.streamListeners) listener()
        this.publishChatSnapshot()
      }

      cancelStreamFrame() {
        if (this.streamFrame !== undefined && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.streamFrame)
        this.streamFrame = undefined
      }

      start() {
        if (this.sessions?.list?.subscribe) {
          this.stopSessionList = this.sessions.list.subscribe(() => {
            if (this.disposed) return
            const items = this.withSessionActivity(this.snapshot.items)
            if (items.some((item, index) => item !== this.snapshot.items[index])) {
              this.publish({ ...this.snapshot, items })
            }
          })
        }
        const controller = new AbortController()
        this.changeFeedAbort = controller
        const remoteStream = typeof this.remote?.$stream === 'function'
          ? this.remote.$stream({
            name: 'ElecKoi conversation changes',
            open: signal => this.remote.eleckoiConversations.changes(signal),
            ended: () => new Error('ElecKoi 会话变更流意外结束。')
          })
          : this.remote.eleckoiConversations.changes(controller.signal)
        this.changeFeed = remoteStream
        void this.consumeChanges(remoteStream)
        this.stopEvents = () => {
          controller.abort()
          if (typeof remoteStream?.dispose === 'function') void remoteStream.dispose()
        }
        if (this.regexRules?.subscribe) {
          this.stopRegexRules = this.regexRules.subscribe((kind, characterId, snapshot) => {
            const current = this.detailsSnapshot
            if (kind !== 'configuration' || snapshot?.status !== 'ready'
              || !current.details || current.details.metadata?.characterId !== characterId) return
            this.displayProjectionSignature = null
            this.scheduleDisplayProjection(current.id, current.details)
          })
        }
      }

      async consumeChanges(stream) {
        try {
          for await (const item of stream) {
            if (this.disposed) return
            const change = item?.value ?? item
            item?.accept?.()
            this.handleChange(change)
          }
        } catch (error) {
          if (!this.disposed && !this.changeFeedAbort?.signal.aborted) {
            console.error('ElecKoi 会话变更流失败：', error)
            void this.refresh().catch(failureAlreadyPublished)
          }
        }
      }

      handleChange(change) {
        if (!change || typeof change !== 'object') return
        if (change.kind === 'generation') {
          if (change.conversationId !== this.detailsSnapshot.id) return
          if (change.error) {
            this.publishStream({ ...this.streamState, id: change.conversationId, status: 'error', error: change.error })
          }
          void this.refreshDetails().catch(failureAlreadyPublished)
          return
        }
        if (change.kind === 'snapshot' || change.kind === 'catalog') {
          if (change.kind === 'catalog' && change.reason === 'deleted') {
            if (this.detailsSnapshot.id === change.conversationId) this.activate('')
            if (this.timelineSnapshot.id === change.conversationId) this.closeTimeline(change.conversationId)
          }
          const generation = this.generation + 1
          const selectedId = this.detailsSnapshot.id
          const timelineId = this.timelineSnapshot.id
          void this.refresh().then(items => {
            if (this.disposed || generation !== this.generation) return
            const available = new Set(items.map(item => item.id))
            if (selectedId && this.detailsSnapshot.id === selectedId) {
              if (available.has(selectedId)) void this.refreshDetails().catch(failureAlreadyPublished)
              else if (!this.sessionMutations.has(selectedId)
                && !this.detailInvalidationFences.has(selectedId)) this.activate('')
            }
            if (timelineId && this.timelineSnapshot.id === timelineId) {
              if (available.has(timelineId)) void this.refreshTimeline().catch(failureAlreadyPublished)
              else this.closeTimeline(timelineId)
            }
          }).catch(failureAlreadyPublished)
          return
        }
        if (change.kind !== 'messages' || change.conversationId !== this.detailsSnapshot.id) return
        if (change.sessionRewritten === true && !this.sessionMutations.has(change.conversationId)) {
          void this.reloadSessionProjection(change.conversationId).catch(error => {
            if (!this.disposed && this.detailsSnapshot.id === change.conversationId) this.publishDetails({
              ...this.detailsSnapshot, status: 'error', error: error.message || String(error)
            })
            console.error('重载修改后的 DSH 会话失败：', error)
          })
          return
        }
        if (change.reason === 'deleted' || change.reason === 'regenerated' || change.reason === 'edited') {
          if (this.sessionMutations.has(change.conversationId)
            || this.detailInvalidationFences.has(change.conversationId)) return
          this.invalidateDetails(change.conversationId)
        } else {
          void this.refreshDetails().catch(failureAlreadyPublished)
        }
      }

      restoreConnection() {
        void this.refresh().catch(failureAlreadyPublished)
        if (this.detailsSnapshot.id) void this.refreshDetails().catch(failureAlreadyPublished)
        if (this.timelineSnapshot.id) void this.refreshTimeline().catch(failureAlreadyPublished)
        if (this.detailsSnapshot.id) void this.bindOfficialSession(this.detailsSnapshot.id).catch(failureAlreadyPublished)
      }

      withSessionActivity(items) {
        const byId = this.sessions?.list?.getSnapshot().byId
        if (!byId) return items
        return items.map(item => {
          const session = byId[item.runtimeSessionId]
          const updatedAt = Math.max(session?.updatedAt ?? 0, session?.projectionValues?.eleckoiConversationActivity ?? 0)
          return updatedAt > Date.parse(item.updatedAt)
            ? { ...item, updatedAt: new Date(updatedAt).toISOString() } : item
        })
      }

      async refresh() {
        if (this.disposed) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleDisposed, 'ElecKoi 会话目录已关闭。', { what: 'ElecKoi 会话目录' })
        const generation = ++this.generation
        try {
          const result = this.unwrap(
            await this.remote.eleckoiConversations.list(),
            '读取会话列表失败。'
          )
          if (!Array.isArray(result) || result.some(item => !item || typeof item.id !== 'string')) {
            throw productFailure(ELECKOI_FAILURE_CODES.dataShapeInvalid, '会话目录返回的数据格式不正确。', { what: '会话目录' })
          }
          const items = this.withSessionActivity(result)
          if (!this.disposed && generation === this.generation) {
            this.publish({ status: 'ready', items, error: '' })
            if (this.detailsSnapshot.id) void this.bindOfficialSession(this.detailsSnapshot.id).catch(failureAlreadyPublished)
          }
          return items
        } catch (error) {
          if (!this.disposed && generation === this.generation) {
            this.publish({
              status: 'error',
              items: this.snapshot.items,
              error: typeof error?.message === 'string' && error.message.trim() ? error.message : String(error)
            })
          }
          throw error
        }
      }

      async create(input) {
        if (this.disposed) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleNotReady, 'DSH 聊天服务正在恢复，请稍后重试。', { what: 'DSH 聊天服务' })
        const value = this.unwrap(
          await this.remote.eleckoiConversations.create(input),
          '新建聊天失败。'
        )
        const conversationId = value?.conversation?.id
        if (typeof conversationId !== 'string' || !conversationId) throw productFailure(ELECKOI_FAILURE_CODES.dataShapeInvalid, '新建聊天返回的数据格式不正确。', { what: '新建聊天结果' })
        const details = this.assertDetails(value, conversationId)
        await Promise.all([this.refresh(), this.sessions.refresh()])
        return details
      }

      async delete(conversationId) {
        if (!conversationId) return
        this.unwrap(
          await this.remote.eleckoiConversations.delete(conversationId),
          '删除聊天失败。'
        )
        if (this.detailsSnapshot.id === conversationId) this.activate('')
        if (this.timelineSnapshot.id === conversationId) this.closeTimeline(conversationId)
        await Promise.all([this.refresh(), this.sessions.refresh()])
      }

      async selectOpening(conversationId, openingId) {
        if (!conversationId || !openingId) throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, '请选择要切换的开场白。', { what: '选择要切换的开场白' })
        const details = this.assertDetails(this.unwrap(
          await this.remote.eleckoiConversations.selectOpening(conversationId, openingId),
          '切换开场白失败。'
        ), conversationId)
        this.acceptMutationDetails(conversationId, details)
        await this.refresh()
        return this.detailsSnapshot.id === conversationId ? this.refreshDetails() : details
      }

      async updateOpening(conversationId, content) {
        if (!conversationId) throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, '请先打开一个聊天。', { what: '打开一个聊天' })
        const details = this.assertDetails(this.unwrap(
          await this.remote.eleckoiConversations.updateOpening(conversationId, content),
          '修改开场白失败。'
        ), conversationId)
        this.acceptMutationDetails(conversationId, details)
        await this.refresh()
        return this.detailsSnapshot.id === conversationId ? this.refreshDetails() : details
      }

      async editMessage(conversationId, eventSeq, role, content) {
        if (!this.sessions || !this.uiConversation) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleNotReady, 'DSH 会话客户端尚未就绪。', { what: 'DSH 会话客户端' })
        await this.mutateSession(conversationId, async () => this.unwrap(
          await this.remote.eleckoiConversations.editMessage(conversationId, eventSeq, role, content),
          '修改消息失败。'
        ))
        await this.sessions.refresh()
        await this.bindOfficialSession(conversationId)
        await this.refreshDetails()
        return this.detailsSnapshot.details
      }

      async reloadSessionProjection(conversationId) {
        if (this.disposed || this.detailsSnapshot.id !== conversationId) return
        const runtimeSessionId = this.sessionReference?.sessionId || this.runtimeSessionId(conversationId) || this.detailsSnapshot.runtimeSessionId
        this.releaseOfficialSession()
        this.invalidateDetails(conversationId)
        if (runtimeSessionId && this.sessions) await this.sessions.reloadHistory(runtimeSessionId)
        await this.bindOfficialSession(conversationId, runtimeSessionId)
        return this.refreshDetails()
      }

      async deleteMessagesFrom(conversationId, eventSeq, role) {
        if (!this.sessions || !this.uiConversation) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleNotReady, 'DSH 会话客户端尚未就绪。', { what: 'DSH 会话客户端' })
        this.detailInvalidationFences.add(conversationId)
        if (this.streamSnapshot.id === conversationId) {
          this.publishStream({
            ...this.streamSnapshot,
            status: 'idle', runId: '', requestId: '', messageId: '', nodeKey: '',
            sequence: 0, dshTurn: undefined, renderKey: '', content: '', process: [], error: ''
          })
        }
        try {
          const result = await this.mutateSession(conversationId, async () => this.unwrap(
            await this.remote.eleckoiConversations.deleteMessagesFrom(conversationId, eventSeq, role),
            '删除消息失败。'
          ))
          // The reloaded DSH event source replaces the transcript. The product
          // result contains metadata, not a second authoritative message list.
          await this.sessions.refresh()
          await this.bindOfficialSession(conversationId)
          await this.refreshDetails()
          await this.refresh()
          return { ...result, details: this.detailsSnapshot.details }
        } finally {
          this.detailInvalidationFences.delete(conversationId)
        }
      }

      acceptMutationDetails(conversationId, details) {
        if (this.detailsSnapshot.id !== conversationId) return
        this.detailGeneration += 1
        const chat = this.sessionTarget?.getSnapshot()
        const runtimeSessionId = details.runtimeSessionId || this.detailsSnapshot.runtimeSessionId || ''
        const hasMore = chat ? Boolean(this.sessionReference.binding.eventSource.getSnapshot().hasMore) : details.hasMore
        const session = this.sessionReference?.binding?.session
        const sessionRunning = session ? session.getSnapshot().running === true : undefined
        const next = { ...details, runtimeSessionId, hasMore,
          messages: chat ? officialMessages(chat, { ...details, hasMore }, runtimeSessionId, this.officialProcess(chat), [], sessionRunning, this.inputContinuations(runtimeSessionId), this.abortedTurns(runtimeSessionId), this.regeneratingInputTurn(runtimeSessionId), this.illustrations(runtimeSessionId))
            : details.messages.filter(message => message.id === 'opening') }
        if (chat) next.beforeSequence = next.messages.find(message => message.id !== 'opening')?.sequence ?? null
        this.publishDetails({
          id: conversationId,
          status: 'ready',
          details: next,
          runtimeSessionId,
          error: ''
        })
      }

      activate(id) {
        if (this.disposed) return
        if (id === this.detailsSnapshot.id) return
        this.displayProjectionResults = new Map()
        this.releaseOfficialSession()
        this.publishStats('', null)
        this.detailGeneration += 1
        const runtimeSessionId = this.runtimeSessionId(id)
        this.publishDetails({ id, status: id ? 'loading' : 'idle', details: null, runtimeSessionId, error: '' })
        this.streamGeneration += 1
        this.publishStream({ id, status: 'idle', runId: '', requestId: '', messageId: '', nodeKey: '', sequence: 0, content: '', process: [], error: '' })
        if (id) {
          void this.bindOfficialSession(id).catch(failureAlreadyPublished)
        }
      }

      runtimeSessionId(id) {
        return this.snapshot.items.find(item => item.id === id)?.runtimeSessionId || ''
      }

      releaseOfficialSession() {
        const reference = this.sessionReference
        this.stopSessionGeneration()
        this.stopSessionGeneration = () => {}
        if (reference && this.sessionTarget) this.publishGeneration({
          conversationId: this.detailsSnapshot.id, runtimeSessionId: reference.sessionId,
          kind: 'released', running: false, events: [],
        })
        this.displayProjectionGeneration += 1
        this.displayProjectionSignature = null
        // Same-chat Session rewrites keep unchanged authored display documents.
        // applyDisplayProjection still rejects entries whose source/input changed.
        this.displayProjectionPromise = null
        this.sessionBindingGeneration += 1
        this.stopSessionTarget()
        this.stopSessionState()
        this.stopProjections()
        this.stopSessionTarget = () => {}
        this.stopSessionState = () => {}
        this.stopProjections = () => {}
        this.sessionTarget = null
        this.sessionTrajectoryTarget = null
        this.officialProjectionSignature = null
        this.lastAcceptedSession = null
        this.nodeProcessCache = new WeakMap()
        this.toolProcessCache = new WeakMap()
        this.inputContinuationsValue = undefined
        this.inputContinuationLinks = EMPTY_ITEMS
        this.sessionReference?.release()
        this.sessionReference = null
      }

      officialProcess(chat, nodes) {
        return officialProcess(chat, { trajectory: this.sessionTrajectoryTarget?.getSnapshot(),
          illustrations: this.illustrations(this.sessionReference?.sessionId), processCache: this.nodeProcessCache, nodes, toolCache: this.toolProcessCache })
      }

      inputContinuations(runtimeSessionId) {
        const reference = this.sessionReference
        if (reference?.sessionId !== runtimeSessionId) return EMPTY_ITEMS
        const value = reference.binding.session.projections?.faceOf('eleckoiInputContinuations')?.getSnapshot()
        if (!Array.isArray(value?.links)) return EMPTY_ITEMS
        if (this.inputContinuationsValue === value) return this.inputContinuationLinks
        this.inputContinuationsValue = value
        const inputsBySeq = new Map((value.inputs || []).map(input => [input.eventSeq, input]))
        this.inputContinuationLinks = value.links.map(link => {
          const input = inputsBySeq.get(link.inputEventSeq)
          // Regeneration preserves the original admission. Its exact event
          // and message identities distinguish that retired turn from a stop.
          return { ...link, inputTurn: input && input.messageId === link.inputMessageId ? input.turn : undefined }
        })
        return this.inputContinuationLinks
      }

      illustrations(runtimeSessionId) {
        const reference = this.sessionReference
        if (!reference || reference.sessionId !== runtimeSessionId) return EMPTY_ITEMS
        const value = reference.binding.session.projections?.faceOf('eleckoiIllustrations')?.getSnapshot()
        return Array.isArray(value) ? value : EMPTY_ITEMS
      }

      regeneratingInputTurn(runtimeSessionId) {
        const input = this.activeRequests.get(this.detailsSnapshot.id)?.regenerationInput
        const reference = this.sessionReference
        if (!input || input.runtimeSessionId !== runtimeSessionId || reference?.sessionId !== runtimeSessionId) return undefined
        // Rewind retains the input's original admission, but removes the old
        // continuation. Use that exact identity until the new link arrives.
        const identities = reference.binding.session.projections?.faceOf('eleckoiInputContinuations')?.getSnapshot()
        return identities?.inputs?.find(candidate => candidate.eventSeq === input.eventSeq)?.turn
      }

      abortedTurns(runtimeSessionId) {
        const reference = this.sessionReference
        if (reference?.sessionId !== runtimeSessionId) return []
        const value = reference.binding.session.projections?.faceOf('eleckoiTurnOutcomes')?.getSnapshot()
        return Array.isArray(value?.abortedTurns) ? value.abortedTurns : []
      }

      createOfficialProjectionSignature(chat, runtimeSessionId, hasMore, pendingSubmissions = [], sessionRunning, loadedNodes) {
        const nodes = loadedNodes || orderedChatNodes(chat)
        return {
          runtimeSessionId,
          hasMore,
          inputContinuations: this.inputContinuations(runtimeSessionId),
          illustrations: this.sessionReference?.binding.session.projections?.faceOf('eleckoiIllustrations')?.getSnapshot(),
          regeneratingInputTurn: this.regeneratingInputTurn(runtimeSessionId),
          abortedTurns: this.abortedTurns(runtimeSessionId),
          canChangeOpening: this.openingChangeAllowed(this.detailsSnapshot.id, runtimeSessionId),
          sessionRunning,
          pendingSubmissions,
          compactions: (this.sessionTrajectoryTarget?.getSnapshot()?.requests || [])
            .filter(request => request.purpose === 'compaction' && Number.isSafeInteger(request.turn) && request.turn > 0),
          nodes: nodes.filter(node => node.kind === 'user' || node.kind === 'steering'
            || node.kind === 'turn-tail' || node.kind === 'turn-process'
            || node.kind === 'assistant-step' || node.kind === 'tool-call' || node.kind === 'model-retry'
            || node.kind === 'turn-error' || node.kind === 'turn-max-tokens')
        }
      }

      sameOfficialProjection(left, right) {
        return left?.runtimeSessionId === right?.runtimeSessionId
          && left?.hasMore === right?.hasMore
          && left?.inputContinuations?.length === right?.inputContinuations?.length
          && left.inputContinuations.every((item, index) => sameRecord(item, right.inputContinuations[index]))
          && left?.illustrations === right?.illustrations
          && left?.regeneratingInputTurn === right?.regeneratingInputTurn
          && sameReferences(left?.abortedTurns, right?.abortedTurns)
          && left?.canChangeOpening === right?.canChangeOpening
          && left?.sessionRunning === right?.sessionRunning
          && left?.pendingSubmissions?.length === right?.pendingSubmissions?.length
          && left.pendingSubmissions.every((submission, index) => submission === right.pendingSubmissions[index])
          && left?.compactions?.length === right?.compactions?.length
          && left.compactions.every((request, index) => request === right.compactions[index])
          && left?.nodes?.length === right?.nodes?.length
          && left.nodes.every((node, index) => node === right.nodes[index])
      }

      async mutateSession(conversationId, operation) {
        if (this.sessionMutations.has(conversationId)) throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, '当前聊天正在修改消息。', { what: '等待当前消息修改完成' })
        await this.bindOfficialSession(conversationId)
        let finish
        const settled = new Promise(resolve => { finish = resolve })
        this.sessionMutations.set(conversationId, settled)
        this.detailGeneration += 1
        const reference = this.sessionReference
        this.sessionReference = null
        this.releaseOfficialSession()
        const session = reference?.binding.session
        let stop = () => {}
        let timeout
        const retired = session ? new Promise((resolve, reject) => {
          const check = () => { if (session.getSnapshot().removed) resolve() }
          stop = session.subscribe(check)
          timeout = setTimeout(() => reject(productFailure(ELECKOI_FAILURE_CODES.timeoutExpired, '等待 DSH 会话关闭通知超时。', { what: 'DSH 会话关闭通知' })), 15_000)
          check()
        }) : Promise.resolve()
        // 同一个 promise 在下面 `await retired`；这里只消除重复的未处理拒绝。
        void retired.catch(rejectionIsAwaitedElsewhere)
        try {
          const result = await operation()
          await retired
          const runtimeSessionId = reference?.sessionId || this.runtimeSessionId(conversationId)
          if (runtimeSessionId) await this.sessions.reloadHistory(runtimeSessionId)
          return result
        } catch (error) {
          // A rejected preflight may keep the writer; a reverted edit replaces it.
          // In either case discard the retired generation before the next action.
          const runtimeSessionId = reference?.sessionId || this.runtimeSessionId(conversationId)
          if (runtimeSessionId) await this.sessions.reloadHistory(runtimeSessionId).catch(error => reportClientFailure('恢复会话历史失败', error))
          throw error
        } finally {
          clearTimeout(timeout)
          stop()
          reference?.release()
          this.detailGeneration += 1
          this.sessionMutations.delete(conversationId)
          finish()
        }
      }

      async bindOfficialSession(id, runtimeSessionIdHint = '') {
        // A rewind closes the Host writer. Catalog and change-feed refreshes
        // must not materialize the next Client generation until it has finished.
        const mutation = this.sessionMutations.get(id)
        if (mutation) await mutation
        if (this.disposed || !id || id !== this.detailsSnapshot.id) return
        const runtimeSessionId = runtimeSessionIdHint || this.runtimeSessionId(id) || this.detailsSnapshot.runtimeSessionId || ''
        if (!runtimeSessionId) return
        if (this.sessionReference?.sessionId === runtimeSessionId && this.sessionTarget) return
        let reference = this.sessionReference?.sessionId === runtimeSessionId ? this.sessionReference : null
        if (!reference) this.releaseOfficialSession()
        const generation = this.sessionBindingGeneration
        if (!reference) {
          if (!this.sessions.list.getSnapshot().byId[runtimeSessionId]) await this.sessions.refresh()
          if (this.disposed || generation !== this.sessionBindingGeneration || id !== this.detailsSnapshot.id) return
          // The catalog retains data; only a mounted conversation owns mainView.
          reference = this.sessions.retain(runtimeSessionId, { source: 'eleckoiConversations' })
          this.sessionReference = reference
        }
        try {
          const binding = await reference.ready
          if (this.disposed || generation !== this.sessionBindingGeneration || id !== this.detailsSnapshot.id) {
            reference.release()
            return
          }
          if (this.sessionTarget) return
          const target = this.uiConversation.binding(binding).target('chat')
          this.sessionTarget = target
          const trajectoryTarget = this.uiConversation.binding(binding).target('trajectory')
          this.sessionTrajectoryTarget = trajectoryTarget
          const publish = () => {
            if (generation !== this.sessionBindingGeneration || this.sessionReference !== reference || this.sessionTarget !== target) return
            this.acceptOfficialSession(id, runtimeSessionId, binding.session, target)
          }
          const stopChat = target.subscribe(publish)
          const stopTrajectory = trajectoryTarget.subscribe(publish)
          this.stopSessionTarget = () => { stopChat(); stopTrajectory() }
          this.stopSessionState = binding.session.subscribe(publish)
          let eventRevision = binding.eventSource.getSnapshot().revision
          const publishGeneration = (kind, entries) => this.publishGeneration({
            conversationId: id, runtimeSessionId, kind, running: binding.session.getSnapshot().running === true,
            events: this.generationEvents(entries),
          })
          this.stopSessionGeneration = binding.eventSource.subscribe(() => {
            if (generation !== this.sessionBindingGeneration || this.sessionReference !== reference || this.sessionTarget !== target) return
            const window = binding.eventSource.getSnapshot()
            if (window.revision === eventRevision) return
            eventRevision = window.revision
            // The official window delta identifies live appends/settlements.
            // Older pages and complete replacements are not new generation.
            if (window.change.kind === 'append') publishGeneration('live', window.change.entries)
            else if (window.change.kind === 'settle-assistant' && window.change.entry) publishGeneration('live', [window.change.entry])
            else if (window.change.kind === 'replace') publishGeneration('baseline', window.entries)
          })
          publishGeneration('baseline', binding.eventSource.getSnapshot().entries)
          const projections = ['sessionStats', 'tokenUsage', 'contextPressure', 'contextBreakdown', 'eleckoiHistoryStatsAdjustment']
            .map(key => [key, binding.session.projections?.faceOf(key)])
          const inputContinuationsFace = binding.session.projections?.faceOf('eleckoiInputContinuations')
          const turnOutcomesFace = binding.session.projections?.faceOf('eleckoiTurnOutcomes')
          const illustrationsFace = binding.session.projections?.faceOf('eleckoiIllustrations')
          const inboxFace = binding.session.projections?.faceOf('inbox')
          const publishProjections = () => {
            if (this.disposed || generation !== this.sessionBindingGeneration || id !== this.detailsSnapshot.id) return
            const stats = Object.fromEntries(projections.map(([key, face]) => [key, face?.getSnapshot()]))
            const adjustment = stats.eleckoiHistoryStatsAdjustment
            delete stats.eleckoiHistoryStatsAdjustment
            const identities = inputContinuationsFace?.getSnapshot()
            if (stats.sessionStats) stats.sessionStats = {
              ...stats.sessionStats,
              steps: Math.max(0, stats.sessionStats.steps - (Number(adjustment?.steps) || 0)),
              turns: Array.isArray(identities?.inputs) ? new Set(identities.inputs.map(input => input.eventSeq)).size
                : Math.max(0, stats.sessionStats.turns - (Number(adjustment?.turns) || 0))
            }
            this.publishStats(id, stats)
          }
          const stops = [
            ...projections.map(([, face]) => face?.subscribe(publishProjections)),
            inputContinuationsFace?.subscribe(() => { publishProjections(); publish() }),
            turnOutcomesFace?.subscribe(publish),
            illustrationsFace?.subscribe(publish),
            inboxFace?.subscribe(publish),
          ].filter(Boolean)
          this.stopProjections = () => { for (const stop of stops) stop() }
          publishProjections()
          publish()
        } catch (error) {
          if (this.sessionReference === reference) this.sessionReference = null
          reference.release()
          throw error
        }
      }

      acceptOfficialSession(id, runtimeSessionId, session, target) {
        if (this.disposed || id !== this.detailsSnapshot.id) return
        const sessionState = session.getSnapshot()
        const chat = target.getSnapshot()
        const entries = orderedChatEntries(chat)
        const nodes = entries.map(entry => entry.node)
        const eventWindow = this.sessionReference?.binding.eventSource.getSnapshot()
        const hasMore = Boolean(eventWindow?.hasMore)
        const pendingSubmissions = sessionState.pendingSubmissions || EMPTY_ITEMS
        const sessionRunning = sessionState.running === true
        const signature = this.createOfficialProjectionSignature(chat, runtimeSessionId, hasMore, pendingSubmissions, sessionRunning, nodes)
        const lifecycle = { promptError: sessionState.promptError, lastAgentError: sessionState.lastAgentError,
          openError: sessionState.openError, removed: sessionState.removed }
        const accepted = this.lastAcceptedSession
        // Session and target notifications can describe one publication. Skip
        // repeated work only if lifecycle, official nodes and displayed state agree.
        if (accepted?.details === this.detailsSnapshot && accepted.stream === this.streamState
          && accepted.events === eventWindow?.entries && sameRecord(accepted.lifecycle, lifecycle)
          && this.sameOfficialProjection(signature, accepted.signature)) return
        const details = this.detailsSnapshot.details
        const processByTurn = this.officialProcess(chat, nodes)
        let pendingDetails = null
        if (details) {
          if (!this.sameOfficialProjection(signature, this.officialProjectionSignature)) {
            const next = {
              ...details, runtimeSessionId,
              messages: officialMessages(chat, { ...details, hasMore }, runtimeSessionId, processByTurn, pendingSubmissions, sessionRunning, this.inputContinuations(runtimeSessionId), this.abortedTurns(runtimeSessionId), this.regeneratingInputTurn(runtimeSessionId), this.illustrations(runtimeSessionId), entries),
              hasMore,
            }
            next.beforeSequence = next.messages.find(message => message.id !== 'opening')?.sequence ?? null
            pendingDetails = {
              snapshot: { id, status: 'ready', details: next, runtimeSessionId, error: '' },
              signature,
            }
          }
        }
        const retiredTurns = new Set([
          ...this.abortedTurns(runtimeSessionId),
          ...nodes.filter(node => node.kind === 'turn-tail' && node.data?.closing).map(nodeTurn),
          ...(eventWindow?.entries || EMPTY_ITEMS)
            .filter(entry => entry.type === 'event' && entry.event.type === 'turn/end'
              && ['aborted', 'interrupted'].includes(entry.event.data?.reason?.kind))
            .map(entry => entry.event.data.turn),
        ])
        const previousTurn = this.streamState.status === 'running' && !retiredTurns.has(this.streamState.dshTurn)
          ? this.streamState.dshTurn : undefined
        const liveTurn = [...(chat?.timeline?.turns?.values() || [])]
          .findLast(turn => turn.status === 'open' && !retiredTurns.has(turn.turn))?.turn
          ?? previousTurn
        const runningAssistant = nodes
          .findLast(node => node.kind === 'assistant-step'
            && !retiredTurns.has(nodeTurn(node)) && node.location?.turn?.status !== 'closed'
            && node.data?.status !== 'interrupted'
            && (!Number.isSafeInteger(liveTurn) || nodeTurn(node) === liveTurn)
            && (node.data?.status === 'running' || assistantText(node.data?.blocks).trim() !== ''))
        const current = this.streamState
        const openTurn = nodeTurn(runningAssistant) ?? liveTurn
        // A retired current turn still owns its final hand-off. It cannot
        // identify a future run whose turn/start has not arrived yet.
        const sameLiveTurn = current.id === id && current.status === 'running'
          && (current.dshTurn === openTurn || (openTurn === undefined && retiredTurns.has(current.dshTurn)))
        const projectedReply = assistantContent(runningAssistant?.data?.blocks).live
        const content = projectedReply.started ? projectedReply.content
          : !runningAssistant && sameLiveTurn ? current.content : ''
        const promptError = sessionState.promptError?.op === 'send'
          ? sessionState.promptError.error?.message || '生成失败。'
          : ''
        const terminalFailure = nodes.findLast(node => node.kind === 'turn-error' && nodeTurn(node) === openTurn)
        const executionError = promptError || sessionState.lastAgentError || terminalFailure?.data?.message || sessionState.openError?.message
          || (sessionState.removed ? 'DSH 会话已关闭。' : '')
        const cancellationSettling = this.cancelledStreamConversations.has(id)
        // DSH publishes the turn-tail as soon as `turn/end` is observed. Its
        // `closing` assistant can be populated on the following projection
        // pass, so the presence of the tail alone is not a hand-off point.
        // Dropping the live row at that boundary made a one-turn chat go
        // blank for one render before the final assistant node arrived.
        const turnTail = sameLiveTurn && Number.isSafeInteger(current.dshTurn)
          ? nodes.find(node => node.kind === 'turn-tail' && node.data?.turn === current.dshTurn)
          : null
        // The official Session event stream is the authority for why a turn
        // ended. An aborted/interrupted turn can have no closing text node,
        // so it must not enter the normal delayed-final hand-off path below.
        // That path is intentionally retained for a normally completed turn
        // whose final assistant projection arrives one pass later.
        const endedTurnReason = sameLiveTurn && Number.isSafeInteger(current.dshTurn)
          ? (eventWindow?.entries || EMPTY_ITEMS)
            .filter(entry => entry.type === 'event')
            .map(entry => entry.event)
            .findLast(event => event.type === 'turn/end' && event.data?.turn === current.dshTurn)
            ?.data?.reason?.kind
          : undefined
        const interruptedTurn = endedTurnReason === 'aborted' || endedTurnReason === 'interrupted'
        // A settled durable reply can contain only reasoning/tool activity.
        // Its event identity and status finish the hand-off without body text.
        const pendingFinal = sameLiveTurn && Boolean(pendingDetails?.snapshot?.details?.messages?.some(message =>
          message.role === 'assistant'
          && message.dshTurn === current.dshTurn
          && message.status === 'complete'
          && Number.isSafeInteger(message.sessionEventSeq)))
        const turnSettled = Boolean(turnTail?.data?.closing?.finalNode) || pendingFinal
        const awaitingFinal = sameLiveTurn && !turnSettled && (
          projectedReply.started
          || String(current.content || '').length > 0
          || (Array.isArray(current.process) && current.process.length > 0)
        )
        if (cancellationSettling || interruptedTurn) {
          if (pendingDetails) this.publishDetails(pendingDetails.snapshot, pendingDetails.signature)
          if (!sessionState.running) this.cancelledStreamConversations.delete(id)
          if (current.id === id && current.status === 'running') {
            this.publishStream({
              ...current,
              status: 'idle', runId: '', requestId: '', messageId: '', nodeKey: '',
              content: '', process: [], error: ''
            })
          }
        } else if (executionError) {
          if (pendingDetails) this.publishDetails(pendingDetails.snapshot, pendingDetails.signature)
          this.publishStream({ ...current, id, runId: runtimeSessionId, status: 'error', error: executionError })
        } else if (turnSettled) {
          const nextStream = { ...current, status: 'idle', error: '' }
          if (pendingDetails) this.publishOfficialState(pendingDetails.snapshot, pendingDetails.signature, nextStream)
          else this.publishStream(nextStream)
        } else if (this.cancelledStreamRuns.has(current.runId)
          && current.id === id && current.status === 'running') {
          if (pendingDetails) this.publishDetails(pendingDetails.snapshot, pendingDetails.signature)
          this.publishStream({
            ...current,
            status: 'idle', runId: '', requestId: '', messageId: '', nodeKey: '',
            content: '', process: [], error: ''
          })
        } else if (sessionState.running && Number.isSafeInteger(openTurn)) {
          if (pendingDetails) this.publishDetails(pendingDetails.snapshot, pendingDetails.signature)
          const message = details?.messages?.findLast(item => item.role === 'assistant'
            && item.status === 'streaming' && item.dshTurn === openTurn)
          const process = mergedProcess(message?.process || (sameLiveTurn ? current.process : []), processByTurn.get(openTurn))
          // Activity creates the live row before final text. The body boundary
          // controls only its content, not the visibility of reasoning and tools.
          // Keep the stream identity stable while DSH is running; the renderer
          // decides whether the current snapshot has enough activity to paint a
          // visible assistant row.
          const hasLiveMessage = Number.isSafeInteger(openTurn)
            && (projectedReply.started || process.length > 0 || sessionState.running
            || (sameLiveTurn && Boolean(current.messageId)))
          this.publishStream({
            id, status: 'running', runId: runtimeSessionId, requestId: '',
            messageId: hasLiveMessage ? runningAssistant?.data?.messageId
              || (sameLiveTurn ? current.messageId : '') : '',
            nodeKey: hasLiveMessage ? runningAssistant?.key
              || (sameLiveTurn ? current.nodeKey : '') : '',
            renderKey: `dsh-reply-${runtimeSessionId}-${openTurn}`,
            dshTurn: openTurn,
            sequence: current.id === id ? current.sequence + 1 : 1,
            content, process, error: ''
          })
        } else if (!sessionState.running && current.id === id && current.status === 'running' && awaitingFinal) {
          // Keep the already visible stream row while the official tail is
          // waiting for its closing assistant. This is still DSH state, not a
          // renderer placeholder; the next official snapshot atomically
          // replaces it with the durable row.
          if (pendingDetails) this.publishDetails(pendingDetails.snapshot, pendingDetails.signature)
          const process = mergedProcess([], processByTurn.get(openTurn))
          this.publishStream({
            ...current,
            status: 'running',
            content: projectedReply.started ? projectedReply.content : current.content,
            process,
            error: '',
          })
        } else if (!sessionState.running && current.id === id && current.status === 'running') {
          if (pendingDetails) this.publishDetails(pendingDetails.snapshot, pendingDetails.signature)
          this.publishStream({ ...current, status: 'idle', error: '' })
        } else if (pendingDetails) {
          this.publishDetails(pendingDetails.snapshot, pendingDetails.signature)
        }
        this.lastAcceptedSession = { details: this.detailsSnapshot, stream: this.streamState,
          events: eventWindow?.entries, lifecycle, signature }
      }

      async cancelStream(expectedRunId) {
        const current = this.streamState
        if (this.disposed || current.status !== 'running' || !current.runId || current.runId !== expectedRunId) return false
        this.cancelledStreamRuns.add(current.runId)
        this.cancelledStreamConversations.add(current.id)
        const request = this.activeRequests.get(current.id)
        if (request) request.cancelled = true
        const session = this.sessionReference?.binding.session
        this.publishStream({
          ...current,
          status: 'idle', runId: '', requestId: '', messageId: '', nodeKey: '',
          content: '', process: [], error: ''
        })
        if (session) {
          const result = await session.cancel()
          unwrapOrFail(result, '停止生成失败。')
        }
        return true
      }

      async send(input) {
        if (this.disposed || !input?.conversationId || !input.requestId) throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, '无法开始这次回复。', { what: '打开一个聊天并重试' })
        if (!this.sessions || !this.uiConversation || !this.remote?.session) {
          throw productFailure(ELECKOI_FAILURE_CODES.lifecycleNotReady, 'DSH 会话客户端尚未就绪。', { what: 'DSH 会话客户端' })
        }
        return this.runRequest(input, request => this.runOfficialPrompt(input, request))
      }

      requireInput(conversationId) {
        const reference = this.sessionReference
        if (this.disposed || !conversationId || this.detailsSnapshot.id !== conversationId
          || !reference || reference.sessionId !== this.runtimeSessionId(conversationId)) {
          throw productFailure(ELECKOI_FAILURE_CODES.lifecycleNotReady, '当前聊天的官方输入框尚未就绪。', { what: '当前聊天的官方输入框' })
        }
        return this.conversation.input.for(reference.binding.ctx)
      }

      readInputDraft(conversationId) {
        return this.requireInput(conversationId).state.getSnapshot().draft
      }

      writeInputDraft(conversationId, text) {
        if (typeof text !== 'string') throw productFailure(ELECKOI_FAILURE_CODES.inputInvalid, '输入框内容必须是文本。', { field: 'text' })
        const input = this.requireInput(conversationId)
        input.setDraft(text)
        return input.state.getSnapshot().draft
      }

      submitInput(conversationId) {
        const input = this.requireInput(conversationId), state = input.state.getSnapshot()
        if (state.phase === 'adjudicating' || state.phase === 'submitting'
          || !state.draft.trim() && !state.attachmentIds.length) return false
        input.submit('queue', 'click')
        return true
      }

      async prepareNativeInput(input) {
        if (input?.signal?.aborted) {
          const error = new Error('生成请求已取消。')
          error.name = 'AbortError'
          throw error
        }
        // Only the product catalog establishes ownership of a roleplay Session.
        // Native Workspace Sessions keep their own preparation and send lifecycle.
        const owned = this.snapshot.items.some(item => item.runtimeSessionId === input?.sessionId)
        if (!owned) return { kind: 'success' }
        const conversationId = this.detailsSnapshot.id
        if (!conversationId || this.runtimeSessionId(conversationId) !== input?.sessionId) {
          return { kind: 'error', text: '当前聊天与输入框会话不一致。' }
        }
        try {
          await this.unwrap(
            await this.remote.eleckoiConversations.preparePrompt(conversationId, input.text || '', input.signal),
            '准备 DSH 会话失败。'
          )
          if (!this.sessionReference || this.sessionReference.sessionId !== input.sessionId) {
            await this.bindOfficialSession(conversationId)
          }
          return { kind: 'success' }
        } catch (error) {
          return { kind: 'error', text: error?.message || '准备 DSH 会话失败。' }
        }
      }

      async regenerate(input) {
        if (this.disposed || !input?.conversationId || !input.requestId) throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, '无法重新生成这次回复。', { what: '打开一个聊天并重试' })
        if (!this.sessions || !this.uiConversation || !this.remote?.session) {
          throw productFailure(ELECKOI_FAILURE_CODES.lifecycleNotReady, 'DSH 会话客户端尚未就绪。', { what: 'DSH 会话客户端' })
        }
        return this.runRequest(input, request => this.runOfficialRegeneration(input, request))
      }

      primeRewindRequest(input, request) {
        if (!Number.isSafeInteger(input?.eventSeq)) return
        request.rewindEventSeq = input.eventSeq
      }

      async runRequest(input, run) {
        if (this.activeRequests.has(input.conversationId)) throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, '当前聊天正在生成。', { what: '等待当前回复生成完成' })
        const request = { requestId: input.requestId, cancelled: false, session: null }
        this.activeRequests.set(input.conversationId, request)
        this.cancelledStreamRuns.delete(this.streamState.runId)
        this.cancelledStreamConversations.delete(input.conversationId)
        // Hide only the retiring output until the new Session window arrives.
        // The selected durable input is never removed or replaced by an echo.
        this.primeRewindRequest(input, request)
        this.publishStream({
          id: input.conversationId, status: 'idle', runId: '', requestId: input.requestId,
          messageId: '', nodeKey: '', sequence: 0, content: '', process: [], error: ''
        })
        try {
          return await run(request)
        } catch (error) {
          if (this.streamState.id === input.conversationId) {
            this.publishStream({ ...this.streamState, status: 'error', error: error.message || String(error) })
          }
          throw error
        } finally {
          if (this.activeRequests.get(input.conversationId) === request) this.activeRequests.delete(input.conversationId)
          if (this.detailsSnapshot.id === input.conversationId) {
            const reference = this.sessionReference
            // Releasing a failed/cancelled preparation restores the real
            // stopped history. An accepted continuation remains authoritative.
            if (request.regenerationInput && reference?.binding && this.sessionTarget) {
              this.acceptOfficialSession(input.conversationId, reference.sessionId, reference.binding.session, this.sessionTarget)
            } else this.publishDetails(this.detailsSnapshot, this.officialProjectionSignature)
          }
          request.rewindEventSeq = undefined
          if (request.statsPending && this.detailsSnapshot.id === input.conversationId
            && this.latestStatsSnapshot.id === input.conversationId) {
            this.publishStats(input.conversationId, this.latestStatsSnapshot.stats)
          }
        }
      }

      async runOfficialPrompt(input, request) {
        const conversationId = input.conversationId
        const runtimeSessionId = this.runtimeSessionId(conversationId) || this.detailsSnapshot.runtimeSessionId
        if (!runtimeSessionId) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleNotReady, '当前聊天缺少 DSH Session。', { what: '当前聊天的 DSH 会话' })
        const prepared = await this.unwrap(
          await this.remote.eleckoiConversations.preparePrompt(conversationId, input.text || '', input.signal),
          '准备 DSH 会话失败。'
        )
        if (!this.sessionReference || this.sessionReference.sessionId !== runtimeSessionId) {
          await this.bindOfficialSession(conversationId)
        }
        const session = this.sessionReference?.binding.session
        if (!session) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleNotReady, '当前聊天的 DSH Session 尚未连接。', { what: '当前聊天的 DSH 会话' })
        request.session = session
        if (request.cancelled || input.signal?.aborted) {
          return { details: await this.refreshDetails(), cancelled: true }
        }
        const content = []
        if (typeof input.text === 'string' && input.text.length > 0) content.push({ type: 'text', text: input.text })
        for (const image of Array.isArray(input.images) ? input.images : []) {
          if (!image?.data || !image?.mediaType) continue
          content.push({ type: 'image', data: image.data, mediaType: image.mediaType, ...(image.name ? { name: image.name } : {}) })
        }
        for (const file of Array.isArray(input.files) ? input.files : []) {
          if (typeof file !== 'string' || !file) continue
          content.push({ type: 'file', receiptId: file })
        }
        const accepted = await session.prompt(content, input.mode === 'steer' ? 'steer' : 'queue', input.signal, input.requestId)
        unwrapOrFail(accepted, '生成请求失败。')
        if (request.cancelled || input.signal?.aborted) this.unwrap(await session.cancel(), '停止生成失败。')
        const completed = await waitForOfficialSession(session, this.sessionReference.binding.eventSource, input.requestId)
        if (prepared.operationId) {
          this.unwrap(await this.remote.eleckoiConversations.waitForGeneration(conversationId, prepared.operationId), '等待聊天保存失败。')
        }

        const details = this.detailsSnapshot.id === conversationId
          ? await this.refreshDetails()
          : this.unwrap(await this.remote.eleckoiConversations.details(conversationId, undefined, undefined), '读取会话详情失败。')
        return {
          details: this.assertDetails(details, conversationId),
          cancelled: completed.cancelled || request.cancelled
        }
      }

      async uploadFile(conversationId, file, options = {}) {
        if (this.disposed) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleDisposed, 'ElecKoi 会话目录已关闭。', { what: 'ElecKoi 会话目录' })
        if (!conversationId) throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, '请先打开一个聊天。', { what: '打开一个聊天' })
        if (!file || typeof file.name !== 'string') throw productFailure(ELECKOI_FAILURE_CODES.inputInvalid, '请选择有效文件。', { field: 'file' })
        if (!this.fileUpload) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleNotReady, 'DSH 文件上传服务尚未就绪。', { what: 'DSH 文件上传服务' })
        if (this.detailsSnapshot.id !== conversationId) await this.open(conversationId)
        const runtimeSessionId = this.runtimeSessionId(conversationId)
          || (this.detailsSnapshot.id === conversationId ? this.detailsSnapshot.runtimeSessionId : '')
          || (this.detailsSnapshot.id === conversationId ? this.detailsSnapshot.details?.runtimeSessionId : '')
        if (!runtimeSessionId) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleNotReady, '当前聊天缺少 DSH Session。', { what: '当前聊天的 DSH 会话' })
        const uploaded = this.unwrap(
          await this.fileUpload.upload(
            runtimeSessionId,
            file,
            file.name,
            options.signal,
            options.onProgress
          ),
          '文件上传失败。'
        )
        if (!uploaded || typeof uploaded.receiptId !== 'string'
          || !uploaded.file || typeof uploaded.file.attachmentId !== 'string') {
          throw productFailure(ELECKOI_FAILURE_CODES.dataShapeInvalid, 'DSH 文件上传服务返回的数据格式不正确。', { what: 'DSH 文件上传结果' })
        }
        return {
          id: uploaded.receiptId,
          receiptId: uploaded.receiptId,
          attachmentId: uploaded.file.attachmentId,
          name: typeof uploaded.file.name === 'string' && uploaded.file.name ? uploaded.file.name : file.name,
          bytes: Number.isSafeInteger(uploaded.file.bytes) ? uploaded.file.bytes : file.size
        }
      }

      async runOfficialRegeneration(input, request) {
        if (!Number.isSafeInteger(input.eventSeq)) throw productFailure(ELECKOI_FAILURE_CODES.lookupNotFound, '找不到这条输入对应的 DSH 消息。', { what: '这条输入对应的 DSH 消息' })
        request.regenerationInput = { eventSeq: input.eventSeq, runtimeSessionId: this.runtimeSessionId(input.conversationId) }
        request.statsPending = this.statsSnapshot.id === input.conversationId && Boolean(this.statsSnapshot.stats)
        this.primeRewindRequest(input, request)
        this.detailGeneration += 1
        this.displayProjectionGeneration += 1
        this.displayProjectionSignature = null
        if (this.detailsSnapshot.id === input.conversationId) this.publishDetails(this.detailsSnapshot)
        let prepared
        try {
          prepared = await this.mutateSession(input.conversationId, async () => this.unwrap(
            await this.remote.eleckoiConversations.regenerateMessage(
              input.conversationId,
              input.eventSeq,
              input.requestId,
              input.replacementMessage == null ? undefined : input.replacementMessage
            ),
            '重新生成失败。'
          ))
        } catch (error) {
          request.rewindEventSeq = undefined
          await (async () => {
            await this.sessions.refresh()
            await this.bindOfficialSession(input.conversationId)
            await this.refreshDetails()
          })().catch(bestEffort)
          throw error
        } finally {
          request.rewindEventSeq = undefined
        }
        await this.sessions.refresh()
        await this.bindOfficialSession(input.conversationId)
        // Rewind invalidates the projection. Request presentation hooks need the
        // fresh retained history before the Agent can begin its next request.
        if (this.detailsSnapshot.id === input.conversationId) await this.refreshDetails()
        request.statsBaselineSteps = this.latestStatsSnapshot.stats?.sessionStats?.steps ?? 0
        const session = this.sessionReference?.binding.session
        if (!session || prepared.prepared !== true) throw productFailure(ELECKOI_FAILURE_CODES.stateMismatch, '重新生成请求未完成 DSH Session 回退。', { what: '重新生成的回退状态' })
        request.session = session
        const cancelled = request.cancelled || input.signal?.aborted === true
        const accepted = this.unwrap(
          await this.remote.eleckoiConversations.startRegeneration(input.conversationId, input.requestId, cancelled),
          '重新生成请求失败。'
        )
        if (cancelled) {
          request.regenerationInput = undefined
          return { details: await this.refreshDetails(), cancelled: true }
        }
        if (accepted.accepted !== true) throw productFailure(ELECKOI_FAILURE_CODES.stateMismatch, '重新生成请求未被 DSH Session 接受。', { what: '重新生成请求的接受结果' })
        if (!Number.isSafeInteger(accepted.turn) || accepted.turn < 1) throw productFailure(ELECKOI_FAILURE_CODES.dataShapeInvalid, '重新生成请求缺少 DSH 执行轮次。', { what: '重新生成请求的执行轮次' })
        if (request.cancelled || input.signal?.aborted) this.unwrap(await session.cancel(), '停止生成失败。')
        const completed = await waitForOfficialSession(session, this.sessionReference.binding.eventSource, input.requestId, accepted.turn)
        if (prepared.operationId) {
          this.unwrap(await this.remote.eleckoiConversations.waitForGeneration(input.conversationId, prepared.operationId), '等待聊天保存失败。')
        }
        const details = await this.refreshDetails()
        return {
          details: this.assertDetails(details, input.conversationId),
          cancelled: completed.cancelled || request.cancelled
        }
      }

      async cancelRequest(conversationId, requestId) {
        if (this.disposed || !conversationId || !requestId) return false
        const request = this.activeRequests.get(conversationId)
        if (!request || request.requestId !== requestId) return false
        request.cancelled = true
        this.cancelledStreamConversations.add(conversationId)
        const current = this.streamState
        if (current.id === conversationId && current.status === 'running' && current.runId) {
          this.cancelledStreamRuns.add(current.runId)
          this.publishStream({
            ...current,
            status: 'idle', runId: '', requestId: '', messageId: '', nodeKey: '',
            content: '', process: [], error: ''
          })
        }
        if (request.session) {
          const result = await request.session.cancel()
          this.unwrap(result, '停止生成失败。')
        }
        return true
      }

      async cancelGeneration(conversationId) {
        if (this.disposed || !conversationId || this.detailsSnapshot.id !== conversationId) return false
        const request = this.activeRequests.get(conversationId)
        if (request) return this.cancelRequest(conversationId, request.requestId)
        const current = this.streamState
        if (current.id !== conversationId || current.status !== 'running' || !current.runId) return false
        return this.cancelStream(current.runId)
      }

      invalidateDetails(id) {
        if (this.disposed || !id || id !== this.detailsSnapshot.id) return
        const runtimeSessionId = this.detailsSnapshot.details?.runtimeSessionId || this.detailsSnapshot.runtimeSessionId || ''
        this.detailGeneration += 1
        // Keep the last coherent projection mounted while the official
        // Session is being rebound. Publishing `details: null` makes the
        // renderer unmount the transcript, then mixes the returning DSH rows
        // with stale React identities (avatars/floors remain while actions
        // disappear).
        this.publishDetails({ id, status: 'loading', details: this.detailsSnapshot.details, runtimeSessionId, error: '' })
        void this.refreshDetails().catch(failureAlreadyPublished)
      }

      assertDetails(value, id) {
        if (!value || value.conversation?.id !== id || !Array.isArray(value.messages)
          || value.messages.some(message => !message || typeof message.id !== 'string')) {
          throw productFailure(ELECKOI_FAILURE_CODES.dataShapeInvalid, '会话详情返回的数据格式不正确。', { what: '会话详情' })
        }
        return value
      }

      mergeTail(previous, incoming) {
        if (!previous || !incoming.messages.length) return incoming
        const firstSequence = incoming.messages.reduce((first, message) =>
          Number.isInteger(message.sequence) ? Math.min(first, message.sequence) : first,
        Number.POSITIVE_INFINITY)
        if (!Number.isFinite(firstSequence)) return incoming
        const incomingIds = new Set(incoming.messages.map(message => message.id))
        const retained = previous.messages.filter(message =>
          Number.isInteger(message.sequence) && message.sequence < firstSequence && !incomingIds.has(message.id))
        return retained.length ? {
          ...incoming,
          messages: [...retained, ...incoming.messages],
          hasMore: previous.hasMore,
          beforeSequence: previous.beforeSequence
        } : incoming
      }

      async refreshDetails() {
        const id = this.detailsSnapshot.id
        if (this.disposed || !id) throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, 'ElecKoi 当前会话不可用。', { what: '打开一个聊天' })
        const generation = ++this.detailGeneration
        try {
          const details = this.assertDetails(this.unwrap(
            await this.remote.eleckoiConversations.details(id, undefined, undefined),
            '读取会话详情失败。'
          ), id)
          const runtimeSessionId = details.runtimeSessionId || this.runtimeSessionId(id)
          if (runtimeSessionId && this.sessions && this.uiConversation) {
            await this.bindOfficialSession(id, runtimeSessionId)
          }
          if (this.disposed || this.detailsSnapshot.id !== id) return null
          const chat = this.sessionTarget?.getSnapshot()
          if (runtimeSessionId && this.sessions && this.uiConversation && !chat) {
            throw productFailure(ELECKOI_FAILURE_CODES.lifecycleNotReady, 'DSH 聊天正文尚未加载。', { what: 'DSH 聊天正文' })
          }
          const hasMore = chat ? Boolean(this.sessionReference.binding.eventSource.getSnapshot().hasMore) : details.hasMore
          const session = this.sessionReference?.binding?.session
          const sessionRunning = session ? session.getSnapshot().running === true : undefined
          const projected = chat
            ? { ...details, runtimeSessionId, hasMore,
              messages: officialMessages(chat, { ...details, hasMore }, runtimeSessionId, this.officialProcess(chat), [], sessionRunning, this.inputContinuations(runtimeSessionId), this.abortedTurns(runtimeSessionId), this.regeneratingInputTurn(runtimeSessionId), this.illustrations(runtimeSessionId)) }
            : details
          if (chat) projected.beforeSequence = projected.messages.find(message => message.id !== 'opening')?.sequence ?? null
          if (generation === this.detailGeneration) {
            this.publishDetails({
              id, status: 'ready',
              details: chat ? projected : this.mergeTail(this.detailsSnapshot.details, projected),
              runtimeSessionId,
              error: ''
            })
            await this.displayProjectionPromise
            return this.detailsSnapshot.details
          }
          // A newer Session publication can supersede this read. Its return
          // value still feeds the renderer, so apply matching display results
          // just as the published snapshot does.
          return this.applyDisplayProjection({ id, status: 'ready', details: projected }).details
        } catch (error) {
          if (!this.disposed && generation === this.detailGeneration && this.detailsSnapshot.id === id) {
            this.publishDetails({
              ...this.detailsSnapshot,
              status: 'error',
              error: typeof error?.message === 'string' && error.message.trim() ? error.message : String(error)
            })
          }
          throw error
        }
      }

      async open(id) {
        this.activate(id)
        const details = await this.refreshDetails()
        return this.detailsSnapshot.id === id ? details : null
      }

      async pageOlder(expectedId, expectedBeforeSequence) {
        const current = this.detailsSnapshot
        const id = current.id
        const beforeSequence = current.details?.beforeSequence
        if (this.disposed || !id || id !== expectedId || beforeSequence !== expectedBeforeSequence
          || !current.details?.hasMore || !Number.isInteger(beforeSequence)) return null
        const session = this.sessionReference?.binding.session
        const bindingGeneration = this.sessionBindingGeneration
        const metadataSequence = current.details.messages.reduce((first, message) =>
          Number.isInteger(message.productSequence) ? Math.min(first, message.productSequence) : first,
        Number.POSITIVE_INFINITY)
        const [, result] = await Promise.all([
          session?.loadOlder(),
          this.remote.eleckoiConversations.details(id, Number.isFinite(metadataSequence) ? metadataSequence : beforeSequence, 50)
        ])
        const page = this.unwrap(result, '读取更早消息失败。')
        if (!page || !Array.isArray(page.messages)
          || page.messages.some(message => !message || typeof message.id !== 'string')
          || typeof page.hasMore !== 'boolean'
          || (page.beforeSequence !== null && !Number.isInteger(page.beforeSequence))) {
          throw productFailure(ELECKOI_FAILURE_CODES.dataShapeInvalid, '更早消息返回的数据格式不正确。', { what: '更早消息' })
        }
        const latest = this.detailsSnapshot
        if (this.disposed || latest.id !== id || bindingGeneration !== this.sessionBindingGeneration
          || (!session && latest.details?.beforeSequence !== beforeSequence)) return null
        const chat = this.sessionTarget?.getSnapshot()
        if (chat) {
          const metadata = { ...latest.details, messages: [...page.messages, ...latest.details.messages] }
          const hasMore = Boolean(this.sessionReference.binding.eventSource.getSnapshot().hasMore)
          const sessionRunning = session ? session.getSnapshot().running === true : undefined
          const messages = officialMessages(chat, { ...metadata, hasMore }, latest.runtimeSessionId, this.officialProcess(chat), [], sessionRunning, this.inputContinuations(latest.runtimeSessionId), this.abortedTurns(latest.runtimeSessionId), this.regeneratingInputTurn(latest.runtimeSessionId), this.illustrations(latest.runtimeSessionId))
          const next = { ...latest.details, messages, hasMore,
            beforeSequence: messages.find(message => message.id !== 'opening')?.sequence ?? null }
          this.publishDetails({ ...latest, status: 'ready', error: '', details: next })
          return { ...page, messages, hasMore, beforeSequence: next.beforeSequence, replace: true }
        }
        const existingIds = new Set(latest.details.messages.map(message => message.id))
        const older = page.messages.filter(message => !existingIds.has(message.id))
        this.publishDetails({
          id, status: 'ready', error: '',
          details: {
            ...latest.details,
            messages: [...older, ...latest.details.messages],
            hasMore: page.hasMore,
            beforeSequence: page.beforeSequence
          }
        })
        return page
      }

      async observeRequestPreviews(id, onChange, signal) {
        if (this.disposed) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleDisposed, 'DSH 聊天服务已关闭。', { what: 'DSH 聊天服务' })
        signal.throwIfAborted()
        const controller = new AbortController()
        const stream = this.remote.$stream({
          name: 'ElecKoi request preview catalog',
          open: currentSignal => this.remote.eleckoiConversations.requestPreviews(id, currentSignal),
          ended: () => new Error('请求上下文预览连接已结束。')
        })
        const close = () => { controller.abort(); void stream.dispose() }
        this.previewStreams.add(close)
        signal.addEventListener('abort', close, { once: true })
        try {
          for await (const frame of stream) {
            if (controller.signal.aborted || signal.aborted || this.disposed) return
            onChange(frame.value)
            frame.accept()
          }
        } finally {
          signal.removeEventListener('abort', close)
          this.previewStreams.delete(close)
          close()
        }
      }

      async readRequestPreview(id, requestId, signal) {
        if (this.disposed) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleDisposed, 'DSH 聊天服务已关闭。', { what: 'DSH 聊天服务' })
        return this.unwrap(await this.remote.eleckoiConversations.requestPreview(id, requestId, signal), '请求上下文预览读取失败。')
      }

      async refreshTimeline() {
        const id = this.timelineSnapshot.id
        if (this.disposed || !id) throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, 'ElecKoi 当前变量时间线不可用。', { what: '打开一个聊天' })
        const generation = ++this.timelineGeneration
        try {
          const timeline = this.unwrap(
            await this.remote.eleckoiConversations.variableTimeline(id),
            '读取变量时间线失败。'
          )
          if (!timeline || !Array.isArray(timeline.floors)
            || timeline.floors.some(floor => !floor || typeof floor.id !== 'string')) {
            throw productFailure(ELECKOI_FAILURE_CODES.dataShapeInvalid, '变量时间线返回的数据格式不正确。', { what: '变量时间线' })
          }
          if (!this.disposed && generation === this.timelineGeneration && this.timelineSnapshot.id === id) {
            this.publishTimeline({ id, status: 'ready', timeline, error: '' })
          }
          return timeline
        } catch (error) {
          if (!this.disposed && generation === this.timelineGeneration && this.timelineSnapshot.id === id) {
            this.publishTimeline({
              ...this.timelineSnapshot,
              status: 'error',
              error: typeof error?.message === 'string' && error.message.trim() ? error.message : String(error)
            })
          }
          throw error
        }
      }

      async openTimeline(id) {
        if (this.disposed || !id) return null
        this.timelineGeneration += 1
        this.publishTimeline({ id, status: 'loading', timeline: null, error: '' })
        await this.refreshTimeline()
        return this.timelineSnapshot.id === id && this.timelineSnapshot.status === 'ready'
          ? this.timelineSnapshot.timeline : null
      }

      closeTimeline(id) {
        if (this.disposed || this.timelineSnapshot.id !== id) return
        this.timelineGeneration += 1
        this.publishTimeline({ id: '', status: 'idle', timeline: null, error: '' })
      }

      dispose() {
        if (this.disposed) return
        this.disposed = true
        this.generation += 1
        this.detailGeneration += 1
        this.timelineGeneration += 1
        this.releaseOfficialSession()
        for (const close of this.previewStreams) close()
        this.previewStreams.clear()
        this.publishStats('', null)
        this.cancelStreamFrame()
        this.stopEvents()
        this.stopSessionList()
        this.stopRegexRules()
        this.changeFeed = null
        this.changeFeedAbort = null
        this.nativeInputHandler = null
        this.listeners.clear()
        this.detailsListeners.clear()
        this.chatListeners.clear()
        this.modelSelectionListeners.clear()
        this.timelineListeners.clear()
        this.streamListeners.clear()
        this.generationListeners.clear()
        this.statsListeners.clear()
      }
    }

    function apply(ctx) {
      const catalog = new ConversationCatalog(ctx.remote, ctx.sessions, ctx.uiConversation, ctx.fileUpload, ctx.eleckoiRegexRules, ctx.conversation)
      ctx.provide('eleckoiConversations', catalog)
      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'messages', registrant: '@eleckoi/dsh-client-conversations' },
        () => React.createElement(MessagesPage)))
      const NavigationIcon = React.lazy(() => import(new URL('eleckoi-page-messages.js', new URL(globalThis.__ELECKOI_CLIENT_ASSETS__.script, location.href)).href)
        .then(module => ({ default: module.NavigationIcon })))
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist', id: 'messages', order: -40, label: () => ctx.locale.bind('eleckoi.ui')("消息"), registrant: '@eleckoi/dsh-client-conversations'
      }, ({ size }) => React.createElement(React.Suspense, { fallback: null }, React.createElement(NavigationIcon, { size }))))
      ctx.effect(() => {
        catalog.start()
        const stopReset = ctx.on('connection/reset', () => catalog.restoreConnection())
        return () => {
          stopReset()
          catalog.dispose()
        }
      }, 'eleckoi: conversation catalog')
    }

    return { inject: ['locale', 'slots', 'sessions', 'uiConversation', 'conversation', 'fileUpload', 'eleckoiRegexRules', 'remote', 'remote.settings', 'remote.session', 'remote.eleckoiConversationModels', 'remote.eleckoiConversations'], apply }
  }
})
