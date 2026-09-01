package com.eleckoi.android.feature.chat.ui.blocks.markdown.render.latex

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.LocalContentColor
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.TextUnit
import com.eleckoi.android.feature.chat.ui.blocks.markdown.layout.MarkdownRenderBlock
import com.hrm.latex.renderer.LatexAutoWrap
import com.hrm.latex.renderer.model.LatexConfig

/** Keeps the third-party LaTeX surface isolated from the document coordinator. */
@Composable
internal fun MarkdownLatexBlock(
    block: MarkdownRenderBlock.Latex,
    textColor: Color,
    fontSize: TextUnit,
    retainedLayoutHeightPx: Int? = null,
) {
    val density = LocalDensity.current
    val retainedHeight = retainedLayoutHeightPx
        ?.takeIf { it > 0 }
        ?.let { heightPx -> with(density) { heightPx.toDp() } }

    CompositionLocalProvider(LocalContentColor provides textColor) {
        // LatexAutoWrap parses in its own LaunchedEffect. When a lazy item is recomposed it first
        // reports zero height, then expands after parsing. The retained height belongs to the exact
        // fragment/style/width cache key, so keeping it as a minimum prevents that cold-frame
        // collapse while still allowing the newly parsed formula to grow when necessary.
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .then(
                    if (retainedHeight != null) {
                        Modifier.heightIn(min = retainedHeight)
                    } else {
                        Modifier
                    },
                ),
        ) {
            LatexAutoWrap(
                latex = block.expression,
                modifier = Modifier.fillMaxWidth(),
                config = LatexConfig(fontSize = fontSize),
            )
        }
    }
}
