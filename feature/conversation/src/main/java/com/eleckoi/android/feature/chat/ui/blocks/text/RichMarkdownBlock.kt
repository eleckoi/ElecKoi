package com.eleckoi.android.feature.chat.ui.blocks.text

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.TextUnit
import com.eleckoi.android.feature.chat.data.markdown.CompletedMarkdownDocumentLoader
import com.eleckoi.android.feature.chat.data.markdown.MarkdownDocumentAssembler
import com.eleckoi.android.feature.chat.data.markdown.MarkdownDocumentCache
import com.eleckoi.android.feature.chat.data.markdown.MarkdownLiveDocumentHandoffCache
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.feature.chat.model.markdown.MarkdownNode
import com.eleckoi.android.feature.chat.ui.blocks.markdown.MarkdownDocumentBlock
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.conflate
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** The single UI entry point for ElecKoi's native incremental Markdown pipeline. */
@Composable
internal fun RichMarkdownBlock(
    markdown: String,
    appearance: AppearanceTheme,
    isUser: Boolean,
    modifier: Modifier = Modifier,
    fontSize: TextUnit,
    lineHeight: TextUnit,
    letterSpacing: TextUnit,
    paragraphSpacing: Float,
    streaming: Boolean,
    messageContainerVisible: Boolean,
    visualGeneration: Int,
    onContentReady: () -> Unit,
    onRevealComplete: () -> Unit,
    cacheOwnerKey: String,
) {
    val assembler = remember(cacheOwnerKey, visualGeneration) {
        MarkdownDocumentAssembler(cacheOwnerKey)
    }
    val initialCachedNodes = remember(assembler) {
        MarkdownDocumentCache.get(cacheOwnerKey, markdown)
            ?: MarkdownLiveDocumentHandoffCache.get(cacheOwnerKey, markdown)
    }
    var document by remember(assembler) {
        mutableStateOf(initialParsedMarkdownDocument(initialCachedNodes, streaming))
    }
    val parseRequest by rememberUpdatedState(MarkdownParseRequest(markdown, streaming))

    DisposableEffect(assembler) {
        onDispose {
            MarkdownParserDisposer.close(assembler)
        }
    }

    // One ordered worker owns the native incremental session. A fast provider may publish several
    // complete text snapshots while one tail parse is running; conflate keeps only the newest
    // pending snapshot, matching Grok's bounded event drain without ever dropping final content.
    LaunchedEffect(assembler) {
        var hasStreamingParserSession = false
        snapshotFlow { parseRequest }.conflate().collect { request ->
            val cached = if (request.streaming) null else {
                MarkdownDocumentCache.get(cacheOwnerKey, request.markdown)
            }
            val parsed = cached ?: if (!request.streaming && !hasStreamingParserSession) {
                // 冷启动历史与时间线拆块共享这一任务，避免同一长文本被并行解析两遍。
                CompletedMarkdownDocumentLoader.load(cacheOwnerKey, request.markdown)
            } else {
                withContext(Dispatchers.Default) {
                    assembler.update(
                        markdown = request.markdown,
                        streaming = request.streaming,
                    )
                }
            }
            hasStreamingParserSession = request.streaming
            // Publish the matching nodes and streaming phase atomically. During the final native
            // parse, the previous streaming document must not be relabelled as final or it can
            // report visual completion before the final Markdown/render-plan revision exists.
            document = ParsedMarkdownDocument(
                nodes = parsed,
                streaming = request.streaming,
            )
            // The same provider item may move between two Compose slots at terminal. Publish only
            // the newest immutable AST reference so a destination slot can paint the exact rich
            // frame that was already visible while its final parse completes in the background.
            MarkdownLiveDocumentHandoffCache.put(
                ownerKey = cacheOwnerKey,
                markdown = request.markdown,
                nodes = parsed,
            )
        }
    }

    MarkdownDocumentBlock(
        nodes = document.nodes,
        appearance = appearance,
        isUser = isUser,
        modifier = modifier,
        fontSize = fontSize,
        lineHeight = lineHeight,
        letterSpacing = letterSpacing,
        paragraphSpacing = paragraphSpacing,
        messageContainerVisible = messageContainerVisible,
        streaming = document.streaming,
        visualGeneration = visualGeneration,
        onContentReady = onContentReady,
        onRevealComplete = onRevealComplete,
        cacheOwnerKey = cacheOwnerKey,
        sourceHash = markdown.hashCode(),
        sourceLength = markdown.length,
    )
}

internal data class ParsedMarkdownDocument(
    val nodes: List<MarkdownNode>,
    val streaming: Boolean,
)

private data class MarkdownParseRequest(
    val markdown: String,
    val streaming: Boolean,
)

internal fun initialParsedMarkdownDocument(
    cached: List<MarkdownNode>?,
    messageStreaming: Boolean,
): ParsedMarkdownDocument {
    // A cache miss only means that the native Markdown parse is not ready yet. It must not claim
    // the provider-owned reveal timeline or completed history will replay after a process restart.
    return ParsedMarkdownDocument(
        nodes = cached.orEmpty(),
        streaming = messageStreaming,
    )
}

/** Never make navigation wait for a worker that is finishing a native parse. */
private object MarkdownParserDisposer {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    fun close(assembler: MarkdownDocumentAssembler) {
        scope.launch { assembler.close() }
    }
}
