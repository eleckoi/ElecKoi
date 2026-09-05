package com.eleckoi.android.feature.chat.data.markdown

import com.eleckoi.android.feature.chat.model.markdown.MarkdownBlockType
import com.eleckoi.android.feature.chat.model.markdown.MarkdownCodeContent
import com.eleckoi.android.feature.chat.model.markdown.MarkdownCodeHighlightSpan
import com.eleckoi.android.feature.chat.model.markdown.MarkdownInlineSegment
import com.eleckoi.android.feature.chat.model.markdown.MarkdownNode
import com.eleckoi.android.feature.chat.model.markdown.MarkdownTableAlignment
import com.eleckoi.android.feature.chat.model.markdown.MarkdownTableCell
import com.eleckoi.android.feature.chat.model.markdown.MarkdownTableContent
import com.eleckoi.android.feature.chat.model.markdown.MarkdownTableRow
import com.eleckoi.android.foundation.serialization.ElecKoiJson
import com.eleckoi.android.foundation.storage.deleteOwnedDirectory
import java.io.File
import java.security.MessageDigest
import java.util.zip.GZIPInputStream
import java.util.zip.GZIPOutputStream
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString

/**
 * Versioned, rebuildable cache for completed long Markdown documents.
 *
 * This intentionally lives under Android's cache directory rather than Room: chat data remains
 * authoritative, while parser snapshots may be deleted by Android or invalidated by a version bump.
 */
object MarkdownDocumentDiskCache {
    @Volatile
    private var directory: File? = null

    @Synchronized
    fun initialize(cacheDirectory: File) {
        directory = File(cacheDirectory, CacheDirectoryName)
    }

    @Synchronized
    fun get(markdown: String): List<MarkdownNode>? {
        val root = directory ?: return null
        val sourceHash = markdown.sha256()
        val file = File(root, "$sourceHash.json.gz")
        if (!file.isFile || file.length() !in 1..MaxCompressedEntryBytes) return null
        val snapshot = runCatching {
            GZIPInputStream(file.inputStream().buffered()).bufferedReader(Charsets.UTF_8).use { reader ->
                ElecKoiJson.decodeFromString<MarkdownDocumentSnapshot>(reader.readText())
            }
        }.getOrElse {
            file.delete()
            return null
        }
        if (
            snapshot.formatVersion != SnapshotFormatVersion ||
            snapshot.sourceSha256 != sourceHash ||
            snapshot.sourceLength != markdown.length
        ) {
            file.delete()
            return null
        }
        return runCatching { snapshot.nodes.map(MarkdownNodeSnapshot::toDomain) }
            .onSuccess { file.setLastModified(System.currentTimeMillis()) }
            .getOrElse {
                file.delete()
                null
            }
    }

    @Synchronized
    fun put(markdown: String, nodes: List<MarkdownNode>) {
        if (markdown.isBlank() || nodes.isEmpty()) return
        val root = directory ?: return
        if (!root.exists() && !root.mkdirs()) return
        val sourceHash = markdown.sha256()
        val destination = File(root, "$sourceHash.json.gz")
        if (destination.isFile) {
            destination.setLastModified(System.currentTimeMillis())
            return
        }
        val temporary = File(root, "$sourceHash.${System.nanoTime()}.tmp")
        runCatching {
            val snapshot = MarkdownDocumentSnapshot(
                sourceSha256 = sourceHash,
                sourceLength = markdown.length,
                nodes = nodes.map(MarkdownNodeSnapshot::fromDomain),
            )
            GZIPOutputStream(temporary.outputStream().buffered()).bufferedWriter(Charsets.UTF_8).use { writer ->
                writer.write(ElecKoiJson.encodeToString(snapshot))
            }
            if (temporary.length() !in 1..MaxCompressedEntryBytes) {
                temporary.delete()
                return
            }
            if (!temporary.renameTo(destination)) {
                temporary.delete()
                return
            }
            trim(root)
        }.onFailure {
            temporary.delete()
        }
    }

    /** Deletes every rebuildable parser snapshot after authoritative chat data is removed. */
    @Synchronized
    fun clear() {
        directory?.let { root -> deleteOwnedDirectory(requireNotNull(root.parentFile), root) }
    }

    private fun trim(root: File) {
        val files = root.listFiles { file -> file.isFile && file.extension == "gz" }
            ?.sortedBy(File::lastModified)
            .orEmpty()
        var totalBytes = files.sumOf(File::length)
        val iterator = files.iterator()
        while (totalBytes > MaxDiskBytes && iterator.hasNext()) {
            val file = iterator.next()
            val length = file.length()
            if (file.delete()) totalBytes -= length
        }
    }
}

@Serializable
private data class MarkdownDocumentSnapshot(
    val formatVersion: Int = SnapshotFormatVersion,
    val sourceSha256: String,
    val sourceLength: Int,
    val nodes: List<MarkdownNodeSnapshot>,
)

