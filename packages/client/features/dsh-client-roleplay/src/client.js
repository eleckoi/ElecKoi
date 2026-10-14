window.__ModuleLoader__.load({
  id: '@eleckoi/dsh-client-roleplay',
  factory(require) {
    const React = require('react')

    // User-event identities define chat rounds; execution Turn IDs remain untouched.
    function createInputRoundIndex(identities) {
      if (!Array.isArray(identities?.inputs)) return undefined
      const inputs = new Map()
      const turns = new Map()
      for (const input of [...identities.inputs].sort((a, b) => a.eventSeq - b.eventSeq)) {
        if (inputs.has(input.eventSeq)) continue
        const indexed = { ...input, round: inputs.size + 1 }
        inputs.set(input.eventSeq, indexed)
        if (input.turn > 0) turns.set(input.turn, indexed)
      }
      for (const link of identities.links ?? []) {
        const input = inputs.get(link.inputEventSeq)
        if (input?.messageId === link.inputMessageId) turns.set(link.turn, input)
      }
      return { inputs, turns }
    }

    function presentChatTurnNavigation(navigation, index) {
      if (!index) return navigation
      const rounds = new Map()
      for (const item of navigation.items) {
        const input = index.turns.get(item.turn)
        if (!input) continue
        const previous = rounds.get(input.round)
        // The original input Turn remains the official jump target. A newer
        // execution supplies its preview, not another mark or a replacement anchor.
        const target = !previous || item.turn === input.turn || item.turn < previous.target.turn
          ? item : previous.target
        const latest = !previous || item.turn > previous.latest.turn ? item : previous.latest
        rounds.set(input.round, { target, latest, prompt: item.turn === input.turn
          ? item.prompt : previous?.prompt || item.prompt })
      }
      const targetTurn = turn => {
        const input = index.turns.get(turn)
        return input ? rounds.get(input.round)?.target.turn ?? null : null
      }
      return {
        items: [...rounds.entries()].sort(([a], [b]) => a - b).map(([round, group]) => ({
          ...group.target, labelTurn: round, prompt: group.prompt || '', response: group.latest.response,
        })),
        activeTurn: targetTurn(navigation.activeTurn), busyTurn: targetTurn(navigation.busyTurn),
      }
    }

    function adaptChatSessionStats(value, adjustment, index) {
      if (!value || typeof value !== 'object') return value
      return {
        ...value,
        steps: Math.max(0, value.steps - (Number(adjustment?.steps) || 0)),
        turns: index ? index.inputs.size : Math.max(0, value.turns - (Number(adjustment?.turns) || 0)),
      }
    }
    const bridgedChatChildren = Object.freeze({
      'conversation.chat.node': 'eleckoi.roleplay.chat.node',
      'conversation.message.images': 'eleckoi.roleplay.chat.images',
      'conversation.chat.before': 'eleckoi.roleplay.chat.before',
      'conversation.chat.pending-input': 'eleckoi.roleplay.chat.pending-input'
    })
    const bridgedComposerChildren = Object.freeze({
      'conversation.approval.detail': 'eleckoi.roleplay.conversation.approval.detail',
      'conversation.plan-review.actions': 'eleckoi.roleplay.conversation.plan-review.actions',
      'conversation.input.attachments': 'eleckoi.roleplay.conversation.input.attachments',
      'conversation.input.overlay': 'eleckoi.roleplay.conversation.input.overlay',
      'conversation.input.permission': 'eleckoi.roleplay.conversation.input.permission',
      'conversation.input.left': 'eleckoi.roleplay.conversation.input.left',
      'conversation.input.plan': 'eleckoi.roleplay.conversation.input.plan',
      'conversation.input.right': 'eleckoi.roleplay.conversation.input.right',
      'conversation.input.model': 'eleckoi.roleplay.conversation.input.model',
      'conversation.input.activity': 'eleckoi.roleplay.conversation.input.activity',
      'conversation.composer.dock': 'eleckoi.roleplay.conversation.composer.dock'
    })
    // A projected parent owns separate child declarations; components keep
    // using their declared names and the same list entry identities.
    const viewSeatName = name => name === 'conversation.view'
      ? 'eleckoi.roleplay.session.view' : `eleckoi.roleplay.view.${name}`

    function RoleplaySessionView({
      matched, sessionId, useSession, useSessionStatus, useInput, renderSlot, renderSlotChain
    }) {
      const session = useSession(snapshot => snapshot)
      const input = useInput(snapshot => snapshot)
      const pendingInteraction = useSessionStatus(snapshot => snapshot.get(sessionId)?.pendingInteraction)
      const renderRoleplayMessage = React.useCallback((owner, content) => renderSlotChain(
        'eleckoi.roleplay.message.content', owner, {
          fallback: content
        }
      ), [renderSlotChain])
      const props = {
        ...matched.props,
        renderRoleplaySlot: renderSlot,
        renderRoleplaySlotChain: renderSlotChain,
        renderRoleplayMessage,
        dshComposerOwner: { sessionId, session, pendingInteraction },
        dshInputZone: { session, input }
      }
      return renderSlot('eleckoi.roleplay.session.header', {
        matched: { ...matched, props }
      }, { fallback: React.createElement(matched.component, props) })
    }

    function RoleplayConversationHeader({ matched, useConversationViews, useStore, selectView }) {
      const tabs = useConversationViews(value => value)
      const selectedId = useStore(state => state.view)
      const active = tabs.find(tab => tab.id === selectedId) ?? tabs.find(tab => tab.id === 'chat')
      return matched.props.renderRoleplaySlot('eleckoi.roleplay.session.body', {
        matched,
        navigation: { tabs, activeView: active?.id, selectView }
      }, { fallback: React.createElement(matched.component, matched.props) })
    }

    function RoleplayConversationBody({ matched, navigation, useInspectCall, useStore, actions, openView, renderSlot }) {
      const inspectCall = useInspectCall(value => value)
      const viewRequest = useStore(state => state.viewRequest ?? null)
      const viewOwner = { inspectCall, viewRequest, openView, completeViewRequest: actions.completeViewRequest }
      return React.createElement(matched.component, {
        ...matched.props,
        dshConversation: {
          ...navigation,
          viewOwner,
          renderView: (id, owner = {}) => renderSlot(viewSeatName('conversation.view'), { ...viewOwner, ...owner }, { only: id })
        }
      })
    }

    function RoleplayView({ matched, sessions, SessionProvider, renderSlot }) {
      const runtimeSessionId = matched.props.runtimeSessionId
      const [reference, setReference] = React.useState(null)
      React.useEffect(() => {
        if (!runtimeSessionId) {
          setReference(null)
          return undefined
        }
        let current = true
        let retained
        let retryTimer
        let opening = false
        let attempts = 0
        let cancelReady = () => {}
        const waitUntilReady = reference => new Promise((resolve, reject) => {
          let settled = false
          let timer
          const settle = error => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            cancelReady = () => {}
            if (error) reject(error)
            else resolve()
          }
          timer = setTimeout(() => settle(new Error('DSH Session did not become ready')), 10000)
          cancelReady = () => settle(new Error('DSH Session binding closed'))
          Promise.resolve(reference.ready).then(() => settle(), settle)
        })
        const scheduleRetry = () => {
          if (!current || retryTimer !== undefined) return
          const delay = Math.min(250 * (2 ** Math.min(attempts, 4)), 4000)
          retryTimer = setTimeout(() => {
            retryTimer = undefined
            void open()
          }, delay)
        }
        const open = async () => {
          if (!current || opening || retained) return
          opening = true
          try {
            if (!sessions.list.getSnapshot().byId[runtimeSessionId]) await sessions.refresh()
            if (!current) return
            const reference = sessions.retain(runtimeSessionId, { source: 'mainView' })
            retained = reference
            await waitUntilReady(reference)
            if (!current) return
            attempts = 0
            setReference(reference)
          } catch {
            retained?.release()
            retained = undefined
            if (current) {
              setReference(null)
              attempts += 1
            }
          } finally {
            opening = false
            if (current && !retained) scheduleRetry()
          }
        }
        void open()
        return () => {
          current = false
          if (retryTimer !== undefined) clearTimeout(retryTimer)
          cancelReady()
          retained?.release()
          retained = undefined
        }
      }, [runtimeSessionId, sessions])
      const active = Boolean(runtimeSessionId) && reference?.sessionId === runtimeSessionId
      const view = React.createElement(matched.component, {
        ...matched.props,
        renderRoleplaySlot: undefined,
        renderRoleplaySlotChain: undefined,
        renderRoleplayMessage: undefined,
        dshConversation: undefined,
        dshComposerOwner: undefined,
        dshInputZone: undefined
      })
      if (!active) return view
      const scopedView = renderSlot('eleckoi.roleplay.session', { matched }, { fallback: view })
      return React.createElement(SessionProvider, { session: reference }, scopedView)
    }

    return {
      inject: ['slots', 'sessions', 'eleckoiConversations'],
      apply(ctx) {
        const retainedStatsKeys = new Set(['sessionStats', 'tokenUsage', 'contextPressure', 'contextBreakdown'])
        function useDisplayStats(ownerProps) {
          const conversations = ctx.eleckoiConversations
          const details = React.useSyncExternalStore(conversations.subscribeDetails, conversations.getDetailsSnapshot)
          const snapshot = React.useSyncExternalStore(conversations.subscribeStats, conversations.getStatsSnapshot)
          const stats = ownerProps.sessionId === details.runtimeSessionId && snapshot.id === details.id
            ? snapshot.stats : null
          return { stats, useProjection: (key, selector, equal) => {
            const value = ownerProps.useProjection(key, selector, equal)
            const selected = React.useRef({ value, key })
            // The conversation owns the hand-off across a writer rewind.
            // A projection hook belongs to only one Session binding generation.
            const next = stats && retainedStatsKeys.has(key)
              ? typeof selector === 'function' ? selector(stats[key]) : stats[key]
              : value
            if (selected.current.key !== key || !(equal || Object.is)(selected.current.value, next)) {
              selected.current = { value: next, key }
            }
            return selected.current.value
          } }
        }
        const projectedViewChildren = new Set()
        const projectConversationSeat = (source, target, options = {}) => {
          ctx.slots.inject(target, () => {
            const projected = new Map()
            const adapt = entry => function ConversationSeatEntry(ownerProps) {
              if (options.component) return React.createElement(options.component, ownerProps)
              if (options.bridgeChildren) return React.createElement(entry.component, {
                ...ownerProps,
                renderSlot: (name, owner, renderOptions) => ownerProps.renderSlot(viewSeatName(name), owner, renderOptions),
                renderSlotChain: (name, owner, renderOptions) => ownerProps.renderSlotChain(viewSeatName(name), owner, renderOptions),
              })
              if (source === 'conversation.composer.dock' && entry.options.id === 'stats') {
                const display = useDisplayStats(ownerProps)
                const adjustment = ownerProps.useProjection('eleckoiHistoryStatsAdjustment')
                const identities = ownerProps.useProjection('eleckoiInputContinuations')
                const roundIndex = React.useMemo(() => createInputRoundIndex(identities), [identities])
                if (ownerProps.generationStatsEnabled === false) return null
                const useProjection = (key, selector, equal) => {
                  if (key !== 'sessionStats' || display.stats) return display.useProjection(key, selector, equal)
                  return display.useProjection(key, value => {
                    const adapted = adaptChatSessionStats(value, adjustment, roundIndex)
                    return typeof selector === 'function' ? selector(adapted) : adapted
                  }, equal)
                }
                return React.createElement(entry.component, { ...ownerProps, useProjection })
              }
              if (source === 'conversation.composer' || source === 'conversation.composer.bar') {
                const display = useDisplayStats(ownerProps)
                const { renderBridgeSlot, auxiliaryGenerating, onStopAuxiliary, ...props } = ownerProps
                const renderSlot = (name, owner, renderOptions) => {
                  const bridged = bridgedComposerChildren[name]
                  return bridged && renderBridgeSlot
                    ? renderBridgeSlot(bridged, owner, renderOptions)
                    : null
                }
                const useSession = auxiliaryGenerating ? (selector, equal) => props.useSession(session => selector({ ...session, running: true }), equal) : props.useSession
                return React.createElement(entry.component, { ...props, useSession,
                  ...(auxiliaryGenerating ? { stop: onStopAuxiliary } : {}), useProjection: display.useProjection, renderSlot })
              }
              if (source !== 'conversation.view') return React.createElement(entry.component, ownerProps)
              if (options.entryId === 'chat') {
                const { renderChatNode, renderPendingInput, before, ...props } = ownerProps
                const identities = props.useProjection('eleckoiInputContinuations')
                const roundIndex = React.useMemo(() => createInputRoundIndex(identities), [identities])
                const presentTurnNavigation = React.useCallback(navigation => presentChatTurnNavigation(navigation, roundIndex), [roundIndex])
                const renderSlot = React.useCallback((name, owner, renderOptions) => {
                  if (name === 'conversation.chat.before') return props.renderSlot(bridgedChatChildren[name], owner, {
                    ...renderOptions, fallback: before ?? null
                  })
                  if (name === 'conversation.chat.pending-input' && renderPendingInput) return props.renderSlot(bridgedChatChildren[name], owner, {
                    ...renderOptions, fallback: renderPendingInput(owner)
                  })
                  if (name === 'conversation.chat.node' && renderChatNode) {
                    const rendered = renderChatNode(owner)
                    if (rendered !== undefined) return rendered
                  }
                  return props.renderSlot(bridgedChatChildren[name] || name, owner, renderOptions)
                }, [props.renderSlot, before, renderChatNode, renderPendingInput])
                // Roleplay owns process disclosure in its trajectory dialog.
                // Keep the actual Turn seat visible throughout its lifecycle.
                const usePresentation = React.useCallback(selector => props.usePresentation(policy => selector({
                  ...policy, foldCompletedTurns: false, stepGrouping: 'expanded'
                })), [props.usePresentation])
                return React.createElement(entry.component, { ...props, renderSlot, usePresentation, presentTurnNavigation })
              }
              const { component, ...props } = ownerProps
              const renderSlot = (name, owner) => name === 'conversation.trajectory.images'
                ? ownerProps.renderSlot('eleckoi.roleplay.trajectory.images', owner) : null
              return React.createElement(component || entry.component, { ...props, renderSlot })
            }
            const sync = () => {
              const sourceSpec = ctx.slots.spec(source)
              const targetSpec = ctx.slots.spec(target)
              const sourceEntries = sourceSpec && targetSpec && sourceSpec.scope === targetSpec.scope
                ? ctx.slots.entriesOfSlot(source)
                : []
              const entries = (options.winnerOnly ? sourceEntries.slice(0, 1) : sourceEntries)
                .filter(entry => {
                  if (options.entryId && entry.options.id !== options.entryId) return false
                  if (options.leafOnly && entry.children && Object.keys(entry.children).length > 0) return false
                  return options.include ? options.include(entry) : true
                })
              const current = new Set(entries)
              for (const [entry, dispose] of projected) {
                if (current.has(entry)) continue
                dispose()
                projected.delete(entry)
              }
              for (const entry of entries) {
                if (projected.has(entry)) continue
                const registrationOptions = {
                  name: target,
                  ...(targetSpec.kind === 'list'
                    ? { id: options.bridgeChildren ? entry.options.id : `dsh:${source}:${entry.options.id}` }
                    : targetSpec.kind === 'keyed' ? { key: entry.options.key } : {}),
                  ...(entry.options.order !== undefined ? { order: entry.options.order } : {}),
                  ...(entry.options.label !== undefined ? { label: entry.options.label } : {}),
                  ...(entry.options.priority !== undefined ? { priority: entry.options.priority } : {}),
                  ...(entry.select ? { select: entry.select } : {}),
                  ...(entry.inject ? { inject: entry.inject } : {}),
                  ...(entry.store ? { store: entry.store } : {}),
                  ...(entry.locale ? { locale: entry.locale } : {}),
                  ...(entry.registrant ? { registrant: entry.registrant } : {})
                }
                if (options.bridgeChildren && entry.children) {
                  registrationOptions.children = Object.fromEntries(Object.entries(entry.children)
                    .map(([name, spec]) => [viewSeatName(name), spec]))
                  for (const name of Object.keys(entry.children)) {
                    if (projectedViewChildren.has(name)) continue
                    projectedViewChildren.add(name)
                    projectConversationSeat(name, viewSeatName(name), { bridgeChildren: true })
                  }
                }
                if (options.entryId === 'chat' && entry.children) {
                  registrationOptions.children = Object.fromEntries(Object.entries(entry.children)
                    .map(([name, spec]) => [bridgedChatChildren[name] || name, spec]))
                }
                projected.set(entry, ctx.slots.register(registrationOptions, adapt(entry)))
              }
            }
            const unsubscribe = ctx.slots.subscribe(source, sync)
            sync()
            return () => {
              unsubscribe()
              for (const dispose of projected.values()) dispose()
            }
          })
        }

        ctx.slots.inject('eleckoi.roleplay', () => ctx.slots.register({
          name: 'eleckoi.roleplay',
          priority: 100,
          children: {
            'eleckoi.roleplay.session': { kind: 'single', scope: 'session' }
          },
          inject: () => ({ sessions: ctx.sessions }),
          select: owner => owner?.component ? owner : null
        }, RoleplayView))
        ctx.slots.inject('eleckoi.roleplay.session', () => ctx.slots.register({
          name: 'eleckoi.roleplay.session',
          children: {
            'eleckoi.roleplay.session.header': { kind: 'single', scope: 'session' },
            'eleckoi.roleplay.session.body': { kind: 'single', scope: 'session' },
            'eleckoi.roleplay.message.content': { kind: 'chain', scope: 'session' },
            'eleckoi.roleplay.chat.frontend': { kind: 'chain', scope: 'session' },
            'eleckoi.roleplay.message.actions': { kind: 'list', scope: 'session' },
            'eleckoi.roleplay.message.after': { kind: 'list', scope: 'session' },
            'eleckoi.roleplay.conversation.header.corner': { kind: 'single', scope: 'session' },
            'eleckoi.roleplay.conversation.input.left': { kind: 'list', scope: 'session' },
            'eleckoi.roleplay.conversation.input.right': { kind: 'list', scope: 'session' },
            'eleckoi.roleplay.conversation.input.overlay': { kind: 'list', scope: 'session' },
            'eleckoi.roleplay.conversation.input.dock': { kind: 'list', scope: 'session' },
            'eleckoi.roleplay.conversation.input.attachments': { kind: 'single', scope: 'session-maybe' },
            'eleckoi.roleplay.conversation.input.permission': { kind: 'single', scope: 'session' },
            'eleckoi.roleplay.conversation.input.plan': { kind: 'single', scope: 'session' },
            'eleckoi.roleplay.conversation.input.model': { kind: 'single', scope: 'session' },
            'eleckoi.roleplay.conversation.input.activity': { kind: 'single', scope: 'session' },
            'eleckoi.roleplay.conversation.composer.dock': { kind: 'list', scope: 'session' },
            'eleckoi.roleplay.conversation.composer': { kind: 'chain', scope: 'session' },
            'eleckoi.roleplay.conversation.composer.bar': { kind: 'single', scope: 'session-maybe' },
            'eleckoi.roleplay.conversation.approval.detail': { kind: 'single', scope: 'session' },
            'eleckoi.roleplay.conversation.plan-review.actions': { kind: 'list', scope: 'session' },
            'eleckoi.roleplay.trajectory.images': { kind: 'single', scope: 'session' },
            'eleckoi.roleplay.trajectory': { kind: 'single', scope: 'session' },
            'eleckoi.roleplay.chat': { kind: 'single', scope: 'session' }
          }
        }, RoleplaySessionView))
        projectConversationSeat('conversation.session.header', 'eleckoi.roleplay.session.header', {
          winnerOnly: true, component: RoleplayConversationHeader
        })
        projectConversationSeat('conversation.session', 'eleckoi.roleplay.session.body', {
          winnerOnly: true, component: RoleplayConversationBody, bridgeChildren: true
        })
        projectConversationSeat('conversation.session.header.corner', 'eleckoi.roleplay.conversation.header.corner', {
          winnerOnly: true
        })
        projectConversationSeat('conversation.composer', 'eleckoi.roleplay.conversation.composer')
        projectConversationSeat('conversation.composer.bar', 'eleckoi.roleplay.conversation.composer.bar', {
          winnerOnly: true
        })
        projectConversationSeat('conversation.input.left', 'eleckoi.roleplay.conversation.input.left', { leafOnly: true })
        projectConversationSeat('conversation.input.right', 'eleckoi.roleplay.conversation.input.right', { leafOnly: true })
        projectConversationSeat('conversation.input.overlay', 'eleckoi.roleplay.conversation.input.overlay', { leafOnly: true })
        projectConversationSeat('conversation.input.dock', 'eleckoi.roleplay.conversation.input.dock', {
          leafOnly: true,
          include: entry => entry.options.id !== 'queue'
        })
        projectConversationSeat('conversation.input.attachments', 'eleckoi.roleplay.conversation.input.attachments', { leafOnly: true })
        projectConversationSeat('conversation.input.permission', 'eleckoi.roleplay.conversation.input.permission', { leafOnly: true })
        projectConversationSeat('conversation.input.plan', 'eleckoi.roleplay.conversation.input.plan', { leafOnly: true })
        projectConversationSeat('conversation.input.model', 'eleckoi.roleplay.conversation.input.model', { leafOnly: true })
        projectConversationSeat('conversation.input.activity', 'eleckoi.roleplay.conversation.input.activity', { leafOnly: true })
        projectConversationSeat('conversation.composer.dock', 'eleckoi.roleplay.conversation.composer.dock', { leafOnly: true })
        projectConversationSeat('conversation.approval.detail', 'eleckoi.roleplay.conversation.approval.detail', { leafOnly: true })
        projectConversationSeat('conversation.plan-review.actions', 'eleckoi.roleplay.conversation.plan-review.actions', { leafOnly: true })
        projectConversationSeat('conversation.trajectory.images', 'eleckoi.roleplay.trajectory.images')
        projectConversationSeat('conversation.view', 'eleckoi.roleplay.trajectory', { entryId: 'trajectory' })
        projectConversationSeat('conversation.view', 'eleckoi.roleplay.chat', { entryId: 'chat' })
        projectConversationSeat('conversation.chat.node', 'eleckoi.roleplay.chat.node', { leafOnly: true })
        projectConversationSeat('conversation.message.images', 'eleckoi.roleplay.chat.images')
        projectConversationSeat('conversation.chat.before', 'eleckoi.roleplay.chat.before')
        projectConversationSeat('conversation.chat.pending-input', 'eleckoi.roleplay.chat.pending-input')
      }
    }
  }
})
