package com.eleckoi.android.feature.conversation.timeline.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.eleckoi.android.engine.agent.api.AgentWorkItemType
import com.eleckoi.android.feature.chat.data.markdown.CompletedMarkdownDocumentLoader
import com.eleckoi.android.feature.chat.data.markdown.shouldSplitCompletedMarkdown
import com.eleckoi.android.feature.chat.model.markdown.MarkdownNode
import com.eleckoi.android.feature.conversation.timeline.model.CreationTimelineItem
import com.eleckoi.android.feature.conversation.timeline.CreationFileSummary
import com.eleckoi.android.feature.conversation.timeline.CreationTurnUi
import com.eleckoi.android.feature.conversation.timeline.creationFinalFileSummary
import com.eleckoi.android.feature.conversation.timeline.toCreationTurns
import kotlinx.coroutines.CancellationException

private data class CreationFinalAnswerRevision(
    val turnId: String,
    val answerId: String,
    val textHash: Int,
    val textLength: Int,
)

private data class PreparedCreationFinalAnswer(
    val revision: CreationFinalAnswerRevision,
    val nodes: List<MarkdownNode>,
)

/** Bounded process cache for stable completed-answer Markdown block indexes. */
private object CreationTimelinePreparationCache {
    private const val MaxEntries = 12
    private const val MaxCharacters = 512_000
    private const val MinRetainedEntries = 2

    private data class Key(val scopeKey: String, val turnId: String)
    private data class Entry(val prepared: PreparedCreationFinalAnswer, val weight: Int)

    private val entries = object : LinkedHashMap<Key, Entry>(16, 0.75f, true) {}
    private var characters = 0

    @Synchronized
    fun matching(
        scopeKey: String,
        revisions: List<CreationFinalAnswerRevision>,
    ): Map<String, PreparedCreationFinalAnswer> = buildMap {
        revisions.forEach { revision ->
            val entry = CreationTimelinePreparationCache.entries[
                Key(scopeKey, revision.turnId)
            ] ?: return@forEach
            if (entry.prepared.revision == revision) put(revision.turnId, entry.prepared)
        }
    }

    @Synchronized
    fun get(
        scopeKey: String,
        revision: CreationFinalAnswerRevision,
    ): PreparedCreationFinalAnswer? = entries[Key(scopeKey, revision.turnId)]
        ?.prepared
        ?.takeIf { it.revision == revision }

    @Synchronized
    fun put(scopeKey: String, prepared: PreparedCreationFinalAnswer) {
        val key = Key(scopeKey, prepared.revision.turnId)
        entries.remove(key)?.let { characters -= it.weight }
        val entry = Entry(
            prepared = prepared,
            weight = prepared.revision.textLength.coerceAtLeast(1),
        )
        entries[key] = entry
        characters += entry.weight
        val iterator = entries.entries.iterator()
        while (
            (entries.size > MaxEntries || characters > MaxCharacters) &&
            entries.size > MinRetainedEntries &&
            iterator.hasNext()
        ) {
            characters -= iterator.next().value.weight
            iterator.remove()
        }
    }

    @Synchronized
    fun clear() {
        entries.clear()
        characters = 0
    }
}

fun clearCreationTimelinePreparationCache() {
    CreationTimelinePreparationCache.clear()
}

suspend fun prewarmCreationTimelineItems(
    timeline: List<CreationTimelineItem>,
    conversationId: String,
) {
    if (conversationId.isBlank()) return
    val cacheScopeKey = "creation:$conversationId"
    var preparedCount = 0
    for (turn in timeline.toCreationTurns(isRunning = false).asReversed()) {
        val answer = turn.finalAnswer ?: continue
        if (!shouldSplitCompletedMarkdown(answer.text)) continue
        val revision = answer.revision(turn.id)
        if (CreationTimelinePreparationCache.get(cacheScopeKey, revision) == null) {
            val nodes = CompletedMarkdownDocumentLoader.load(
                ownerKey = "creation:${answer.id}",
                markdown = answer.text,
            )
            if (nodes.isNotEmpty()) {
                CreationTimelinePreparationCache.put(
                    cacheScopeKey,
                    PreparedCreationFinalAnswer(revision = revision, nodes = nodes),
                )
            }
        }
        preparedCount++
        if (preparedCount >= 2) break
    }
}

sealed interface CreationConversationItem {
    val turn: CreationTurnUi
    val key: String
    val contentType: String

