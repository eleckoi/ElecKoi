package com.eleckoi.android.feature.conversation.markdown

import androidx.compose.foundation.layout.Box
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.sp
import com.eleckoi.android.feature.chat.ui.blocks.text.TextMessageBlock
import com.eleckoi.android.feature.chat.model.markdown.MarkdownNode
import com.eleckoi.android.feature.chat.ui.blocks.markdown.MarkdownDocumentBlock
import com.eleckoi.android.feature.conversation.timeline.model.CreationTimelineItem
import com.eleckoi.android.foundation.design.AppearanceTheme

/**
 * Shared Markdown entry for creation-assistant prose.
 *
 * Ordinary chat and the creation assistant converge on [TextMessageBlock], so parser checkpoints,
 * incomplete-fence behavior and batched streaming semantics cannot drift into separate systems.
 */
@Composable
fun CreationMarkdownText(
    item: CreationTimelineItem,
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
    fontSize: TextUnit = 14.sp,
    lineHeight: TextUnit = 21.sp,
    letterSpacing: TextUnit = 0.sp,
    paragraphSpacing: Float = 8f,
    streamUntilTurnCompletes: Boolean = false,
    showPlainTextWhilePreparing: Boolean = true,
) {
    if (item.failed) {
        Text(
            text = item.text,
            modifier = modifier,
            color = Color(0xFFD84A4A),
            fontSize = fontSize,
            lineHeight = lineHeight,
            letterSpacing = letterSpacing,
        )
        return
    }

    val markdownStreaming = creationNarrativeMarkdownStreaming(
        itemRunning = item.running,
        streamUntilTurnCompletes = streamUntilTurnCompletes,
    )
    // The conversation list already follows the measured streaming tail. A second size spring on
    // the Markdown owner accumulates positive velocity while tokens arrive; at terminal it can
    // report almost twice the child's real height for several frames and push all prose below the
    // composer. Ordinary role chat has no nested body spring, so creation Markdown follows the
    // same single-owner geometry rule and publishes its real measured size directly.
    val textModifier = modifier

    val containsVisibleMarkdownSyntax = remember(item.text) {
        containsVisibleCreationMarkdownSyntax(item.text)
    }
    val showPreparationFallback = shouldShowCreationMarkdownPreparationFallback(
        showPlainTextWhilePreparing = showPlainTextWhilePreparing,
        markdownStreaming = markdownStreaming,
        containsVisibleMarkdownSyntax = containsVisibleMarkdownSyntax,
    )
    if (!showPreparationFallback) {
        CreationRichMarkdownText(
            item = item,
            appearance = appearance,
            modifier = textModifier,
            fontSize = fontSize,
            lineHeight = lineHeight,
            letterSpacing = letterSpacing,
            paragraphSpacing = paragraphSpacing,
            streaming = markdownStreaming,
        )
        return
    }

    // Chat Completions can first publish prose as a provisional final answer, then classify that
    // same item as commentary when its tool call arrives. The old body and this process item are
    // different Compose/Markdown owners. Keep an immediately measurable copy visible until the
    // new owner's render plan is ready, otherwise the row becomes zero-height and visibly jumps.
    // The provider can keep the same item id while replacing its text. Readiness belongs to the
    // exact content revision, otherwise an old render plan can suppress the fallback for the new
    // text and leave only the renderer's retained-height spacer on screen.
    var richContentReady by remember(item.id, item.text) { mutableStateOf(false) }
    Box(modifier = textModifier) {
        CreationRichMarkdownText(
            item = item,
            appearance = appearance,
            modifier = Modifier.alpha(if (richContentReady) 1f else 0f),
            fontSize = fontSize,
            lineHeight = lineHeight,
            letterSpacing = letterSpacing,
            paragraphSpacing = paragraphSpacing,
            streaming = markdownStreaming,
            onContentReady = {
                richContentReady = true
            },
        )
        if (!richContentReady) {
            Text(
                text = item.text,
                color = appearance.mobileChatMessageFg,
                fontSize = fontSize,
                lineHeight = lineHeight,
                letterSpacing = letterSpacing,
            )
        }
    }
}

fun shouldShowCreationMarkdownPreparationFallback(
    showPlainTextWhilePreparing: Boolean,
    markdownStreaming: Boolean,
    containsVisibleMarkdownSyntax: Boolean,
): Boolean = showPlainTextWhilePreparing &&
    !markdownStreaming &&
    !containsVisibleMarkdownSyntax

