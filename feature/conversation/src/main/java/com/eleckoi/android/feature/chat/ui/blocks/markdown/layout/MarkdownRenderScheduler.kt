package com.eleckoi.android.feature.chat.ui.blocks.markdown.layout

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext

/** Prevents several cold chat messages from saturating every CPU core at the same time. */
internal object MarkdownRenderScheduler {
    private val permits = Semaphore(2)

    suspend fun build(key: MarkdownRenderPlanKey): MarkdownRenderPlan = permits.withPermit {
        withContext(Dispatchers.Default) { MarkdownRenderPlanEngine.build(key) }
    }
}
