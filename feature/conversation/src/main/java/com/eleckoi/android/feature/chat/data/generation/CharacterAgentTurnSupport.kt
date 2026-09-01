package com.eleckoi.android.feature.chat.data

import com.eleckoi.android.engine.agent.api.AgentTurnHandle
import com.eleckoi.android.engine.generation.model.ModelConfig
import com.eleckoi.android.feature.chat.model.ChatMessage
import com.eleckoi.android.feature.chat.model.ChatSession
import com.eleckoi.android.feature.chat.model.MessageRole
import com.eleckoi.android.feature.chat.model.hasRenderableContent
import com.eleckoi.android.feature.chat.model.settleAbortedGeneration
import com.eleckoi.android.foundation.storage.nowIso

internal fun pendingAssistantMessage(
    id: String,
    session: ChatSession,
    config: ModelConfig,
): ChatMessage = ChatMessage(
    id = id,
    role = MessageRole.Assistant,
    content = "",
    provider = config.provider,
    model = config.model,
    pending = true,
    variableStateJson = session.variableStateJson,
    turnStartedAtMillis = System.currentTimeMillis(),
)

internal fun settleStoppedSession(
    session: ChatSession,
    pending: ChatMessage,
    activeTurn: AgentTurnHandle?,
    failureReason: String,
): ChatSession {
    val partial = pending.settleAbortedGeneration(
        reason = failureReason,
        completedAtMillis = System.currentTimeMillis(),
    ).copy(
        createdAt = nowIso(),
        // Variable tools are transactional. A stopped turn may keep its visible prose, but
        // must keep the session's last committed snapshot rather than its staged patch.
        variableStateJson = session.variableStateJson,
    )
    val messages = if (partial.hasRenderableContent()) {
        session.messages + partial.copy(
            runtimeThreadId = activeTurn?.threadId.orEmpty(),
            runtimeTurnId = activeTurn?.turnId.orEmpty(),
        )
    } else {
        session.messages
    }
    return session.copy(
        messages = messages,
        variableStateJson = session.variableStateJson,
        updatedAt = nowIso(),
    )
}

internal const val GenerationCancelled = "Agent 回复已停止"