/**
 * The preparation fallback is only safe when Markdown and plain text are visually identical.
 * Showing a raw formatted document, even for one recomposition after a LazyColumn item is reused,
 * exposes fences and emphasis markers as if the assistant had sent broken content.
 */
fun containsVisibleCreationMarkdownSyntax(markdown: String): Boolean {
    if (
        markdown.contains("```") ||
        markdown.contains("~~~") ||
        markdown.contains('`') ||
        markdown.contains("**") ||
        markdown.contains("__") ||
        markdown.contains("~~") ||
        markdown.contains("](") ||
        markdown.contains('|') ||
        markdown.contains('$') ||
        markdown.hasPairedMarkdownDelimiter('*') ||
        markdown.hasPairedMarkdownDelimiter('_') ||
        (markdown.contains('<') && markdown.contains('>'))
    ) {
        return true
    }
    return markdown.lineSequence().any { rawLine ->
        val line = rawLine.trimStart()
        rawLine.startsWith("    ") ||
            rawLine.startsWith('\t') ||
            line.isMarkdownHeading() ||
            line.startsWith('>') ||
            (line.startsWith('[') && line.contains("]:")) ||
            line.isMarkdownUnorderedListItem() ||
            line.isMarkdownOrderedListItem() ||
            line.isMarkdownHorizontalRule()
    }
}

private fun String.hasPairedMarkdownDelimiter(delimiter: Char): Boolean {
    val first = indexOf(delimiter)
    return first >= 0 && indexOf(delimiter, startIndex = first + 1) > first
}

private fun String.isMarkdownHeading(): Boolean {
    val markerEnd = indexOfFirst { it != '#' }
    return markerEnd in 1..6 && getOrNull(markerEnd)?.isWhitespace() == true
}

private fun String.isMarkdownUnorderedListItem(): Boolean =
    length >= 2 && (first() == '-' || first() == '+' || first() == '*') && this[1].isWhitespace()

private fun String.isMarkdownOrderedListItem(): Boolean {
    val markerIndex = indexOfFirst { !it.isDigit() }
    val marker = getOrNull(markerIndex)
    if (markerIndex <= 0 || (marker != '.' && marker != ')')) return false
    return getOrNull(markerIndex + 1)?.isWhitespace() == true
}

private fun String.isMarkdownHorizontalRule(): Boolean {
    val compact = filterNot { it.isWhitespace() }
    return compact.length >= 3 && compact.all {
        it == '-' || it == '_' || it == '*' || it == '='
    }
}

@Composable
private fun CreationRichMarkdownText(
    item: CreationTimelineItem,
    appearance: AppearanceTheme,
    modifier: Modifier,
    fontSize: TextUnit,
    lineHeight: TextUnit,
    letterSpacing: TextUnit,
    paragraphSpacing: Float,
    streaming: Boolean,
    onContentReady: () -> Unit = {},
) {
    TextMessageBlock(
        content = item.text,
        appearance = appearance,
        isUser = false,
        modifier = modifier,
        fontSize = fontSize,
        lineHeight = lineHeight,
        letterSpacing = letterSpacing,
        paragraphSpacing = paragraphSpacing,
        contentKey = "creation-markdown:${item.id}",
        streaming = streaming,
        messageContainerVisible = false,
        visualGeneration = 0,
        onContentReady = onContentReady,
        cacheOwnerKey = "creation:${item.id}",
    )
}

fun creationNarrativeMarkdownStreaming(
    itemRunning: Boolean,
    streamUntilTurnCompletes: Boolean,
): Boolean = itemRunning || streamUntilTurnCompletes

/** One completed top-level Markdown node promoted to its own stable LazyColumn item. */
@Composable
fun CreationMarkdownNode(
    item: CreationTimelineItem,
    node: MarkdownNode,
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
) {
    MarkdownDocumentBlock(
        nodes = listOf(node),
        appearance = appearance,
        isUser = false,
        modifier = modifier,
        fontSize = 14.sp,
        lineHeight = 21.sp,
        letterSpacing = 0.sp,
        paragraphSpacing = 8f,
        messageContainerVisible = false,
        streaming = false,
        visualGeneration = 0,
        onContentReady = {},
        onRevealComplete = {},
        cacheOwnerKey = "creation:${item.id}:node:${node.id}",
        sourceHash = node.source.hashCode(),
        sourceLength = node.source.length,
    )
}

