package com.eleckoi.android.feature.chat.data.markdown

import com.eleckoi.android.feature.chat.model.markdown.MarkdownNode
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * 同一段已完成 Markdown 只允许一个后台解析任务。
 * 长消息的整条临时视图和拆块时间线会等待同一结果，不再各自重复解析。
 */
object CompletedMarkdownDocumentLoader {
    private data class RequestKey(
        val ownerKey: String,
        val markdown: String,
    )

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val inFlight = mutableMapOf<RequestKey, Deferred<List<MarkdownNode>>>()

    suspend fun load(ownerKey: String, markdown: String): List<MarkdownNode> {
        MarkdownDocumentCache.get(ownerKey, markdown)?.let { return it }
        val key = RequestKey(ownerKey = ownerKey, markdown = markdown)
        return obtain(key).await()
    }

    /** Persist a completed reply off the generation path; failures never affect the conversation. */
    fun warm(ownerKey: String, markdown: String) {
        if (markdown.isBlank()) return
        scope.launch { runCatching { load(ownerKey, markdown) } }
    }

    private fun obtain(key: RequestKey): Deferred<List<MarkdownNode>> = synchronized(inFlight) {
        inFlight[key]?.let { return@synchronized it }

        val created = scope.async(start = CoroutineStart.LAZY) {
            MarkdownDocumentCache.get(key.ownerKey, key.markdown) ?: run {
                // Every completed document is rebuildable performance data. Persisting its AST at
                // completion removes parsing from the next-open path; width/theme layout stays out.
                val persist = key.markdown.isNotBlank()
                val restored = if (persist) {
                    withContext(Dispatchers.IO) {
                        MarkdownDocumentDiskCache.get(key.markdown)
                    }
                } else null
                if (restored != null) {
                    MarkdownDocumentCache.put(key.ownerKey, key.markdown, restored)
                    restored
                } else {
                    val parsed = MarkdownDocumentAssembler(key.ownerKey).use { assembler ->
                        assembler.update(markdown = key.markdown, streaming = false)
                    }
                    MarkdownDocumentCache.put(key.ownerKey, key.markdown, parsed)
                    if (persist) {
                        withContext(Dispatchers.IO) {
                            MarkdownDocumentDiskCache.put(key.markdown, parsed)
                        }
                    }
                    parsed
                }
            }
        }
        inFlight[key] = created
        created.invokeOnCompletion {
            synchronized(inFlight) {
                if (inFlight[key] === created) inFlight.remove(key)
            }
        }
        created.start()
        created
    }
}

/**
 * Completed documents that can become visually huge must be promoted to stable LazyColumn blocks.
 * Mermaid is included independently of source length because a short graph can occupy many screens.
 */
fun shouldSplitCompletedMarkdown(markdown: String): Boolean =
    markdown.length >= LongCompletedMarkdownThreshold ||
        markdown.hasAtLeastVisualLines(TallCompletedMarkdownLineThreshold) ||
        markdown.containsMermaidFence()

/**
 * 字符数不能代表实际高度：大量短行、列表或表格即使不足 8 千字，也可能铺满十几屏。
 * 这里只数换行，不做第二次 Markdown 解析；达到阈值后再交给后台解析器按稳定块拆分。
 */
private fun String.hasAtLeastVisualLines(threshold: Int): Boolean {
    if (isEmpty()) return false
    var lines = 1
    for (character in this) {
        if (character == '\n' && ++lines >= threshold) return true
    }
    return false
}

private fun String.containsMermaidFence(): Boolean =
    contains("```mermaid", ignoreCase = true) ||
        contains("~~~mermaid", ignoreCase = true)

private const val LongCompletedMarkdownThreshold = 8_000
private const val TallCompletedMarkdownLineThreshold = 96
