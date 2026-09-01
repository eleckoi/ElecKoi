package com.eleckoi.android.engine.agent.remotedsh

import com.eleckoi.android.engine.agent.api.AgentInputImage
import java.util.concurrent.ConcurrentHashMap

/** In-memory bridge from one active role turn to its Android-hosted Remote DSH tool handler. */
class RemoteDshTurnImageRegistry {
    private val imagesByConversation = ConcurrentHashMap<String, List<AgentInputImage>>()

    fun publish(conversationId: String, images: List<AgentInputImage>) {
        if (conversationId.isBlank() || images.isEmpty()) {
            imagesByConversation.remove(conversationId)
        } else {
            imagesByConversation[conversationId] = images.toList()
        }
    }

    fun current(conversationId: String): List<AgentInputImage> =
        imagesByConversation[conversationId].orEmpty()

    fun clear(conversationId: String) {
        imagesByConversation.remove(conversationId)
    }
}