    data class WholeTurn(
        override val turn: CreationTurnUi,
    ) : CreationConversationItem {
        // Running -> completed is a state change inside this same slot, not a new item type.
        // Changing contentType at terminal disposes the painted subtree for one frame. Completed
        // Markdown may later replace this with body + nodes + footer; its surviving key remains
        // attached to the body at the same visual top.
        override val key: String = creationTurnBodyKey(turn.id)
        override val contentType: String = "whole-turn"
    }

    data class TurnBody(
        override val turn: CreationTurnUi,
    ) : CreationConversationItem {
        override val key: String = creationTurnBodyKey(turn.id)
        override val contentType: String = "completed-turn-body"
    }

    data class FinalAnswerNode(
        override val turn: CreationTurnUi,
        val answer: CreationTimelineItem,
        val node: MarkdownNode,
        val nodeIndex: Int,
        val isLastNode: Boolean,
    ) : CreationConversationItem {
        override val key: String = "${turn.id}:answer:$nodeIndex:${node.id}"
        override val contentType: String = "completed-answer-${node.type.name}"
    }

    data class GeneratedMedia(
        override val turn: CreationTurnUi,
    ) : CreationConversationItem {
        override val key: String = creationTurnGeneratedMediaKey(turn.id)
        override val contentType: String = "generated-media"
    }

    data class TurnFooter(
        override val turn: CreationTurnUi,
    ) : CreationConversationItem {
        override val key: String = creationTurnFooterKey(turn.id)
        override val contentType: String = "completed-turn-footer"
    }
}

fun creationTurnBodyKey(turnId: String): String = "$turnId:body"

fun creationTurnFooterKey(turnId: String): String = "$turnId:footer"

fun creationTurnGeneratedMediaKey(turnId: String): String = "$turnId:generated-media"

/**
 * Structural phases that need the same pre-draw bottom hand-off as ordinary role chat.
 *
 * Streaming text itself is deliberately absent: its measured height is handled by the shared
 * end follower. This signature changes only when a new turn appears, an explicit final answer
 * gets its permanent slot, the turn settles, or completed Markdown is promoted to stable nodes.
 */
data class CreationConversationViewportSignature(
    val turnId: String?,
    val turnRunning: Boolean,
    val finalAnswerVisible: Boolean,
    val latestTurnItemStructure: List<String>,
)

/**
 * Identity of one generation attempt. Regeneration intentionally retains the source user/turn id,
 * so [CreationTurnUi.id] alone cannot distinguish a restarted answer from the completed answer it
 * replaced.
 */
data class CreationGenerationAttemptKey(
    val turnId: String,
    val startedAtMillis: Long,
)

fun CreationTurnUi?.generationAttemptKey(): CreationGenerationAttemptKey? =
    this?.let { turn ->
        CreationGenerationAttemptKey(
            turnId = turn.id,
            startedAtMillis = turn.startedAtMillis,
        )
    }

fun creationConversationViewportSignature(
    latestTurn: CreationTurnUi?,
    items: List<CreationConversationItem>,
): CreationConversationViewportSignature = CreationConversationViewportSignature(
    turnId = latestTurn?.id,
    turnRunning = latestTurn?.running == true,
    finalAnswerVisible = latestTurn?.finalAnswer?.text?.isNotBlank() == true,
    latestTurnItemStructure = if (latestTurn == null) {
        emptyList()
    } else {
        items.asSequence()
            .filter { item -> item.turn.id == latestTurn.id }
            .map { item -> "${item.key}|${item.contentType}" }
            .toList()
    },
)

/**
 * Live slot hand-offs need a pre-draw bottom attachment. Terminal settlement and completed
 * Markdown preparation do not: forcing the one-pixel footer to the viewport before measurement
 * is the blank frame seen at the end of generation.
 */
fun shouldCreationViewportMutationOwnBottom(
    viewportStructureChanged: Boolean,
    composerGeometryChanged: Boolean,
    latestTurnRunning: Boolean,
    userBrowsingHistory: Boolean,
    isDragged: Boolean,
): Boolean = !userBrowsingHistory &&
    !isDragged &&
    (composerGeometryChanged || (viewportStructureChanged && latestTurnRunning))

