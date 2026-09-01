package com.eleckoi.android.feature.characters.modes.story.settinglibrary.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryConversation
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibrary
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryEntry
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryTriggerMode
import com.eleckoi.android.foundation.design.AppearanceTheme
import java.util.UUID
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.ui.dynamic.DynamicConversationListPage
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.ui.dynamic.DynamicConversationSettingsPage
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.ui.dynamic.DynamicSettingEntryPage
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.ui.dynamic.DynamicSettingEntrySelection
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.ui.dynamic.DynamicSettingSaveVersionDialog
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.ui.dynamic.DynamicSettingsStatusPage

@Composable
fun DynamicSettingsPage(
    conversations: List<SettingLibraryConversation>,
    loading: Boolean,
    savingConversationVersionId: String,
    mutatingConversationId: String,
    expandedGroupIdsByConversation: Map<String, Set<String>>,
    initialSessionId: String,
    appearance: AppearanceTheme,
    onBack: () -> Unit,
    onSaveAsVersion: (sessionId: String, name: String) -> Unit,
    onUpdateEntry: (sessionId: String, entryId: String, title: String, content: String) -> Unit,
    onReplaceLibrary: (sessionId: String, library: SettingLibrary, successMessage: String) -> Unit,
    onDeleteEntry: (sessionId: String, entryId: String) -> Unit,
    onDeleteGroup: (sessionId: String, groupId: String) -> Unit,
    onExpandedGroupIdsChange: (sessionId: String, expandedGroupIds: Set<String>) -> Unit,
    onDeleteConversationSettings: (sessionId: String) -> Unit,
) {
    var selectedConversationId by remember(initialSessionId) { mutableStateOf(initialSessionId) }
    var selectedEntry by remember { mutableStateOf<DynamicSettingEntryReference?>(null) }
    var newEntryDraft by remember { mutableStateOf<DynamicNewEntryReference?>(null) }
    var versionSource by remember { mutableStateOf<SettingLibraryConversation?>(null) }

    newEntryDraft?.let { reference ->
        val conversation = conversations.firstOrNull { it.sessionId == reference.sessionId }
        if (conversation != null) {
            val draft = remember(reference) {
                SettingLibraryEntry(
                    id = reference.entryId,
                    title = "",
                    content = "",
                    enabled = true,
                    triggerMode = SettingLibraryTriggerMode.AgentTool,
                    groupId = reference.groupId,
                )
            }
            DynamicSettingEntryPage(
                selection = DynamicSettingEntrySelection(conversation, draft),
                saving = mutatingConversationId == conversation.sessionId,
                creating = true,
                appearance = appearance,
                onBack = { newEntryDraft = null },
                onSave = { title, content ->
                    onReplaceLibrary(
                        conversation.sessionId,
                        conversation.library.copy(
                            entries = conversation.library.entries + draft.copy(title = title, content = content),
                        ),
                        "动态设定已创建",
                    )
                    newEntryDraft = null
                },
                onDelete = null,
            )
        } else {
            LaunchedEffect(reference, loading) {
                if (!loading) newEntryDraft = null
            }
            DynamicSettingsStatusPage(
                text = if (loading) "正在读取" else "这段对话已不存在",
                appearance = appearance,
                onBack = { newEntryDraft = null },
            )
        }
        return
    }

    selectedEntry?.let { reference ->
        val conversation = conversations.firstOrNull { it.sessionId == reference.sessionId }
        val entry = conversation?.library?.entries?.firstOrNull { it.id == reference.entryId }
        if (conversation != null && entry != null) {
            DynamicSettingEntryPage(
                selection = DynamicSettingEntrySelection(conversation, entry),
                saving = mutatingConversationId == conversation.sessionId,
                appearance = appearance,
                onBack = { selectedEntry = null },
                onSave = { title, content ->
                    onUpdateEntry(conversation.sessionId, entry.id, title, content)
                },
                onDelete = { onDeleteEntry(conversation.sessionId, entry.id) },
            )
        } else {
            LaunchedEffect(reference, loading) {
                if (!loading) selectedEntry = null
            }
            DynamicSettingsStatusPage(
                text = if (loading) "正在读取" else "这条设定已删除",
                appearance = appearance,
                onBack = { selectedEntry = null },
            )
        }
        return
    }

    val selectedConversation = conversations.firstOrNull { it.sessionId == selectedConversationId }
    var selectedConversationWasPresent by remember(selectedConversationId) { mutableStateOf(false) }
    LaunchedEffect(selectedConversation?.sessionId) {
        if (selectedConversation != null) selectedConversationWasPresent = true
    }
    LaunchedEffect(selectedConversationId, selectedConversation, loading, selectedConversationWasPresent) {
        if (
            selectedConversationId.isNotBlank() && selectedConversation == null && !loading &&
            selectedConversationWasPresent
        ) {
            if (initialSessionId.isNotBlank()) onBack() else selectedConversationId = ""
        }
    }
    if (selectedConversationId.isNotBlank()) {
        val detailBack: () -> Unit = if (initialSessionId.isNotBlank()) onBack else {
            { selectedConversationId = "" }
        }
        when {
            selectedConversation != null -> DynamicConversationSettingsPage(
                conversation = selectedConversation,
                saving = savingConversationVersionId == selectedConversation.sessionId,
                deleting = mutatingConversationId == selectedConversation.sessionId,
                storedExpandedGroupIds = expandedGroupIdsByConversation[selectedConversation.sessionId],
                appearance = appearance,
                onBack = detailBack,
                onOpenEntry = { entry ->
                    selectedEntry = DynamicSettingEntryReference(selectedConversation.sessionId, entry.id)
                },
                onSaveAsVersion = { versionSource = selectedConversation },
                onCreateEntry = { groupId ->
                    newEntryDraft = DynamicNewEntryReference(
                        sessionId = selectedConversation.sessionId,
                        groupId = groupId,
                        entryId = "session-setting-${UUID.randomUUID().toString().replace("-", "").take(12)}",
                    )
                },
                onReplaceLibrary = { library, successMessage ->
                    onReplaceLibrary(selectedConversation.sessionId, library, successMessage)
                },
                onDeleteGroup = { groupId ->
                    onDeleteGroup(selectedConversation.sessionId, groupId)
                },
                onDeleteEntry = { entryId ->
                    onDeleteEntry(selectedConversation.sessionId, entryId)
                },
                onExpandedGroupIdsChange = { expandedGroupIds ->
                    onExpandedGroupIdsChange(selectedConversation.sessionId, expandedGroupIds)
                },
                onDeleteConversationSettings = {
                    onDeleteConversationSettings(selectedConversation.sessionId)
                },
            )

            loading -> DynamicSettingsStatusPage(
                text = "正在读取",
                appearance = appearance,
                onBack = detailBack,
            )

            else -> DynamicSettingsStatusPage(
                text = "找不到这条对话",
                appearance = appearance,
                onBack = detailBack,
            )
        }
    } else {
        DynamicConversationListPage(
            conversations = conversations,
            loading = loading,
            appearance = appearance,
            onBack = onBack,
            onOpenConversation = { selectedConversationId = it.sessionId },
        )
    }

    versionSource?.let { conversation ->
        DynamicSettingSaveVersionDialog(
            conversation = conversation,
            appearance = appearance,
            onDismiss = { versionSource = null },
            onConfirm = { name ->
                versionSource = null
                onSaveAsVersion(conversation.sessionId, name)
            },
        )
    }
}

private data class DynamicSettingEntryReference(
    val sessionId: String,
    val entryId: String,
)

private data class DynamicNewEntryReference(
    val sessionId: String,
    val groupId: String,
    val entryId: String,
)
