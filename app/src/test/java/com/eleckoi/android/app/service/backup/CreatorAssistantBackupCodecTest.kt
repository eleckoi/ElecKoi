package com.eleckoi.android.app.service.backup

import com.eleckoi.android.engine.agent.eleckoi.conversation.LedgerMessage
import com.eleckoi.android.engine.workspace.storage.CreatorWorkspaceRepository
import com.eleckoi.android.foundation.serialization.ElecKoiJson
import com.eleckoi.android.foundation.serialization.ElecKoiPrettyJson
import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class CreatorAssistantBackupCodecTest {
    @get:Rule
    val temporaryFolder = TemporaryFolder()

    @Test
    fun `assistant ledger backup preserves visible and provider-native history`() {
        val document = CreatorAssistantBackupDocument(
            conversations = listOf(
                CreatorAssistantConversationBackup(
                    workspaceId = "workspace-1",
                    conversationId = "conversation-1",
                    messages = listOf(
                        LedgerMessage(
                            id = "assistant-1",
                            role = "assistant",
                            content = "完成",
                            reasoningContent = "推理",
                            surfaceTimelineJson = "[{\"kind\":\"Assistant\"}]",
                            modelHistoryItems = listOf("{\"type\":\"message\"}"),
                            runtimeThreadId = "thread-1",
                            runtimeTurnId = "turn-1",
                        ),
                    ),
                ),
            ),
        )

        val restored = ElecKoiJson.decodeFromString<CreatorAssistantBackupDocument>(
            ElecKoiPrettyJson.encodeToString(document),
        )

        assertEquals(document, restored)
    }

    @Test
    fun `assistant backup store exports and restores every workspace conversation`() = runBlocking {
        val workspaces = CreatorWorkspaceRepository(
            root = temporaryFolder.newFolder("creator-workspaces"),
            now = Instant::now,
            newId = { UUID.randomUUID().toString() },
        )
        val workspace = workspaces.create("助手项目")
        val conversationId = workspace.conversations.single().id
        val messages = listOf(
            LedgerMessage(
                id = "user-1",
                role = "user",
                content = "继续完成项目",
                modelHistoryItems = listOf("{\"role\":\"user\"}"),
            ),
            LedgerMessage(
                id = "assistant-1",
                role = "assistant",
                content = "已完成",
                surfaceTimelineJson = "[{\"kind\":\"Assistant\"}]",
                modelHistoryItems = listOf("{\"role\":\"assistant\"}"),
            ),
        )
        val sourceLedger = FakeCreatorAssistantBackupLedger(
            mutableMapOf(conversationId to messages),
        )
        val exported = CreatorAssistantBackupStore(workspaces, sourceLedger).exportJson()
        val restoredLedger = FakeCreatorAssistantBackupLedger()

        val restoredCount = CreatorAssistantBackupStore(workspaces, restoredLedger).restoreJson(
            exported.json,
            workspaces.list(),
        )

        assertEquals(1, exported.workspaceCount)
        assertEquals(1, exported.conversationCount)
        assertEquals(1, restoredCount)
        assertEquals(messages, restoredLedger.values.getValue(conversationId))
    }

    private class FakeCreatorAssistantBackupLedger(
        val values: MutableMap<String, List<LedgerMessage>> = mutableMapOf(),
    ) : CreatorAssistantBackupLedger {
        override fun messages(conversationId: String): List<LedgerMessage> =
            values[conversationId].orEmpty()

        override fun restore(conversations: List<CreatorAssistantLedgerRestore>) {
            conversations.forEach { values[it.conversationId] = it.messages }
        }
    }
}
