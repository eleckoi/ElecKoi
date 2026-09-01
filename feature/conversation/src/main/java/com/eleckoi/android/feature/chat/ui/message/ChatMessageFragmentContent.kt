package com.eleckoi.android.feature.chat.ui.message

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.TextUnit
import com.eleckoi.android.feature.chat.ui.blocks.markdown.MarkdownDocumentBlock
import com.eleckoi.android.feature.chat.ui.blocks.operation.OperationStatusBlock
import com.eleckoi.android.feature.chat.ui.blocks.image.GeneratedImageGallery
import com.eleckoi.android.foundation.design.AppearanceTheme

@Composable
internal fun ChatMessageFragmentContent(
    fragment: ChatMessageFragment,
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
    onRegenerateImage: (String) -> Unit,
) {
    when (fragment) {
        is ChatMessageFragment.Markdown -> MarkdownDocumentBlock(
            nodes = listOf(fragment.node),
            appearance = appearance,
            isUser = false,
            modifier = modifier,
            fontSize = fontSize,
            lineHeight = lineHeight,
            letterSpacing = letterSpacing,
            paragraphSpacing = paragraphSpacing,
            messageContainerVisible = messageContainerVisible,
            streaming = false,
            visualGeneration = visualGeneration,
            onContentReady = onContentReady,
            onRevealComplete = onVisualComplete,
            cacheOwnerKey = fragment.cacheOwnerKey,
            sourceHash = fragment.sourceHash,
            sourceLength = fragment.sourceLength,
        )

        is ChatMessageFragment.Operation -> {
            OperationStatusBlock(
                block = fragment.block,
                appearance = appearance,
                modifier = modifier,
            )
            FragmentReadyEffect(fragment.stableId, onContentReady, onVisualComplete)
        }

        is ChatMessageFragment.ImagePlacement -> {
            GeneratedImageGallery(
                attachments = fragment.attachments,
                appearance = appearance,
                modifier = modifier,
                onRegenerate = onRegenerateImage,
                onContentReady = {
                    onContentReady()
                    if (fragment.attachments.none {
                            it.status == com.eleckoi.android.feature.chat.model.ChatImageStatus.Generating
                        }
                    ) {
                        onVisualComplete()
                    }
                },
            )
        }
    }
}

@Composable
private fun FragmentReadyEffect(
    stableId: String,
    onContentReady: () -> Unit,
    onVisualComplete: () -> Unit,
) {
    LaunchedEffect(stableId) {
        onContentReady()
        onVisualComplete()
    }
}
