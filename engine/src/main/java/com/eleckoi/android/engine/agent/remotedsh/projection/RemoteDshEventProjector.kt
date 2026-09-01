package com.eleckoi.android.engine.agent.remotedsh

import com.eleckoi.android.engine.agent.deepseek.protocol.DeepSeekHarnessEventMapper
import com.eleckoi.android.engine.agent.deepseek.protocol.DeepSeekNotification
import java.util.concurrent.ConcurrentHashMap
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put

/** Stateful, synchronized projection from remote DSH log events to ElecKoi session events. */
internal class RemoteDshEventProjector(
    private val onTurnEnded: (String) -> Unit = {},
) {
    private val mapperBySession = ConcurrentHashMap<String, DeepSeekHarnessEventMapper>()
    private val activeTurnBySession = ConcurrentHashMap<String, String>()
    private val lastSequenceBySession = ConcurrentHashMap<String, Long>()
    private val projectionLock = Any()

    fun clear() = synchronized(projectionLock) {
        mapperBySession.clear()
        activeTurnBySession.clear()
        lastSequenceBySession.clear()
    }

    fun activeTurnId(sessionId: String): String? = activeTurnBySession[sessionId]

    fun projectHistory(
        sessionId: String,
        entries: List<JsonElement>,
    ): List<RemoteDshEvent> = synchronized(projectionLock) {
        mapperBySession[sessionId] = DeepSeekHarnessEventMapper()
        activeTurnBySession.remove(sessionId)
        lastSequenceBySession.remove(sessionId)
        entries.flatMap { entryElement ->
            val entry = entryElement.jsonObject
            val sequence = entry["seq"]?.jsonPrimitive?.longOrNull
            val event = entry["event"]?.jsonObject ?: return@flatMap emptyList()
            mapSessionEvent(sessionId, sequence, event)
        }
    }

    fun projectLive(
        sessionId: String,
        event: JsonObject,
    ): List<RemoteDshEvent> = synchronized(projectionLock) {
        val sequence = event["seq"]?.jsonPrimitive?.longOrNull
        val last = sequence?.let { lastSequenceBySession[sessionId] }
        if (sequence != null && last != null && sequence <= last) {
            emptyList()
        } else {
            mapSessionEvent(sessionId, sequence, event)
        }
    }

    private fun mapSessionEvent(
        sessionId: String,
        sequence: Long?,
        event: JsonObject,
    ): List<RemoteDshEvent> {
        if (sequence != null) lastSequenceBySession[sessionId] = sequence
        val type = event.string("type")
        val data = event["data"] as? JsonObject ?: JsonObject(emptyMap())
        if (type == "turn/start") {
            val turn = data["turn"]?.jsonPrimitive?.longOrNull?.toInt()
            if (turn != null) activeTurnBySession[sessionId] = "$sessionId:$turn"
        }
        val mapped = if (type == "user/message") {
            listOfNotNull(
                projectRemoteDshUserMessage(
                    sessionId = sessionId,
                    turnId = activeTurnBySession[sessionId] ?: "$sessionId:history-${sequence ?: 0L}",
                    sequence = sequence,
                    event = event,
                ),
            )
        } else {
            mapperBySession.getOrPut(sessionId, ::DeepSeekHarnessEventMapper).map(
                DeepSeekNotification(
                    method = "session.event",
                    params = buildJsonObject {
                        put("sessionId", sessionId)
                        put("event", event)
                    },
                ),
            )
        }
        if (type == "turn/end") {
            activeTurnBySession.remove(sessionId)
            onTurnEnded(sessionId)
        }
        return mapped.map { mappedEvent -> RemoteDshEvent(sessionId, sequence, mappedEvent) }
    }
}
