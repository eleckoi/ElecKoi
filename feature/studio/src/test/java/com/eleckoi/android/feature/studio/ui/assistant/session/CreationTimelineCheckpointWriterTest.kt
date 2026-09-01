package com.eleckoi.android.feature.studio.ui.assistant.session

import com.eleckoi.android.feature.conversation.markdown.*
import com.eleckoi.android.feature.conversation.timeline.*
import com.eleckoi.android.feature.conversation.timeline.model.*
import com.eleckoi.android.feature.conversation.timeline.ui.*

import com.eleckoi.android.feature.conversation.timeline.model.CreationTimelineItem
import com.eleckoi.android.feature.conversation.timeline.model.CreationTimelineKind
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test

class CreationTimelineCheckpointWriterTest {
    @Test
    fun conflatesUiSnapshotsBeforeThePersistenceConversionRuns() = runBlocking {
        val persistedTailValues = mutableListOf<String>()
        val writer = CreationTimelineCheckpointWriter(
            scope = this,
            intervalMillis = 30L,
        ) { checkpoint ->
            // The real callback performs toStoredTimeline(). Counting callback invocations proves
            // discarded UI snapshots never reach that full conversion boundary.
            persistedTailValues += checkpoint.timeline.last().text
        }

        repeat(100) { index ->
            writer.offer(
                CreationTimelineCheckpoint(
                    workspaceId = "workspace",
                    conversationId = "conversation",
                    timeline = listOf(
                        CreationTimelineItem(
                            id = "assistant",
                            kind = CreationTimelineKind.Assistant,
                            text = index.toString(),
                        ),
                    ),
                ),
            )
        }
        delay(100L)
        writer.stop()

        assertEquals(listOf("99"), persistedTailValues)
    }
}