@Composable
fun rememberCreationConversationItems(
    turns: List<CreationTurnUi>,
    preparationTurns: List<CreationTurnUi> = turns,
    cacheScopeKey: String,
    allowPreparedSplitsToPublish: Boolean,
): List<CreationConversationItem> {
    val revisions = remember(preparationTurns) {
        preparationTurns.mapNotNull { turn ->
            val answer = turn.finalAnswer ?: return@mapNotNull null
            if (turn.running || !shouldSplitCompletedMarkdown(answer.text)) return@mapNotNull null
            answer.revision(turn.id)
        }
    }
    val visibleTurnIds = remember(turns) { turns.mapTo(hashSetOf(), CreationTurnUi::id) }
    var prepared by remember(cacheScopeKey) {
        mutableStateOf(CreationTimelinePreparationCache.matching(cacheScopeKey, revisions))
    }
    var published by remember(cacheScopeKey) {
        mutableStateOf(CreationTimelinePreparationCache.matching(cacheScopeKey, revisions))
    }
    val latestTurnId = turns.lastOrNull()?.id

    LaunchedEffect(cacheScopeKey, revisions) {
        val requestedByTurnId = revisions.associateBy(CreationFinalAnswerRevision::turnId)
        val reusable = prepared.filter { (turnId, value) ->
            requestedByTurnId[turnId] == value.revision
        }
        prepared = reusable
        preparationTurns.asReversed().forEach { turn ->
            val revision = requestedByTurnId[turn.id] ?: return@forEach
            if (reusable[turn.id]?.revision == revision) return@forEach
            val answer = turn.finalAnswer ?: return@forEach
            val nodes = try {
                CompletedMarkdownDocumentLoader.load(
                    ownerKey = "creation:${answer.id}",
                    markdown = answer.text,
                )
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (_: Throwable) {
                emptyList()
            }
            if (nodes.isNotEmpty()) {
                val built = PreparedCreationFinalAnswer(
                    revision = revision,
                    nodes = nodes,
                )
                CreationTimelinePreparationCache.put(cacheScopeKey, built)
                prepared = prepared + (turn.id to built)
            }
        }
    }

    LaunchedEffect(
        cacheScopeKey,
        revisions,
        prepared,
        visibleTurnIds,
        allowPreparedSplitsToPublish,
    ) {
        val requestedByTurnId = revisions.associateBy(CreationFinalAnswerRevision::turnId)
        val reusable = published.filter { (turnId, value) ->
            requestedByTurnId[turnId] == value.revision
        }
        val next = reusable + prepared.filter { (turnId, value) ->
            requestedByTurnId[turnId] == value.revision &&
                // Keep the visible terminal turn in its WholeTurn slot. Promoting it to
                // TurnBody + markdown nodes in the same frame that the process section collapses
                // disposes the painted subtree and produces the one-frame blank reported at the
                // end of generation. Older turns can be prepared once a new turn exists.
                turnId != latestTurnId &&
                (allowPreparedSplitsToPublish || turnId !in visibleTurnIds)
        }
        if (next != published) published = next
    }

    val items = remember(turns, published) {
        buildList {
            turns.forEach { turn ->
                val answer = turn.finalAnswer
                val revision = revisions.firstOrNull { it.turnId == turn.id }
                val preparedAnswer = published[turn.id]
                    ?.takeIf { it.revision == revision && answer != null }
                if (answer == null || preparedAnswer == null || preparedAnswer.nodes.isEmpty()) {
                    add(CreationConversationItem.WholeTurn(turn))
                } else {
                    add(CreationConversationItem.TurnBody(turn))
                    preparedAnswer.nodes.forEachIndexed { nodeIndex, node ->
                        add(
                            CreationConversationItem.FinalAnswerNode(
                                turn = turn,
                                answer = answer,
                                node = node,
                                nodeIndex = nodeIndex,
                                isLastNode = nodeIndex == preparedAnswer.nodes.lastIndex,
                            ),
                        )
                    }
                }
                if (turn.generatedMedia.isNotEmpty()) {
                    add(CreationConversationItem.GeneratedMedia(turn))
                }
                if (answer != null && preparedAnswer != null && preparedAnswer.nodes.isNotEmpty()) {
                    add(CreationConversationItem.TurnFooter(turn))
                }
            }
        }
    }
    return items
}

@Composable
fun rememberCreationTurnFileSummary(
    turn: CreationTurnUi,
    finalWorkspacePaths: List<String>?,
): CreationFileSummary {
    val fileItems = (turn.processing + turn.chronologicalTail).filter {
        it.workItemType == AgentWorkItemType.FileChange
    }
    return remember(
        turn.diff,
        turn.turnDiffObserved,
        turn.paths,
        fileItems,
        finalWorkspacePaths,
    ) {
        creationFinalFileSummary(
            turnDiff = turn.diff,
            turnDiffObserved = turn.turnDiffObserved,
            turnPaths = turn.paths,
            fileItems = fileItems,
            finalWorkspacePaths = finalWorkspacePaths,
        )
    }
}

private fun CreationTimelineItem.revision(turnId: String) = CreationFinalAnswerRevision(
    turnId = turnId,
    answerId = id,
    textHash = text.hashCode(),
    textLength = text.length,
)
