window.__ModuleLoader__.load({
  id: '@eleckoi/dsh-client-conversations',
  factory(require) {
    const React = require('react')
    const MessagesPage = React.lazy(() => import('dsh-app://app/eleckoi/assets/eleckoi-page-messages.js')
      .then(module => ({ default: module.MessagesPage })))

    const contentText = content => Array.isArray(content)
      ? content.filter(block => block?.type === 'text').map(block => String(block.text || '')).join('')
      : ''

    const assistantText = blocks => Array.isArray(blocks)
      ? blocks.filter(block => block?.kind === 'text').map(block => String(block.text || '')).join('')
      : ''

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
      const closingIndex = content.indexOf(FinalCloseTag)
      return removeTrailingLineBreak(closingIndex < 0 ? content : content.slice(0, closingIndex))
    }

    function liveFinalReply(value) {
      const markerIndex = value.indexOf(FinalOpenTag)
      if (markerIndex < 0) return { started: false, content: '' }
      const content = removeLeadingLineBreak(value.slice(markerIndex + FinalOpenTag.length))
      const closingIndex = content.indexOf(FinalCloseTag)
      return {
        started: true,
        content: closingIndex < 0
          ? withoutPartialFinalClose(content)
          : removeTrailingLineBreak(content.slice(0, closingIndex))
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

    function nodeTurn(node) {
      const turn = node?.location?.kind === 'step' || node?.location?.kind === 'turn'
        ? node.location.turn?.turn : node?.data?.turn
      return Number.isSafeInteger(turn) && turn > 0 ? Number(turn) : undefined
    }

    function projectedUserTurn(nodes, index) {
      const direct = nodeTurn(nodes[index])
      if (direct !== undefined) return direct
      // User nodes are not stamped with a turn by DSH. A completed tail is
      // the authoritative boundary for the queued inputs immediately before
      // it; if there is no later tail, the input is still outside a turn.
      for (let cursor = index + 1; cursor < nodes.length; cursor += 1) {
        const candidate = nodes[cursor]
        if (candidate?.kind !== 'turn-tail') continue
        const turn = nodeTurn(candidate)
        if (turn !== undefined) return turn
      }
      return undefined
    }

    function toolProcess(block, parentId = '') {
      if (!block?.callId) return []
      const settled = block.kind === 'tool-result'
      const name = settled ? block.call?.name || block.callId : block.name || block.callId
      const item = {
        id: String(block.callId), kind: processKind(name),
        status: settled ? block.isError ? 'error' : 'complete' : 'running',
        toolName: name,
        arguments: settled ? block.call?.argsRaw || '' : block.argsRaw || '',
        summary: name,
        detail: settled ? processText(block.content) || block.error?.reason || block.error?.code || '' : '',
        startedAtMillis: Number(settled ? block.callTime : block.time) || 0,
        ...(settled ? { completedAtMillis: Number(block.time) || 0 } : {}),
        ...(parentId ? { parentId } : {})
      }
      return [item, ...(block.subCalls || []).flatMap(child => toolProcess(child, item.id))]
    }

    function officialProcess(snapshot, options = {}) {
      const byTurn = new Map()
      const append = (turn, item) => {
        if (!Number.isSafeInteger(turn) || turn < 0) return
        const items = byTurn.get(turn) || []
        const index = items.findIndex(candidate => candidate.id === item.id)
        if (index < 0) byTurn.set(turn, [...items, item])
        else byTurn.set(turn, items.map((candidate, at) => at === index ? item : candidate))
      }
      const nodes = orderedChatNodes(snapshot)
      for (const node of nodes) {
        const turn = node.location?.kind === 'step' || node.location?.kind === 'turn'
          ? node.location.turn.turn : node.data?.turn
        if (node.kind === 'assistant-step') {
          const blocks = node.data?.blocks || []
          const hasToolCall = blocks.some(block => block?.kind === 'tool-call')
          blocks.forEach((block, index) => {
            if (block?.kind === 'reasoning' && block.text) append(turn, {
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
              && block?.kind === 'text' && narrativeText) append(turn, {
              id: `narrative:${turn}:${node.data?.step ?? 0}:${index}`,
              kind: 'narrative', status: node.data?.status === 'running' ? 'running' : 'complete',
              toolName: 'assistant_narrative', arguments: '', summary: narrativeText, detail: narrativeText,
              startedAtMillis: Number(node.data?.time) || 0,
            })
          })
        }
        if (node.kind === 'tool-call') {
          for (const item of toolProcess(node.data?.root)) append(turn, item)
        }
      }
      return byTurn
    }

    function subagentSessionId(item) {
      const value = `${item?.detail || ''}\n${item?.summary || ''}`
      return value.match(/started (?:background )?subagent(?: job)?\s+([0-9a-z-]+)/i)?.[1] || ''
    }

    function subagentAssignments(processByTurn, catalog) {
      const roots = [...processByTurn.entries()].flatMap(([turn, items]) => items
        .filter(item => item?.kind === 'subagent' || item?.toolName === 'subagent' || item?.toolName === 'subagent_fork')
        .map(item => ({ turn, item })))
        .sort((left, right) => Number(left.item.startedAtMillis || 0) - Number(right.item.startedAtMillis || 0))
      const entries = [...(catalog || [])].sort((left, right) => Number(left.createdAt || 0) - Number(right.createdAt || 0))
      const claimedEntries = new Set()
      const assigned = new Map()
      for (const root of roots) {
        const sessionId = subagentSessionId(root.item)
        const entry = sessionId ? entries.find(candidate => candidate.id === sessionId) : undefined
        if (!entry || claimedEntries.has(entry.id)) continue
        claimedEntries.add(entry.id)
        assigned.set(entry.id, root)
      }
      for (const root of roots) {
        if ([...assigned.values()].includes(root)) continue
        const startedAt = Number(root.item.startedAtMillis || 0)
        const candidates = entries.filter(entry => !claimedEntries.has(entry.id))
        if (!candidates.length) break
        const entry = candidates.reduce((best, candidate) => {
          const delta = Math.abs(Number(candidate.createdAt || 0) - startedAt)
          const bestDelta = Math.abs(Number(best.createdAt || 0) - startedAt)
          return delta < bestDelta ? candidate : best
        })
        claimedEntries.add(entry.id)
        assigned.set(entry.id, root)
      }
      return assigned
    }

    function childSessionProcess(entry, target) {
      const snapshot = target?.getSnapshot()
      if (!snapshot) return []
      const prefix = `subagent:${entry.id}:`
      const nodes = orderedChatNodes(snapshot)
      const closingAssistantNodes = new Set()
      for (const tail of nodes) {
        if (tail.kind !== 'turn-tail' || !tail.data?.closing) continue
        const finalNode = tail.data.closing.finalNode
        const candidates = nodes.filter(node => node.kind === 'assistant-step'
          && nodeTurn(node) === nodeTurn(tail))
        const closingText = assistantText(tail.data.closing.blocks)
        const closingNode = candidates.find(node => (finalNode?.messageId
          && node.data?.messageId === finalNode.messageId)
          || (Number.isSafeInteger(finalNode?.seq) && node.data?.seq === finalNode.seq))
          || candidates.findLast(node => closingText
            && assistantText(node.data?.blocks) === closingText)
        if (closingNode) closingAssistantNodes.add(closingNode)
      }
      const items = [...officialProcess(snapshot, {
        includeAllNarrative: true,
        skipNarrativeNodes: closingAssistantNodes,
        narrativeText: value => finalReplyText(value),
      }).values()].flat().map(item => ({
        ...item,
        id: `${prefix}${item.id}`,
        ...(item.parentId ? { parentId: `${prefix}${item.parentId}` } : {})
      }))
      for (const node of nodes) {
        if (node.kind !== 'turn-tail' || !node.data?.closing) continue
        const content = finalReplyText(assistantText(node.data.closing.blocks)).trim()
        if (!content) continue
        items.push({
          id: `${prefix}final:${node.data.turn}`,
          kind: 'narrative', status: 'complete', toolName: 'assistant_final',
          arguments: '', summary: content, detail: content,
          startedAtMillis: Number(node.data.closing.finalNode?.time) || Number(entry.createdAt) || 0,
          completedAtMillis: Number(node.data.closing.finalNode?.time) || Number(entry.createdAt) || 0,
        })
      }
      return items
    }

    function officialProcessWithSubagents(snapshot, catalog, subagentSessions) {
      const byTurn = officialProcess(snapshot)
      // DSH records every subagent in an independent child Session. A parent
      // tool call contains only the delegation receipt, so its visible process
      // must join the parent catalog identity with the child's official Chat
      // projection instead of treating tool-call `subCalls` as child history.
      const assignments = subagentAssignments(byTurn, catalog)
      for (const entry of catalog || []) {
        const root = assignments.get(entry.id)
        const child = subagentSessions.get(entry.id)
        if (!root || !child?.target) continue
        const delegated = childSessionProcess(entry, child.target).map(item => ({
          ...item,
          parentId: item.parentId || root.item.id,
        }))
        if (!delegated.length) continue
        const current = byTurn.get(root.turn) || []
        const delegatedIds = new Set(delegated.map(item => item.id))
        byTurn.set(root.turn, [...current.filter(item => !delegatedIds.has(item.id)), ...delegated])
      }
      return byTurn
    }

    function mergedProcess(product = [], official = []) {
      const items = [...product]
      for (const item of official) {
        const index = items.findIndex(candidate => candidate.id === item.id)
        if (index < 0) items.push(item)
        else items[index] = { ...items[index], ...item }
      }
      return items
    }

    // DSH may notify both the Session state and the chat target for one
    // logical update. Keep the live snapshot stable when the affected nodes
    // did not change; React can then preserve the already-mounted message
    // rows while the official target continues to own the projection.
    function streamSnapshotKey(snapshot) {
      const process = Array.isArray(snapshot?.process) ? snapshot.process.map(item => [
        item?.id, item?.kind, item?.status, item?.toolName, item?.arguments,
        item?.summary, item?.detail, item?.startedAtMillis, item?.completedAtMillis, item?.parentId
      ]) : []
      return JSON.stringify([
        snapshot?.id, snapshot?.status, snapshot?.runId, snapshot?.requestId,
        snapshot?.messageId, snapshot?.renderKey, snapshot?.dshTurn,
        snapshot?.nodeKey, snapshot?.content, snapshot?.error, process
      ])
    }

    const inputImages = content => Array.isArray(content) ? content.flatMap(block => {
      const attachment = block?.type === 'image' ? block.attachment : null
      return attachment?.attachmentId ? [{ ...attachment }] : []
    }) : []

    const inputFiles = content => Array.isArray(content) ? content.flatMap(block => {
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
          finish(new Error('等待 DSH 会话完成超时。'))
        }, 10 * 60 * 1000)
        const check = () => {
          if (settled) return
          const snapshot = session.getSnapshot()
          if (snapshot?.promptError?.op === 'send') {
            finish(new Error(snapshot.promptError.error?.message || '生成失败。'))
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
          if (reason?.kind === 'error') finish(new Error(reason.error?.message || snapshot.lastAgentError || '生成失败。'))
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

    function officialMessages(snapshot, details, runtimeSessionId, processByTurn = new Map(), pendingSubmissions = [], sessionRunning, inputLinks = [], abortedTurns = []) {
      if (!snapshot) return (details?.messages || []).filter(message => message.id === 'opening')
      const entries = orderedChatEntries(snapshot)
      for (const node of snapshot.nodes?.values?.() || []) {
        const seq = Number(node.id), binding = details?.compatibilityPresentation?.bindings?.[`${runtimeSessionId}:${seq}`]
        if (node.kind === 'system-prompt' && binding?.role === 'system' && !entries.some(entry => entry.node === node)) {
          entries.push({ key: node.key || `plugin-system-${seq}`, node })
        }
      }
      const nodes = entries.map(entry => entry.node)
      const failedTurns = new Set(nodes.filter(node => node.kind === 'turn-error').map(nodeTurn))
      const endedTurns = new Set(nodes.filter(node => node.kind === 'turn-tail')
        .map(nodeTurn).filter(Number.isSafeInteger))
      const aborted = new Set(abortedTurns)
      const closedTurns = new Set(nodes.filter(node => node.kind === 'turn-tail' && node.data?.closing)
        .map(nodeTurn).filter(Number.isSafeInteger))
      const latestOpenAssistantByTurn = new Map()
      entries.forEach((entry, index) => {
        const turn = nodeTurn(entry.node)
        if (entry.node.kind !== 'assistant-step' || !Number.isSafeInteger(turn) || closedTurns.has(turn)) return
        const blocks = entry.node.data?.blocks || []
        const hasActivity = liveFinalReply(assistantText(blocks)).started
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
        if (node.kind === 'system-prompt') {
          const seq = Number(node.id), binding = details?.compatibilityPresentation?.bindings?.[`${runtimeSessionId}:${seq}`]
          // Only a real plugin-inserted system message has a persisted binding.
          // Internal Agent system prompts remain part of its process projection.
          if (!binding || binding.role !== 'system') return []
          return [{ role: 'system', seq, time: node.location?.step?.start?.time,
            content: node.data?.text || '', sessionEventSeq: seq }]
        }
        if (node.kind === 'user' || node.kind === 'steering') {
          const input = node.data
          const dshTurn = projectedUserTurn(nodes, nodeIndex)
          return [{
            role: 'user', seq: input.seq, time: input.time, content: contentText(input.content),
            images: inputImages(input.content), files: inputFiles(input.content), dshMessageId: input.messageId || '',
            sessionEventSeq: input.seq,
            requestId: input.source?.kind === 'user' ? input.source.rpcId || '' : '',
            // `null` means this official input has not entered a DSH turn.
            dshTurn: dshTurn ?? null
          }]
        }
        if (node.kind === 'assistant-step') {
          const turn = nodeTurn(node)
          if (!Number.isSafeInteger(turn) || closedTurns.has(turn) || latestOpenAssistantByTurn.get(turn) !== nodeIndex) return []
          const raw = assistantText(node.data?.blocks)
          const live = liveFinalReply(raw)
          const finalNode = node.data?.finalNode
          return [{
            role: 'assistant', seq: finalNode?.seq ?? node.data?.seq ?? node.anchorSeq ?? Number.MAX_SAFE_INTEGER,
            time: node.data?.time, content: live.started ? live.content : '',
            displayContent: live.started ? live.content : '',
            dshMessageId: node.data?.messageId || '', nodeKey: entry.key, dshTurn: turn,
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
        const closingAssistant = entries.find(candidate => candidate.node.kind === 'assistant-step'
          && nodeTurn(candidate.node) === tail.turn
          && ((finalNode.messageId && candidate.node.data?.messageId === finalNode.messageId)
            || (Number.isSafeInteger(finalNode.seq) && candidate.node.data?.seq === finalNode.seq)))
        return [{
          role: 'assistant', seq: finalNode.seq, time: finalNode.time, content: assistantText(closing.blocks),
          displayContent: finalReplyText(assistantText(closing.blocks)),
          dshMessageId: finalNode.messageId || '', interrupted: aborted.has(tail.turn) || finalNode.interrupted === true,
          usage: closing.usage, turnUsage: tail.tokenUsage, sessionEventSeq: finalNode.seq, dshTurn: tail.turn,
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
      for (let index = 0; index < projected.length; index += 1) {
        const item = projected[index]
        const sourceIndex = candidates.findIndex(candidate => !claimedCandidates.has(candidate)
          && candidate.role === item.role
          && ((item.dshMessageId && candidate.dshMessageId === item.dshMessageId)
            || candidate.sessionEventSeq === item.seq))
        if (sourceIndex >= 0) {
          const source = candidates[sourceIndex]
          claimedCandidates.add(source)
          matched.set(index, source)
        }
      }
      const visible = projected.map((item, index) => {
        const source = matched.get(index)
        const migration = details?.compatibilityPresentation?.bindings?.[`${runtimeSessionId}:${item.seq}`]
        const id = migration?.id || source?.id || item.dshMessageId || item.nodeKey || (item.requestId
          ? `dsh-pending-${item.requestId}`
          : `dsh-${runtimeSessionId}-${item.seq}-${item.role}`)
        const runtimeVariableState = item.role === 'assistant' && Number.isSafeInteger(item.dshTurn)
          ? details?.runtimeVariableStateByTurn?.[String(item.dshTurn)]
          : undefined
        const message = {
          ...(source || {}), id, conversationId: details?.conversation?.id || source?.conversationId || '',
          ...(Number.isInteger(source?.productSequence ?? source?.sequence) ? { productSequence: source.productSequence ?? source.sequence } : {}),
          runtimeSessionId, dshMessageId: item.dshMessageId || source?.dshMessageId || '',
          sessionEventSeq: item.sessionEventSeq,
          ...(item.requestId ? { requestId: item.requestId } : {}),
          ...(Object.prototype.hasOwnProperty.call(item, 'dshTurn') ? { dshTurn: item.dshTurn } : {}),
          ...(item.role === 'assistant' && Number.isSafeInteger(item.dshTurn) ? {
            dshTurn: item.dshTurn,
            inputEventSeq: inputLinks.find(link => link.turn === item.dshTurn)?.inputEventSeq,
            renderKey: `dsh-reply-${runtimeSessionId}-${item.dshTurn}`
          } : {}),
          ...(item.nodeKey ? { dshNodeKey: item.nodeKey } : {}),
          // `sequence` is the durable DSH event position. `messageIndex` is only
          // the current visible list position and must be rebuilt after sorting.
          sequence: item.seq, messageIndex: index,
          role: item.role, content: item.content,
          // Product projection owns an explicit display value, including an
          // intentional empty result. Only an unmapped live message uses the
          displayContent: source?.content === item.content && typeof source.displayContent === 'string'
            ? source.displayContent
            : item.displayContent ?? item.content,
          // The DSH turn is the stable identity after regeneration. Its
          // checkpoint is the exact post-reply state used by the old renderer;
          // product-row metadata is only a fallback for pre-checkpoint history.
          variableStateJson: runtimeVariableState || source?.variableStateJson || '{}',
          createdAt: source?.createdAt || new Date(item.time || Date.now()).toISOString(),
          ...(item.kind ? { kind: item.kind } : {}),
          ...(item.error ? { error: item.error, dshTurn: item.dshTurn } : {}),
          status: item.error ? 'error' : item.pending ? 'streaming' : item.interrupted ? 'cancelled' : 'complete',
          process: mergedProcess(source?.process, processByTurn.get(item.dshTurn)),
          ...(item.turnUsage || source?.turnUsage ? { turnUsage: item.turnUsage || source.turnUsage } : {}),
          ...(item.images?.length ? { inputImageAttachments: item.images } : {}),
          ...(item.files?.length ? { inputFileAttachments: item.files } : {})
        }
        const hasAttachments = Boolean(message.inputImageAttachments?.length || message.inputFileAttachments?.length)
        const hasProcess = Array.isArray(message.process) && message.process.length > 0
        const hasText = String(message.content || '').trim().length > 0
        return { message, keep: hasText || hasAttachments || hasProcess || message.status === 'streaming' }
      }).filter(item => item.keep).map(item => item.message)
      const anchor = visible.findIndex(message => Number.isSafeInteger(matched.get(projected.findIndex(item => item.seq === message.sequence))?.messageIndex))
      const firstFloor = !details?.hasMore || anchor < 0 ? opening.length : Math.max(opening.length,
        matched.get(projected.findIndex(item => item.seq === visible[anchor].sequence)).messageIndex
          - visible.slice(0, anchor).filter(message => message.kind !== 'turn-error').length)
      const presentation = details?.compatibilityPresentation, timeline = presentation?.timeline || {}, deleted = new Set(timeline.deleted || [])
      const order = new Map((timeline.order || []).map((id, index) => [id, index]))
      let messageFloor = firstFloor
      let finalFloor = 0
        return [...opening, ...visible.map(message => ({ ...message,
          messageIndex: message.kind === 'turn-error' ? undefined : messageFloor++ }))]
        .filter(message => !deleted.has(message.id)).map(message => {
          const metadata = presentation?.metadata?.[message.id] || {}, extensions = presentation?.extensions?.[message.id] || {}
          const binding = presentation?.bindings?.[`${runtimeSessionId}:${message.sessionEventSeq}`], swipes = presentation?.swipes?.[message.id] || {}
          return { ...message, ...extensions, ...swipes, ...(presentation?.variables?.[message.id] ? { variables: presentation.variables[message.id] } : {}),
            ...(binding?.role ? { role: binding.role } : {}), metadata, ...(typeof metadata.name === 'string' ? { name: metadata.name, speakerName: metadata.name } : {}),
            ...(typeof metadata.speakerId === 'string' ? { speakerId: metadata.speakerId } : {}),
            ...(typeof metadata.avatar === 'string' ? { speakerAvatar: metadata.avatar } : {}),
            ...(metadata.extra?.reasoning !== undefined ? { reasoning: metadata.extra.reasoning } : {}) }
        }).sort((a, b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER))
        .map(message => message.kind === 'turn-error' ? { ...message, messageIndex: undefined }
          : { ...message, messageIndex: order.size || deleted.size ? finalFloor++ : message.messageIndex })
    }

    class ConversationCatalog {
      constructor(remote, sessions, uiConversation, fileUpload, regexRules) {
        this.remote = remote
        this.sessions = sessions
        this.uiConversation = uiConversation
        this.fileUpload = fileUpload
        this.regexRules = regexRules
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
        this.streamStateKey = streamSnapshotKey(this.streamState)
        this.streamListeners = new Set()
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
        this.stopSessionTarget = () => {}
        this.stopSessionState = () => {}
        this.stopProjections = () => {}
        this.subagentCatalog = []
        this.subagentSessions = new Map()
        this.subagentProjectionRevision = 0
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
        this.stopRegexRules = () => {}
        this.displayProjectionKey = ''
        this.displayProjectionGeneration = 0
        this.displayProjectionResults = new Map()
        this.displayProjectionPromise = null
        this.officialProjectionSignature = null
      }

      getSnapshot = () => this.snapshot

      subscribe = listener => {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
      }

      getDetailsSnapshot = () => this.detailsSnapshot

      getStatsSnapshot = () => this.statsSnapshot

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
        if (this.disposed || !attachment?.attachmentId) throw new Error('图片不可用。')
        const runtimeSessionId = this.runtimeSessionId(conversationId)
          || (this.detailsSnapshot.id === conversationId ? this.detailsSnapshot.runtimeSessionId : '')
        if (!runtimeSessionId) throw new Error('当前聊天缺少 DSH Session。')
        if (this.detailsSnapshot.id === conversationId) await this.bindOfficialSession(conversationId)
        return this.uiConversation.imageUrl(runtimeSessionId, attachment)
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
        if (!result?.ok) throw new Error(result?.error?.message || fallback)
        return result.value
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
        this.selectionWriteQueue = operation.catch(() => {})
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
        if (!conversationId) throw new Error('请先打开一个聊天。')
        return this.unwrap(
          await this.remote.eleckoiConversations.authorState(conversationId),
          '读取作者接口上下文失败。'
        )
      }

      async exportArchive(conversationId) {
        if (!conversationId) throw new Error('请选择要导出的聊天记录。')
        return this.unwrap(
          await this.remote.eleckoiConversations.exportArchive(conversationId),
          '导出聊天记录失败。'
        )
      }

      async importArchive(characterId, json) {
        if (!characterId) throw new Error('请先选择角色，再导入聊天记录。')
        return this.unwrap(
          await this.remote.eleckoiConversations.importArchive(characterId, json),
          '导入聊天记录失败。'
        )
      }

      async revealFile(conversationId, attachmentId, name) {
        if (!conversationId) throw new Error('当前聊天不可用。')
        this.unwrap(
          await this.remote.eleckoiConversations.revealFile(conversationId, attachmentId, name),
          '无法在文件管理器中显示该文件。'
        )
      }

      async readTrajectory(conversationId) {
        if (!conversationId) throw new Error('请先打开一个聊天。')
        if (conversationId !== this.detailsSnapshot.id) await this.open(conversationId)
        await this.bindOfficialSession(conversationId)
        const binding = this.sessionReference?.binding
        if (!binding) throw new Error('当前聊天的 DSH Session 尚未就绪。')
        const target = this.uiConversation.binding(binding).target('trajectory')
        const snapshot = target.getSnapshot()
        if (!snapshot) throw new Error('DSH 轨迹投影尚未就绪。')
        return snapshot
      }

      async replaceAuthorVariableState(conversationId, state) {
        if (!conversationId) throw new Error('请先打开一个聊天。')
        const stateJson = JSON.stringify(state)
        const saved = this.unwrap(
          await this.remote.eleckoiConversations.replaceVariableState(conversationId, stateJson),
          '保存作者接口变量失败。'
        )
        if (this.timelineSnapshot.id === conversationId) void this.refreshTimeline().catch(() => {})
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
        const nextKey = streamSnapshotKey(nextStream)
        this.streamState = nextStream
        this.streamStateKey = nextKey
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
            variableStateJson: typeof message.variableStateJson === 'string' ? message.variableStateJson : '{}',
            status: message.status,
            createdAt: message.createdAt
          }))
      }

      applyDisplayProjection(next) {
        if (next.status !== 'ready' || !next.details || this.displayProjectionResults.size === 0) return next
        const input = this.displayProjectionInput(next.details.messages || [])
        const inputKeys = new Map(input.map(message => [message.id, JSON.stringify(message)]))
        let changed = false
        const messages = next.details.messages.map(message => {
          const cached = this.displayProjectionResults.get(message.id)
          const result = cached?.result
          if (!cached || cached.inputKey !== inputKeys.get(message.id)
            || !result || result.sourceContent !== message.content
            || typeof result.displayContent !== 'string'
            || typeof result.variableStateJson !== 'string') return message
          if (message.displayContent === result.displayContent
            && message.variableStateJson === result.variableStateJson) return message
          changed = true
          return { ...message, displayContent: result.displayContent, variableStateJson: result.variableStateJson }
        })
        return changed ? { ...next, details: { ...next.details, messages } } : next
      }

      scheduleDisplayProjection(id, details) {
        const projectDisplay = this.remote?.eleckoiConversations?.projectDisplay
        if (this.disposed || !id || typeof projectDisplay !== 'function') return null
        const input = this.displayProjectionInput(details.messages || [])
        const key = `${id}\u0000${JSON.stringify(input)}`
        if (key === this.displayProjectionKey) return this.displayProjectionPromise
        this.displayProjectionKey = key
        const generation = ++this.displayProjectionGeneration
        const operation = projectDisplay.call(this.remote.eleckoiConversations, id, input).then((response) => {
          const results = this.unwrap(response, '生成消息显示内容失败。')
          if (!Array.isArray(results)) throw new Error('消息显示投影返回的数据格式不正确。')
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
            projectedResults.set(message.id, { inputKey: JSON.stringify(message), result })
          }
          this.displayProjectionResults = projectedResults
          const projected = this.applyDisplayProjection(current)
          if (projected !== current) this.publishDetails(projected)
        }).catch((error) => {
          if (generation === this.displayProjectionGeneration) this.displayProjectionKey = ''
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
        const nextKey = streamSnapshotKey(next)
        if (nextKey === this.streamStateKey) return
        this.streamState = next
        this.streamStateKey = nextKey
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
            this.displayProjectionKey = ''
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
            void this.refresh().catch(() => {})
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
          void this.refreshDetails().catch(() => {})
          return
        }
        if (change.kind === 'snapshot' || change.kind === 'catalog') {
          const generation = this.generation + 1
          const selectedId = this.detailsSnapshot.id
          const timelineId = this.timelineSnapshot.id
          void this.refresh().then(items => {
            if (this.disposed || generation !== this.generation) return
            const available = new Set(items.map(item => item.id))
            if (selectedId && this.detailsSnapshot.id === selectedId) {
              if (available.has(selectedId)) void this.refreshDetails().catch(() => {})
              else if (!this.sessionMutations.has(selectedId)
                && !this.detailInvalidationFences.has(selectedId)) this.activate('')
            }
            if (timelineId && this.timelineSnapshot.id === timelineId) {
              if (available.has(timelineId)) void this.refreshTimeline().catch(() => {})
              else this.closeTimeline(timelineId)
            }
          }).catch(() => {})
          return
        }
        if (change.kind !== 'messages' || change.conversationId !== this.detailsSnapshot.id) return
        if (change.sessionRewritten === true && !this.sessionMutations.has(change.conversationId)) {
          void this.reloadCompatibilityProjection(change.conversationId).catch(error => {
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
          void this.refreshDetails().catch(() => {})
        }
      }

      restoreConnection() {
        void this.refresh().catch(() => {})
        if (this.detailsSnapshot.id) void this.refreshDetails().catch(() => {})
        if (this.timelineSnapshot.id) void this.refreshTimeline().catch(() => {})
        if (this.detailsSnapshot.id) void this.bindOfficialSession(this.detailsSnapshot.id).catch(() => {})
      }

      async refresh() {
        if (this.disposed) throw new Error('ElecKoi 会话目录已关闭。')
        const generation = ++this.generation
        try {
          const items = this.unwrap(
            await this.remote.eleckoiConversations.list(),
            '读取会话列表失败。'
          )
          if (!Array.isArray(items) || items.some(item => !item || typeof item.id !== 'string')) {
            throw new Error('会话目录返回的数据格式不正确。')
          }
          if (!this.disposed && generation === this.generation) {
            this.publish({ status: 'ready', items, error: '' })
            if (this.detailsSnapshot.id) void this.bindOfficialSession(this.detailsSnapshot.id).catch(() => {})
          }
          return items
        } catch (error) {
          if (!this.disposed && generation === this.generation) {
            this.publish({
              status: 'error',
              items: this.snapshot.items,
              error: error instanceof Error ? error.message : String(error)
            })
          }
          throw error
        }
      }

      async create(input) {
        if (this.disposed) throw new Error('DSH 聊天服务正在恢复，请稍后重试。')
        const value = this.unwrap(
          await this.remote.eleckoiConversations.create(input),
          '新建聊天失败。'
        )
        const conversationId = value?.conversation?.id
        if (typeof conversationId !== 'string' || !conversationId) throw new Error('新建聊天返回的数据格式不正确。')
        const details = this.assertDetails(value, conversationId)
        await Promise.all([this.refresh(), this.sessions.refresh()])
        return details
      }

      async delete(conversationId) {
        if (!conversationId) return
        if (this.detailsSnapshot.id === conversationId) this.activate('')
        this.unwrap(
          await this.remote.eleckoiConversations.delete(conversationId),
          '删除聊天失败。'
        )
        if (this.timelineSnapshot.id === conversationId) this.closeTimeline(conversationId)
        await Promise.all([this.refresh(), this.sessions.refresh()])
      }

      async selectOpening(conversationId, openingId) {
        if (!conversationId || !openingId) throw new Error('请选择要切换的开场白。')
        const details = this.assertDetails(this.unwrap(
          await this.remote.eleckoiConversations.selectOpening(conversationId, openingId),
          '切换开场白失败。'
        ), conversationId)
        this.acceptMutationDetails(conversationId, details)
        await this.refresh()
        return this.detailsSnapshot.id === conversationId ? this.refreshDetails() : details
      }

      async updateOpening(conversationId, content) {
        if (!conversationId) throw new Error('请先打开一个聊天。')
        const details = this.assertDetails(this.unwrap(
          await this.remote.eleckoiConversations.updateOpening(conversationId, content),
          '修改开场白失败。'
        ), conversationId)
        this.acceptMutationDetails(conversationId, details)
        await this.refresh()
        return this.detailsSnapshot.id === conversationId ? this.refreshDetails() : details
      }

      async editMessage(conversationId, eventSeq, role, content) {
        if (!this.sessions || !this.uiConversation) throw new Error('DSH 会话客户端尚未就绪。')
        await this.mutateSession(conversationId, async () => this.unwrap(
          await this.remote.eleckoiConversations.editMessage(conversationId, eventSeq, role, content),
          '修改消息失败。'
        ))
        await this.sessions.refresh()
        await this.bindOfficialSession(conversationId)
        await this.refreshDetails()
        return this.detailsSnapshot.details
      }

      async reloadCompatibilityProjection(conversationId) {
        if (this.disposed || this.detailsSnapshot.id !== conversationId) return
        const runtimeSessionId = this.sessionReference?.sessionId || this.runtimeSessionId(conversationId) || this.detailsSnapshot.runtimeSessionId
        this.releaseOfficialSession()
        this.invalidateDetails(conversationId)
        if (runtimeSessionId && this.sessions) await this.sessions.reloadHistory(runtimeSessionId)
        await this.bindOfficialSession(conversationId, runtimeSessionId)
        return this.refreshDetails()
      }

      async mutateCompatibilityTimeline(conversationId, operation) {
        if (!conversationId || typeof operation !== 'function') throw new Error('修改消息需要绑定的会话和实际操作。')
        if (this.detailsSnapshot.id !== conversationId) {
          const result = await operation()
          const runtimeSessionId = this.runtimeSessionId(conversationId)
          if (runtimeSessionId && this.sessions) await this.sessions.reloadHistory(runtimeSessionId)
          return result
        }
        const result = await this.mutateSession(conversationId, operation)
        await this.sessions.refresh()
        await this.bindOfficialSession(conversationId)
        await this.refreshDetails()
        return result
      }

      async deleteMessagesFrom(conversationId, eventSeq, role) {
        if (!this.sessions || !this.uiConversation) throw new Error('DSH 会话客户端尚未就绪。')
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
          messages: chat ? officialMessages(chat, { ...details, hasMore }, runtimeSessionId, this.officialProcess(chat), [], sessionRunning, this.inputContinuations(runtimeSessionId), this.abortedTurns(runtimeSessionId))
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
          void this.bindOfficialSession(id).catch(() => {})
        }
      }

      runtimeSessionId(id) {
        return this.snapshot.items.find(item => item.id === id)?.runtimeSessionId || ''
      }

      releaseOfficialSession() {
        this.displayProjectionGeneration += 1
        this.displayProjectionKey = ''
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
        this.releaseSubagentSessions()
        this.sessionTarget = null
        this.officialProjectionSignature = null
        this.sessionReference?.release()
        this.sessionReference = null
      }

      releaseSubagentSessions() {
        for (const child of this.subagentSessions.values()) {
          this.disposeSubagentSession(child)
        }
        this.subagentSessions.clear()
        this.subagentCatalog = []
        this.subagentProjectionRevision += 1
      }

      disposeSubagentSession(child) {
        if (!child || child.released) return
        child.released = true
        child.stopTarget?.()
        child.stopSession?.()
        child.reference?.release()
      }

      officialProcess(chat) {
        return officialProcessWithSubagents(chat, this.subagentCatalog, this.subagentSessions)
      }

      inputContinuations(runtimeSessionId) {
        const reference = this.sessionReference
        if (reference?.sessionId !== runtimeSessionId) return []
        const value = reference.binding.session.projections?.faceOf('eleckoiInputContinuations')?.getSnapshot()
        return Array.isArray(value?.links) ? value.links : []
      }

      abortedTurns(runtimeSessionId) {
        const reference = this.sessionReference
        if (reference?.sessionId !== runtimeSessionId) return []
        const value = reference.binding.session.projections?.faceOf('eleckoiTurnOutcomes')?.getSnapshot()
        return Array.isArray(value?.abortedTurns) ? value.abortedTurns : []
      }

      subagentCatalogEntries(runtimeSessionId, face) {
        const direct = face?.getSnapshot()
        const listed = this.sessions.list.getSnapshot()?.projectionsBySession?.[runtimeSessionId]
          ?.values?.subagentCatalog
        // A reopened parent can receive its durable catalog through the Session
        // list before the retained Session face hydrates. Do not treat that
        // temporary empty face as an authoritative empty catalog.
        if (Array.isArray(direct) && direct.length > 0) return direct
        if (Array.isArray(listed)) return listed
        return Array.isArray(direct) ? direct : []
      }

      reconcileSubagentSessions(id, runtimeSessionId, binding, target, entries, generation) {
        const catalog = Array.isArray(entries) ? entries.filter(entry => entry?.id) : []
        const nextIds = new Set(catalog.map(entry => entry.id))
        let changed = catalog.length !== this.subagentCatalog.length
          || catalog.some((entry, index) => entry.id !== this.subagentCatalog[index]?.id
            || entry.mode !== this.subagentCatalog[index]?.mode)
        this.subagentCatalog = catalog
        for (const [childId, child] of this.subagentSessions) {
          if (nextIds.has(childId)) continue
          this.disposeSubagentSession(child)
          this.subagentSessions.delete(childId)
          changed = true
        }
        for (const entry of catalog) {
          const existing = this.subagentSessions.get(entry.id)
          if (existing) {
            existing.entry = entry
            continue
          }
          changed = true
          // Retain the durable direct-parent address published by DSH. This is
          // the same official read path used by the upstream subagent sidebar;
          // no Session log layout or private child transport is reconstructed.
          const address = { parentSessionId: runtimeSessionId, childSessionId: entry.id, mode: entry.mode }
          const reference = this.sessions.retain(address, { source: 'mainView' })
          const child = { entry, reference, target: null, stopTarget: () => {}, stopSession: () => {}, released: false }
          this.subagentSessions.set(entry.id, child)
          void reference.ready.then(childBinding => {
            if (this.disposed || generation !== this.sessionBindingGeneration || id !== this.detailsSnapshot.id
              || this.subagentSessions.get(entry.id) !== child) {
              this.disposeSubagentSession(child)
              return
            }
            child.target = this.uiConversation.binding(childBinding).target('chat')
            const publish = () => {
              if (this.disposed || generation !== this.sessionBindingGeneration || id !== this.detailsSnapshot.id) return
              this.subagentProjectionRevision += 1
              this.acceptOfficialSession(id, runtimeSessionId, binding.session, target)
            }
            child.stopTarget = child.target.subscribe(publish)
            child.stopSession = childBinding.session.subscribe(publish)
            publish()
          }).catch(error => {
            if (this.subagentSessions.get(entry.id) === child) this.subagentSessions.delete(entry.id)
            this.disposeSubagentSession(child)
            console.error(`读取子 Agent 会话 ${entry.id} 失败：`, error)
          })
        }
        if (changed) this.subagentProjectionRevision += 1
      }

      createOfficialProjectionSignature(chat, runtimeSessionId, hasMore, pendingSubmissions = [], sessionRunning) {
        const nodes = orderedChatNodes(chat)
        return {
          runtimeSessionId,
          hasMore,
          subagentProjectionRevision: this.subagentProjectionRevision,
          inputContinuationsKey: JSON.stringify(this.inputContinuations(runtimeSessionId)),
          abortedTurnsKey: JSON.stringify(this.abortedTurns(runtimeSessionId)),
          canChangeOpening: this.openingChangeAllowed(this.detailsSnapshot.id, runtimeSessionId),
          sessionRunning,
          pendingSubmissions,
          nodes: nodes.filter(node => node.kind === 'user' || node.kind === 'steering'
            || node.kind === 'turn-tail'
            || node.kind === 'assistant-step' || node.kind === 'tool-call')
        }
      }

      sameOfficialProjection(left, right) {
        return left?.runtimeSessionId === right?.runtimeSessionId
          && left?.hasMore === right?.hasMore
          && left?.subagentProjectionRevision === right?.subagentProjectionRevision
          && left?.inputContinuationsKey === right?.inputContinuationsKey
          && left?.abortedTurnsKey === right?.abortedTurnsKey
          && left?.canChangeOpening === right?.canChangeOpening
          && left?.sessionRunning === right?.sessionRunning
          && left?.pendingSubmissions?.length === right?.pendingSubmissions?.length
          && left.pendingSubmissions.every((submission, index) => submission === right.pendingSubmissions[index])
          && left?.nodes?.length === right?.nodes?.length
          && left.nodes.every((node, index) => node === right.nodes[index])
      }

      async mutateSession(conversationId, operation) {
        if (this.sessionMutations.has(conversationId)) throw new Error('当前聊天正在修改消息。')
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
          timeout = setTimeout(() => reject(new Error('等待 DSH 会话关闭通知超时。')), 15_000)
          check()
        }) : Promise.resolve()
        void retired.catch(() => {})
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
          if (runtimeSessionId) await this.sessions.reloadHistory(runtimeSessionId).catch(() => {})
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
          reference = this.sessions.retain(runtimeSessionId, { source: 'mainView' })
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
          const publish = () => {
            if (generation !== this.sessionBindingGeneration || this.sessionReference !== reference || this.sessionTarget !== target) return
            this.acceptOfficialSession(id, runtimeSessionId, binding.session, target)
          }
          this.stopSessionTarget = target.subscribe(publish)
          this.stopSessionState = binding.session.subscribe(publish)
          const projections = ['sessionStats', 'tokenUsage', 'contextPressure', 'contextBreakdown', 'eleckoiHistoryStatsAdjustment']
            .map(key => [key, binding.session.projections?.faceOf(key)])
          const subagentCatalogFace = binding.session.projections?.faceOf('subagentCatalog')
          const inputContinuationsFace = binding.session.projections?.faceOf('eleckoiInputContinuations')
          const turnOutcomesFace = binding.session.projections?.faceOf('eleckoiTurnOutcomes')
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
          let publishingSubagents = false
          let pendingSubagentPublish = false
          const publishSubagents = () => {
            if (this.disposed || generation !== this.sessionBindingGeneration || id !== this.detailsSnapshot.id) return
            if (publishingSubagents) {
              pendingSubagentPublish = true
              return
            }
            do {
              pendingSubagentPublish = false
              publishingSubagents = true
              try {
                this.reconcileSubagentSessions(id, runtimeSessionId, binding, target,
                  this.subagentCatalogEntries(runtimeSessionId, subagentCatalogFace), generation)
                this.acceptOfficialSession(id, runtimeSessionId, binding.session, target)
              } finally {
                publishingSubagents = false
              }
            } while (pendingSubagentPublish
              && !this.disposed
              && generation === this.sessionBindingGeneration
              && id === this.detailsSnapshot.id)
          }
          const stops = [
            ...projections.map(([, face]) => face?.subscribe(publishProjections)),
            subagentCatalogFace?.subscribe(publishSubagents),
            inputContinuationsFace?.subscribe(() => { publishProjections(); publish() }),
            turnOutcomesFace?.subscribe(publish),
            inboxFace?.subscribe(publish),
            this.sessions.list.subscribe?.(publishSubagents),
          ].filter(Boolean)
          this.stopProjections = () => { for (const stop of stops) stop() }
          publishProjections()
          publishSubagents()
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
        const details = this.detailsSnapshot.details
        const processByTurn = this.officialProcess(chat)
        let pendingDetails = null
        if (details) {
          const hasMore = Boolean(this.sessionReference?.binding.eventSource.getSnapshot().hasMore)
          const pendingSubmissions = sessionState.pendingSubmissions || []
          const sessionRunning = sessionState.running === true
          const signature = this.createOfficialProjectionSignature(chat, runtimeSessionId, hasMore, pendingSubmissions, sessionRunning)
          if (!this.sameOfficialProjection(signature, this.officialProjectionSignature)) {
            const next = {
              ...details, runtimeSessionId,
              messages: officialMessages(chat, { ...details, hasMore }, runtimeSessionId, processByTurn, pendingSubmissions, sessionRunning, this.inputContinuations(runtimeSessionId), this.abortedTurns(runtimeSessionId)),
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
          ...orderedChatNodes(chat).filter(node => node.kind === 'turn-tail' && node.data?.closing).map(nodeTurn),
          ...(this.sessionReference?.binding.eventSource.getSnapshot().entries || [])
            .filter(entry => entry.type === 'event' && entry.event.type === 'turn/end'
              && ['aborted', 'interrupted'].includes(entry.event.data?.reason?.kind))
            .map(entry => entry.event.data.turn),
        ])
        const previousTurn = this.streamState.status === 'running' && !retiredTurns.has(this.streamState.dshTurn)
          ? this.streamState.dshTurn : undefined
        const liveTurn = [...(chat?.timeline?.turns?.values() || [])]
          .findLast(turn => turn.status === 'open' && !retiredTurns.has(turn.turn))?.turn
          ?? previousTurn
        const runningAssistant = orderedChatNodes(chat)
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
        const projectedReply = liveFinalReply(assistantText(runningAssistant?.data?.blocks))
        const content = projectedReply.started ? projectedReply.content
          : !runningAssistant && sameLiveTurn ? current.content : ''
        const promptError = sessionState.promptError?.op === 'send'
          ? sessionState.promptError.error?.message || '生成失败。'
          : ''
        const terminalFailure = orderedChatNodes(chat).findLast(node => node.kind === 'turn-error' && nodeTurn(node) === openTurn)
        const executionError = promptError || sessionState.lastAgentError || terminalFailure?.data?.message || sessionState.openError?.message
          || (sessionState.removed ? 'DSH 会话已关闭。' : '')
        const cancellationSettling = this.cancelledStreamConversations.has(id)
        // DSH publishes the turn-tail as soon as `turn/end` is observed. Its
        // `closing` assistant can be populated on the following projection
        // pass, so the presence of the tail alone is not a hand-off point.
        // Dropping the live row at that boundary made a one-turn chat go
        // blank for one render before the final assistant node arrived.
        const turnTail = sameLiveTurn && Number.isSafeInteger(current.dshTurn)
          ? orderedChatNodes(chat).find(node => node.kind === 'turn-tail' && node.data?.turn === current.dshTurn)
          : null
        // The official Session event stream is the authority for why a turn
        // ended.  An aborted/interrupted turn has no closing assistant node,
        // so it must not enter the normal delayed-final hand-off path below.
        // That path is intentionally retained for a normally completed turn
        // whose final assistant projection arrives one pass later.
        const endedTurnReason = sameLiveTurn && Number.isSafeInteger(current.dshTurn)
          ? (this.sessionReference?.binding.eventSource.getSnapshot().entries || [])
            .filter(entry => entry.type === 'event')
            .map(entry => entry.event)
            .findLast(event => event.type === 'turn/end' && event.data?.turn === current.dshTurn)
            ?.data?.reason?.kind
          : undefined
        const interruptedTurn = endedTurnReason === 'aborted' || endedTurnReason === 'interrupted'
        const pendingFinal = sameLiveTurn && Boolean(pendingDetails?.snapshot?.details?.messages?.some(message =>
          message.role === 'assistant'
          && message.dshTurn === current.dshTurn
          && message.status === 'complete'
          && Number.isSafeInteger(message.sessionEventSeq)
          && String(message.content || '').length > 0))
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
          if (!result?.ok) throw new Error(result?.error?.message || '停止生成失败。')
        }
        return true
      }

      async send(input) {
        if (this.disposed || !input?.conversationId || !input.requestId) throw new Error('无法开始这次回复。')
        if (!this.sessions || !this.uiConversation || !this.remote?.session) {
          throw new Error('DSH 会话客户端尚未就绪。')
        }
        return this.runRequest(input, request => this.runOfficialPrompt(input, request))
      }

      async prepareNativeInput(input) {
        if (input?.signal?.aborted) {
          const error = new Error('生成请求已取消。')
          error.name = 'AbortError'
          throw error
        }
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
        if (this.disposed || !input?.conversationId || !input.requestId) throw new Error('无法重新生成这次回复。')
        if (!this.sessions || !this.uiConversation || !this.remote?.session) {
          throw new Error('DSH 会话客户端尚未就绪。')
        }
        return this.runRequest(input, request => this.runOfficialRegeneration(input, request))
      }

      primeRewindRequest(input, request) {
        if (!Number.isSafeInteger(input?.eventSeq)) return
        request.rewindEventSeq = input.eventSeq
      }

      async runRequest(input, run) {
        if (this.activeRequests.has(input.conversationId)) throw new Error('当前聊天正在生成。')
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
          if (this.detailsSnapshot.id === input.conversationId) this.publishDetails(this.detailsSnapshot, this.officialProjectionSignature)
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
        if (!runtimeSessionId) throw new Error('当前聊天缺少 DSH Session。')
        const prepared = await this.unwrap(
          await this.remote.eleckoiConversations.preparePrompt(conversationId, input.text || '', input.signal),
          '准备 DSH 会话失败。'
        )
        if (!this.sessionReference || this.sessionReference.sessionId !== runtimeSessionId) {
          await this.bindOfficialSession(conversationId)
        }
        const session = this.sessionReference?.binding.session
        if (!session) throw new Error('当前聊天的 DSH Session 尚未连接。')
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
        if (!accepted?.ok) throw new Error(accepted?.error?.message || '生成请求失败。')
        if (request.cancelled || input.signal?.aborted) this.unwrap(await session.cancel(), '停止生成失败。')
        const completed = await waitForOfficialSession(session, this.sessionReference.binding.eventSource, input.requestId)
        if (prepared.operationId) {
          this.unwrap(await this.remote.eleckoiConversations.waitForGeneration(conversationId, prepared.operationId), '等待聊天保存失败。')
        }
        if (this.detailsSnapshot.id === conversationId && this.detailsSnapshot.details?.compatibilityPresentation?.groupId) {
          const group = this.unwrap(await this.remote.eleckoiConversations.completeGroupRound(conversationId, completed.cancelled || request.cancelled), '群聊回合执行失败。')
          completed.cancelled ||= group.cancelled
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
        if (this.disposed) throw new Error('ElecKoi 会话目录已关闭。')
        if (!conversationId) throw new Error('请先打开一个聊天。')
        if (!file || typeof file.name !== 'string') throw new Error('请选择有效文件。')
        if (!this.fileUpload) throw new Error('DSH 文件上传服务尚未就绪。')
        if (this.detailsSnapshot.id !== conversationId) await this.open(conversationId)
        const runtimeSessionId = this.runtimeSessionId(conversationId)
          || (this.detailsSnapshot.id === conversationId ? this.detailsSnapshot.runtimeSessionId : '')
          || (this.detailsSnapshot.id === conversationId ? this.detailsSnapshot.details?.runtimeSessionId : '')
        if (!runtimeSessionId) throw new Error('当前聊天缺少 DSH Session。')
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
          throw new Error('DSH 文件上传服务返回的数据格式不正确。')
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
        if (!Number.isSafeInteger(input.eventSeq)) throw new Error('找不到这条输入对应的 DSH 消息。')
        request.statsPending = this.statsSnapshot.id === input.conversationId && Boolean(this.statsSnapshot.stats)
        this.primeRewindRequest(input, request)
        this.detailGeneration += 1
        this.displayProjectionGeneration += 1
        this.displayProjectionKey = ''
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
          })().catch(() => {})
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
        if (!session || prepared.prepared !== true) throw new Error('重新生成请求未完成 DSH Session 回退。')
        request.session = session
        const cancelled = request.cancelled || input.signal?.aborted === true
        const accepted = this.unwrap(
          await this.remote.eleckoiConversations.startRegeneration(input.conversationId, input.requestId, cancelled),
          '重新生成请求失败。'
        )
        if (cancelled) return { details: await this.refreshDetails(), cancelled: true }
        if (accepted.accepted !== true) throw new Error('重新生成请求未被 DSH Session 接受。')
        if (!Number.isSafeInteger(accepted.turn) || accepted.turn < 1) throw new Error('重新生成请求缺少 DSH 执行轮次。')
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
        void this.refreshDetails().catch(() => {})
      }

      assertDetails(value, id) {
        if (!value || value.conversation?.id !== id || !Array.isArray(value.messages)
          || value.messages.some(message => !message || typeof message.id !== 'string')) {
          throw new Error('会话详情返回的数据格式不正确。')
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
        if (this.disposed || !id) throw new Error('ElecKoi 当前会话不可用。')
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
            throw new Error('DSH 聊天正文尚未加载。')
          }
          const hasMore = chat ? Boolean(this.sessionReference.binding.eventSource.getSnapshot().hasMore) : details.hasMore
          const session = this.sessionReference?.binding?.session
          const sessionRunning = session ? session.getSnapshot().running === true : undefined
          const projected = chat
            ? { ...details, runtimeSessionId, hasMore,
              messages: officialMessages(chat, { ...details, hasMore }, runtimeSessionId, this.officialProcess(chat), [], sessionRunning, this.inputContinuations(runtimeSessionId), this.abortedTurns(runtimeSessionId)) }
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
              error: error instanceof Error ? error.message : String(error)
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
          throw new Error('更早消息返回的数据格式不正确。')
        }
        const latest = this.detailsSnapshot
        if (this.disposed || latest.id !== id || bindingGeneration !== this.sessionBindingGeneration
          || (!session && latest.details?.beforeSequence !== beforeSequence)) return null
        const chat = this.sessionTarget?.getSnapshot()
        if (chat) {
          const metadata = { ...latest.details, messages: [...page.messages, ...latest.details.messages] }
          const hasMore = Boolean(this.sessionReference.binding.eventSource.getSnapshot().hasMore)
          const sessionRunning = session ? session.getSnapshot().running === true : undefined
          const messages = officialMessages(chat, { ...metadata, hasMore }, latest.runtimeSessionId, this.officialProcess(chat), [], sessionRunning, this.inputContinuations(latest.runtimeSessionId), this.abortedTurns(latest.runtimeSessionId))
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
        if (this.disposed) throw new Error('DSH 聊天服务已关闭。')
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
        if (this.disposed) throw new Error('DSH 聊天服务已关闭。')
        return this.unwrap(await this.remote.eleckoiConversations.requestPreview(id, requestId, signal), '请求上下文预览读取失败。')
      }

      async refreshTimeline() {
        const id = this.timelineSnapshot.id
        if (this.disposed || !id) throw new Error('ElecKoi 当前变量时间线不可用。')
        const generation = ++this.timelineGeneration
        try {
          const timeline = this.unwrap(
            await this.remote.eleckoiConversations.variableTimeline(id),
            '读取变量时间线失败。'
          )
          if (!timeline || !Array.isArray(timeline.floors)
            || timeline.floors.some(floor => !floor || typeof floor.id !== 'string')) {
            throw new Error('变量时间线返回的数据格式不正确。')
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
              error: error instanceof Error ? error.message : String(error)
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
        this.statsListeners.clear()
      }
    }

    function apply(ctx) {
      const catalog = new ConversationCatalog(ctx.remote, ctx.sessions, ctx.uiConversation, ctx.fileUpload, ctx.eleckoiRegexRules)
      ctx.provide('eleckoiConversations', catalog)
      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'messages', registrant: '@eleckoi/dsh-client-conversations' },
        () => React.createElement(MessagesPage)))
      const NavigationIcon = React.lazy(() => import('dsh-app://app/eleckoi/assets/eleckoi-page-messages.js')
        .then(module => ({ default: module.NavigationIcon })))
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist', id: 'messages', order: -40, label: '消息', registrant: '@eleckoi/dsh-client-conversations'
      }, () => React.createElement(NavigationIcon)))
      ctx.effect(() => {
        catalog.start()
        const stopReset = ctx.on('connection/reset', () => catalog.restoreConnection())
        return () => {
          stopReset()
          catalog.dispose()
        }
      }, 'eleckoi: conversation catalog')
    }

    return { inject: ['slots', 'sessions', 'uiConversation', 'fileUpload', 'eleckoiRegexRules', 'remote', 'remote.settings', 'remote.session', 'remote.eleckoiConversationModels', 'remote.eleckoiConversations'], apply }
  }
})
