package com.eleckoi.android.feature.chat.ui.blocks.markdown.layout

import android.text.StaticLayout
import androidx.compose.runtime.Immutable
import com.eleckoi.android.feature.chat.model.markdown.MarkdownCodeContent
import com.eleckoi.android.feature.chat.model.markdown.MarkdownNode

internal data class MarkdownRenderPlanKey(
    val cacheOwnerKey: String,
    val nodes: List<MarkdownNode>,
    val widthPx: Int,
    val textColorArgb: Int,
    val quoteColorArgb: Int,
    val inlineColors: MarkdownInlineColorPalette,
    val fontSizeBits: Int,
    val lineHeightBits: Int,
    val letterSpacingBits: Int,
    // Every StaticLayout in the plan has the typeface measured into it, so a plan built under one
    // font is wrong under the next.
    val typefaceRevision: Int,
)

/** Colours applied to semantic inline Markdown ranges before a StaticLayout is cached. */
@Immutable
internal data class MarkdownInlineColorPalette(
    val italicArgb: Int,
    val underlineArgb: Int,
    val quoteArgb: Int,
    val inlineCodeArgb: Int,
)

@Immutable
internal data class MarkdownRenderPlan(
    val key: MarkdownRenderPlanKey,
    val blocks: List<MarkdownRenderBlock>,
    val characterWeight: Int,
    val accessibilityText: String,
)

@Immutable
internal sealed interface MarkdownRenderBlock {
    val id: String

    @Immutable
    data class Text(
        override val id: String,
        val layout: StaticLayout,
        val drawWidthPx: Int,
        val links: List<MarkdownLinkRange>,
        val inlineCodeRanges: List<MarkdownInlineCodeRange>,
    ) : MarkdownRenderBlock

    @Immutable
    data class Code(
        override val id: String,
        val content: MarkdownCodeContent,
        val copyEnabled: Boolean,
    ) : MarkdownRenderBlock

    @Immutable
    data class Table(
        override val id: String,
        val rows: List<List<MarkdownTableCellLayout>>,
        val headerRows: BooleanArray,
        val columnWidthsPx: IntArray,
        val rowHeightsPx: IntArray,
        val rowOffsetsPx: IntArray,
        val rowPaddingPx: Float,
    ) : MarkdownRenderBlock

    @Immutable
    data class Latex(
        override val id: String,
        val expression: String,
    ) : MarkdownRenderBlock

    @Immutable
    data class Mermaid(
        override val id: String,
        val source: String,
    ) : MarkdownRenderBlock

    @Immutable
    data class Rule(override val id: String) : MarkdownRenderBlock
}

@Immutable
internal data class MarkdownLinkRange(
    val start: Int,
    val end: Int,
    val destination: String,
)

@Immutable
internal data class MarkdownInlineCodeRange(
    val start: Int,
    val end: Int,
    val backgroundColorArgb: Int,
)

@Immutable
internal data class MarkdownTableCellLayout(
    val layout: StaticLayout,
    val links: List<MarkdownLinkRange>,
    val inlineCodeRanges: List<MarkdownInlineCodeRange>,
)
