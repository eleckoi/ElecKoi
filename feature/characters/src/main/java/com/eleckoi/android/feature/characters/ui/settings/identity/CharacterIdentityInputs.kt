package com.eleckoi.android.feature.characters.ui.settings

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.components.focusDismissInputRegion

@Composable
internal fun CharacterNameField(
    name: String,
    fallbackName: String,
    colors: ScrapbookPalette,
    scale: Float,
    onNameChange: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val typeScale = scale / LocalDensity.current.fontScale
    val textMeasurer = rememberTextMeasurer()
    val visibleName = name.ifBlank { fallbackName.ifBlank { "未命名角色" } }
    val focused = remember { mutableStateOf(false) }

    BoxWithConstraints(modifier = modifier) {
        val widthPx = constraints.maxWidth
        val nameSize = remember(visibleName, widthPx, typeScale) {
            (36 downTo 30)
                .asSequence()
                .map { it / 2f }
                .firstOrNull { candidate ->
                    val measured = textMeasurer.measure(
                        text = visibleName,
                        style = TextStyle(
                            fontSize = (candidate * typeScale).sp,
                            lineHeight = (26f * typeScale).sp,
                            fontWeight = FontWeight.Medium,
                            platformStyle = PlatformTextStyle(includeFontPadding = false),
                        ),
                        maxLines = 1,
                        softWrap = false,
                        constraints = Constraints(maxWidth = widthPx),
                    )
                    !measured.didOverflowWidth
                } ?: 15f
        }
        val style = TextStyle(
            color = colors.ink,
            fontSize = (nameSize * typeScale).sp,
            lineHeight = (26f * typeScale).sp,
            fontWeight = FontWeight.Medium,
            platformStyle = PlatformTextStyle(includeFontPadding = false),
        )
        Column(modifier = Modifier.fillMaxSize()) {
            Text(
                text = "角色名称",
                color = colors.label,
                fontSize = (12f * typeScale).sp,
                lineHeight = (18f * typeScale).sp,
            )
            BasicTextField(
                value = name,
                onValueChange = onNameChange,
                modifier = Modifier
                    .fillMaxWidth()
                    .height((44f * scale).dp)
                    .clipToBounds()
                    .drawBehind {
                        val strokePx = ((if (focused.value) 1.5f else 1f) * scale).dp.toPx()
                        drawLine(
                            color = if (focused.value) colors.accent else colors.rule,
                            start = Offset(0f, size.height - strokePx / 2f),
                            end = Offset(size.width, size.height - strokePx / 2f),
                            strokeWidth = strokePx,
                        )
                    }
                    .onFocusChanged { focused.value = it.isFocused }
                    .focusDismissInputRegion()
                    .semantics { contentDescription = "角色名称" },
                textStyle = style,
                cursorBrush = SolidColor(colors.accent),
                singleLine = true,
                decorationBox = { inner ->
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.CenterStart,
                    ) {
                        if (name.isBlank()) {
                            Text(
                                text = visibleName,
                                style = style.copy(color = colors.inkSoft),
                                maxLines = 1,
                            )
                        }
                        inner()
                    }
                },
            )
        }
    }
}
