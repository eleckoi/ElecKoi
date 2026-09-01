package com.eleckoi.android.feature.chat.ui.blocks.markdown.layout

/** Process cache for completed Android text layouts. Both entry count and source weight are bound. */
internal object MarkdownRenderPlanCache {
    private const val MaxEntries = 12
    private const val MaxCharacters = 128_000
    private const val MinRetainedEntries = 2
    private const val MaxHandoffEntries = 4
    private const val MaxHandoffCharacters = 64_000
    private const val MinHandoffEntries = 1

    private val entries = object : LinkedHashMap<MarkdownRenderPlanKey, MarkdownRenderPlan>(16, 0.75f, true) {}
    private var characters = 0
    private val handoffEntries = object : LinkedHashMap<String, MarkdownRenderPlan>(8, 0.75f, true) {}
    private var handoffCharacters = 0

    @Synchronized
    fun get(key: MarkdownRenderPlanKey): MarkdownRenderPlan? = entries[key]

    /** Exact last-frame plan for a streaming owner that may move to another Compose slot. */
    @Synchronized
    fun getHandoff(key: MarkdownRenderPlanKey): MarkdownRenderPlan? =
        handoffEntries[key.cacheOwnerKey]?.takeIf { it.key == key }

    /**
     * Last painted plan for an owner, even when the parser has just finalized its streaming tail.
     *
     * Finalizing a Markdown document changes unstable tail nodes into stable nodes, so the new
     * render-plan key is intentionally different from the streaming key. A destination Compose
     * slot must still paint the previous plan while that new plan is built; otherwise it renders
     * only its retained-height spacer for a frame and the assistant reply appears to disappear.
     * Callers must treat this as a visual fallback, never as content readiness.
     */
    @Synchronized
    fun getLatestHandoff(cacheOwnerKey: String): MarkdownRenderPlan? =
        handoffEntries[cacheOwnerKey]

    @Synchronized
    fun putHandoff(plan: MarkdownRenderPlan) {
        handoffEntries.remove(plan.key.cacheOwnerKey)?.let {
            handoffCharacters -= it.characterWeight
        }
        handoffEntries[plan.key.cacheOwnerKey] = plan
        handoffCharacters += plan.characterWeight
        val iterator = handoffEntries.entries.iterator()
        while (
            (handoffEntries.size > MaxHandoffEntries ||
                handoffCharacters > MaxHandoffCharacters) &&
                handoffEntries.size > MinHandoffEntries &&
                iterator.hasNext()
        ) {
            handoffCharacters -= iterator.next().value.characterWeight
            iterator.remove()
        }
    }

    @Synchronized
    fun put(plan: MarkdownRenderPlan) {
        entries.remove(plan.key)?.let { characters -= it.characterWeight }
        entries[plan.key] = plan
        characters += plan.characterWeight
        val iterator = entries.entries.iterator()
        // A single unusually long AI answer can exceed the normal character budget by itself.
        // Never immediately evict the plan that was just built: doing so turns every revisit into
        // a full background rebuild and leaves only the retained-height spacer on screen. Keep the
        // two most-recent plans so crossing a message boundary in either direction stays warm.
        while (
            (entries.size > MaxEntries || characters > MaxCharacters) &&
                entries.size > MinRetainedEntries &&
                iterator.hasNext()
        ) {
            characters -= iterator.next().value.characterWeight
            iterator.remove()
        }
    }

    @Synchronized
    fun clear() {
        entries.clear()
        characters = 0
        handoffEntries.clear()
        handoffCharacters = 0
    }

    @Synchronized
    fun removeScopes(scopeKeys: Set<String>) {
        if (scopeKeys.isEmpty()) return
        val iterator = entries.entries.iterator()
        while (iterator.hasNext()) {
            val entry = iterator.next()
            if (scopeKeys.none { scope -> entry.key.cacheOwnerKey.belongsToScope(scope) }) continue
            characters -= entry.value.characterWeight
            iterator.remove()
        }
        val handoffIterator = handoffEntries.entries.iterator()
        while (handoffIterator.hasNext()) {
            val entry = handoffIterator.next()
            if (scopeKeys.none { scope -> entry.key.belongsToScope(scope) }) continue
            handoffCharacters -= entry.value.characterWeight
            handoffIterator.remove()
        }
    }
}

private fun String.belongsToScope(scope: String): Boolean = this == scope || startsWith("$scope:")
