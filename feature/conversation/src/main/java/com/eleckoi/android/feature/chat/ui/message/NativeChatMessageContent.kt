package com.eleckoi.android.feature.chat.ui.message

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import com.eleckoi.android.feature.chat.data.stream.StreamingMarkupAssembler
import com.eleckoi.android.feature.chat.model.ChatMessage
import com.eleckoi.android.feature.chat.model.MessageRole
import com.eleckoi.android.feature.chat.model.content.ChatContentBlock
import com.eleckoi.android.feature.chat.ui.blocks.image.GeneratedImageGallery
import com.eleckoi.android.feature.chat.ui.blocks.operation.OperationStatusBlock
import com.eleckoi.android.feature.chat.ui.blocks.text.TextMessageBlock
import com.eleckoi.android.foundation.design.AppearanceTheme

@Composable
internal fun NativeChatMessageContent(
    message: ChatMessage,
    state: ChatMessageContentState,
    appearance: AppearanceTheme,
    modifier: Modifier,
    fontSize: TextUnit,
    lineHeight: TextUnit,
    letterSpacing: TextUnit,
    paragraphSpacing: Float,
    messageContainerVisible: Boolean,
    visualGeneration: Int,
    onContentReady: () -> Unit,
    onVisualComplete: () -> Unit,
    cacheOwnerKey: String,
    onRegenerateImage: (String) -> Unit,
    appendUnplacedImages: Boolean = true,
) {
    val isUser = message.role == MessageRole.User
    val markupAssembler = remember(message.id, visualGeneration, cacheOwnerKey) {
        StreamingMarkupAssembler(cacheOwnerKey)
    }
    val blocks = remember(
        state.displayedText,
        message.reasoningContent,
        message.toolCalls,
        message.pending,
        isUser,
        markupAssembler,
        appendUnplacedImages,
    ) {
        assembleChatContentBlocks(
            message = message,
            displayedText = state.displayedText,
            markupAssembler = markupAssembler,
            appendUnplacedImages = appendUnplacedImages,
        )
    }
    val textBlockIds = blocks.filterIsInstance<ChatContentBlock.Text>().map(ChatContentBlock.Text::id)
    val attachmentsByFrame = message.imageAttachments.associateBy { it.frameIndex }
    val imageIds = blocks
        .filterIsInstance<ChatContentBlock.ImagePlacement>()
        .flatMap(ChatContentBlock.ImagePlacement::frameIndexes)
        .distinct()
        .mapNotNull(attachmentsByFrame::get)
        .map { it.id }
    val showInlineAgentProcess = shouldShowInlineAgentProcess(
        message = message,
        displayedText = state.displayedText,
    )
    var processSheetOpen by remember(message.id) { mutableStateOf(false) }
    if (processSheetOpen) {
        ChatAgentProcessSheet(
            message = message,
            appearance = appearance,
            onDismiss = { processSheetOpen = false },
        )
    }
    var readyTextBlockIds by remember(message.id, visualGeneration) {
        mutableStateOf(emptySet<String>())
    }
    var readyImageIds by remember(message.id, visualGeneration) {
        mutableStateOf(emptySet<String>())
    }
    var revealedTextBlockIds by remember(message.id, visualGeneration) { mutableStateOf(emptySet<String>()) }
    LaunchedEffect(message.pending, visualGeneration) {
        if (message.pending) revealedTextBlockIds = emptySet()
    }
    LaunchedEffect(textBlockIds) {
        readyTextBlockIds = readyTextBlockIds.intersect(textBlockIds.toSet())
        revealedTextBlockIds = revealedTextBlockIds.intersect(textBlockIds.toSet())
    }
    LaunchedEffect(imageIds) {
        readyImageIds = readyImageIds.intersect(imageIds.toSet())
    }
    LaunchedEffect(textBlockIds, readyTextBlockIds, imageIds, readyImageIds) {
        if (
            textBlockIds.all(readyTextBlockIds::contains) &&
            imageIds.all(readyImageIds::contains)
        ) {
            // This callback now means the whole row is drawable. Previously any assistant tool
            // metadata could mark a still-empty Markdown body as ready.
            onContentReady()
        }
    }
    LaunchedEffect(
        message.pending,
        textBlockIds,
        revealedTextBlockIds,
        message.imageAttachments,
        visualGeneration,
    ) {
        if (
            !message.pending &&
            textBlockIds.all(revealedTextBlockIds::contains) &&
            message.imageAttachments.none { it.status == com.eleckoi.android.feature.chat.model.ChatImageStatus.Generating }
        ) {
            onVisualComplete()
        }
    }

    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        // Process and reply are two phases of the same visual slot, never vertically stacked.
        // Keeping a completed process above a streaming reply makes the whole reply jump upward
        // when the turn ends and the process disappears. As soon as real reply content exists,
        // the reply owns the slot; the settled process remains available from the message tools.
        if (showInlineAgentProcess) {
            ChatAgentProcessedTimeline(
                messageId = message.id,
                reasoningContent = message.reasoningContent,
                calls = message.toolCalls,
                running = message.pending,
                turnStartedAtMillis = message.turnStartedAtMillis,
                turnCompletedAtMillis = message.turnCompletedAtMillis,
                appearance = appearance,
                fontSize = fontSize,
                lineHeight = lineHeight,
                letterSpacing = letterSpacing,
                paragraphSpacing = paragraphSpacing,
                onOpenProcess = { processSheetOpen = true },
            )
        } else {
            Column(
                modifier = Modifier,
                verticalArrangement = Arrangement.spacedBy(7.dp),
            ) {
                var index = 0
                while (index < blocks.size) {
                    when (val block = blocks[index]) {
                        is ChatContentBlock.Text -> key(block.id, visualGeneration) {
                            TextMessageBlock(
                                content = block.markdown,
                                contentKey = block.id,
                                streaming = message.pending && !isUser,
                                appearance = appearance,
                                isUser = isUser,
                                modifier = Modifier,
                                fontSize = fontSize,
                                lineHeight = lineHeight,
                                letterSpacing = letterSpacing,
                                paragraphSpacing = paragraphSpacing,
                                messageContainerVisible = messageContainerVisible,
                                visualGeneration = visualGeneration,
                                onContentReady = {
                                    readyTextBlockIds = readyTextBlockIds + block.id
                                },
                                onRevealComplete = {
                                    revealedTextBlockIds = revealedTextBlockIds + block.id
                                },
                                // IMAGE-delimited prose segments must not share one native
                                // Markdown session. A later segment otherwise invalidates the
                                // already visible segment while its replacement is prepared.
                                cacheOwnerKey = "$cacheOwnerKey:${block.id}",
                            )
                        }

                        is ChatContentBlock.ImagePlacement -> {
                            val attachments = block.frameIndexes
                                .distinct()
                                .mapNotNull(attachmentsByFrame::get)
                            // Status/path updates replace only the contents of this stable slot.
                            // Re-keying the gallery here disposes its measured subtree and makes the
                            // entire reply visibly jump when one image succeeds or fails.
                            key(block.id) {
                                GeneratedImageGallery(
                                    attachments = attachments,
                                    appearance = appearance,
                                    onRegenerate = if (message.pending) null else onRegenerateImage,
                                    onContentReady = { attachmentId ->
                                        readyImageIds = readyImageIds + attachmentId
                                    },
                                )
                            }
                        }

                        is ChatContentBlock.Reasoning -> Unit

                        is ChatContentBlock.ToolCall -> Unit

                        is ChatContentBlock.Operation -> OperationStatusBlock(
                            block = block,
                            appearance = appearance,
                        )
                    }
                    index++
                }
            }
        }
    }
}