@Serializable
private data class MarkdownNodeSnapshot(
    val id: String,
    val type: String,
    val source: String,
    val start: Int,
    val end: Int,
    val metadata: Int,
    val stable: Boolean,
    val inlineSegments: List<MarkdownInlineSegmentSnapshot>,
    val code: MarkdownCodeContentSnapshot?,
    val table: MarkdownTableContentSnapshot?,
) {
    fun toDomain() = MarkdownNode(
        id = id,
        type = MarkdownBlockType.valueOf(type),
        source = source,
        start = start,
        end = end,
        metadata = metadata,
        stable = stable,
        inlineSegments = inlineSegments.map(MarkdownInlineSegmentSnapshot::toDomain),
        code = code?.toDomain(),
        table = table?.toDomain(),
    )

    companion object {
        fun fromDomain(node: MarkdownNode) = MarkdownNodeSnapshot(
            id = node.id,
            type = node.type.name,
            source = node.source,
            start = node.start,
            end = node.end,
            metadata = node.metadata,
            stable = node.stable,
            inlineSegments = node.inlineSegments.map(MarkdownInlineSegmentSnapshot::fromDomain),
            code = node.code?.let(MarkdownCodeContentSnapshot::fromDomain),
            table = node.table?.let(MarkdownTableContentSnapshot::fromDomain),
        )
    }
}

@Serializable
private data class MarkdownInlineSegmentSnapshot(
    val text: String,
    val style: Int,
    val destination: String?,
) {
    fun toDomain() = MarkdownInlineSegment(text = text, style = style, destination = destination)

    companion object {
        fun fromDomain(segment: MarkdownInlineSegment) = MarkdownInlineSegmentSnapshot(
            text = segment.text,
            style = segment.style,
            destination = segment.destination,
        )
    }
}

@Serializable
private data class MarkdownCodeContentSnapshot(
    val language: String,
    val text: String,
    val bodyStart: Int,
    val bodyEnd: Int,
    val highlights: List<MarkdownCodeHighlightSnapshot>,
) {
    fun toDomain(): MarkdownCodeContent = MarkdownCodeContent.indexed(
        language = language,
        source = text,
        bodyStart = bodyStart,
        bodyEnd = bodyEnd,
    ).withHighlights(highlights.map(MarkdownCodeHighlightSnapshot::toDomain))

    companion object {
        fun fromDomain(code: MarkdownCodeContent) = MarkdownCodeContentSnapshot(
            language = code.language,
            text = code.text,
            bodyStart = code.bodyStartOffset,
            bodyEnd = code.bodyEndOffset,
            highlights = code.highlights.map(MarkdownCodeHighlightSnapshot::fromDomain),
        )
    }
}

@Serializable
private data class MarkdownCodeHighlightSnapshot(
    val start: Int,
    val end: Int,
    val lightColorArgb: Int,
    val darkColorArgb: Int,
    val brightColorArgb: Int,
    val fontStyle: Int,
) {
    fun toDomain() = MarkdownCodeHighlightSpan(
        start = start,
        end = end,
        lightColorArgb = lightColorArgb,
        darkColorArgb = darkColorArgb,
        brightColorArgb = brightColorArgb,
        fontStyle = fontStyle,
    )

    companion object {
        fun fromDomain(span: MarkdownCodeHighlightSpan) = MarkdownCodeHighlightSnapshot(
            start = span.start,
            end = span.end,
            lightColorArgb = span.lightColorArgb,
            darkColorArgb = span.darkColorArgb,
            brightColorArgb = span.brightColorArgb,
            fontStyle = span.fontStyle,
        )
    }
}

@Serializable
private data class MarkdownTableContentSnapshot(
    val alignments: List<String>,
    val rows: List<MarkdownTableRowSnapshot>,
) {
    fun toDomain() = MarkdownTableContent(
        alignments = alignments.map(MarkdownTableAlignment::valueOf),
        rows = rows.map(MarkdownTableRowSnapshot::toDomain),
    )

    companion object {
        fun fromDomain(table: MarkdownTableContent) = MarkdownTableContentSnapshot(
            alignments = table.alignments.map { alignment -> alignment.name },
            rows = table.rows.map(MarkdownTableRowSnapshot::fromDomain),
        )
    }
}

@Serializable
private data class MarkdownTableRowSnapshot(
    val header: Boolean,
    val cells: List<MarkdownTableCellSnapshot>,
) {
    fun toDomain() = MarkdownTableRow(
        header = header,
        cells = cells.map(MarkdownTableCellSnapshot::toDomain),
    )

    companion object {
        fun fromDomain(row: MarkdownTableRow) = MarkdownTableRowSnapshot(
            header = row.header,
            cells = row.cells.map(MarkdownTableCellSnapshot::fromDomain),
        )
    }
}

@Serializable
private data class MarkdownTableCellSnapshot(
    val segments: List<MarkdownInlineSegmentSnapshot>,
) {
    fun toDomain() = MarkdownTableCell(segments.map(MarkdownInlineSegmentSnapshot::toDomain))

    companion object {
        fun fromDomain(cell: MarkdownTableCell) = MarkdownTableCellSnapshot(
            segments = cell.segments.map(MarkdownInlineSegmentSnapshot::fromDomain),
        )
    }
}

private fun String.sha256(): String = MessageDigest.getInstance("SHA-256")
    .digest(toByteArray(Charsets.UTF_8))
    .joinToString(separator = "") { byte -> "%02x".format(byte) }

private const val SnapshotFormatVersion = 4
private const val CacheDirectoryName = "markdown-documents-v3"
private const val MaxDiskBytes = 128L * 1024L * 1024L
private const val MaxCompressedEntryBytes = 16L * 1024L * 1024L
