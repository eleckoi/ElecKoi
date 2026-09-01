package com.eleckoi.android.feature.chat.ui.blocks.markdown

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.TextUnit
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.feature.chat.model.markdown.MarkdownNode
import com.eleckoi.android.feature.chat.ui.blocks.markdown.render.MarkdownDocumentRenderer

@Composable
internal fun MarkdownDocumentBlock(
    nodes: List<MarkdownNode>,
    appearance: AppearanceTheme,
    isUser: Boolean,
    modifier: Modifier = Modifier,
    fontSize: TextUnit,
    lineHeight: TextUnit,
    letterSpacing: TextUnit,
    paragraphSpacing: Float,
    messageContainerVisible: Boolean,
    streaming: Boolean,
    visualGeneration: Int,
    onContentReady: () -> Unit,
    onRevealComplete: () -> Unit,
    cacheOwnerKey: String,
    sourceHash: Int,
    sourceLength: Int,
) {
    MarkdownDocumentRenderer(
        nodes = nodes,
        appearance = appearance,
        isUser = isUser,
        modifier = modifier,
        fontSize = fontSize,
        lineHeight = lineHeight,
        letterSpacing = letterSpacing,
        paragraphSpacing = paragraphSpacing,
        messageContainerVisible = messageContainerVisible,
        streaming = streaming,
        visualGeneration = visualGeneration,
        onContentReady = onContentReady,
        onRevealComplete = onRevealComplete,
        cacheOwnerKey = cacheOwnerKey,
        sourceHash = sourceHash,
        sourceLength = sourceLength,
    )
}
