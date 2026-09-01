package com.eleckoi.android.feature.chat.ui.blocks.markdown.render.code

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.components.AppIconPaths
import com.eleckoi.android.foundation.design.components.StrokeSvgIcon
import com.eleckoi.android.feature.chat.model.markdown.MarkdownCodeContent
import com.eleckoi.android.feature.preferences.ChatCodeBlockStyle

@Composable
internal fun MarkdownCodeBlock(
    code: MarkdownCodeContent,
    style: ChatCodeBlockStyle,
    color: Color,
    dark: Boolean,
    background: Color,
    headerBackground: Color,
    borderColor: Color,
    gutterColor: Color,
    fontSize: TextUnit,
    lineHeight: TextUnit,
    letterSpacing: TextUnit,
    wrapLines: Boolean,
    showAll: Boolean,
    streaming: Boolean,
    copyEnabled: Boolean,
) {
    val copyCode = rememberCopyCodeAction(code)
    when (style) {
        ChatCodeBlockStyle.Simple -> SimpleCodeBlock(
            code = code,
            color = color,
            background = background,
            borderColor = borderColor,
            fontSize = fontSize,
            lineHeight = lineHeight,
            letterSpacing = letterSpacing,
            wrapLines = wrapLines,
            showAll = showAll,
            streaming = streaming,
            copyEnabled = copyEnabled,
            onCopy = copyCode,
        )

        ChatCodeBlockStyle.Workbench -> WorkbenchCodeBlock(
            code = code,
            color = color,
            dark = dark,
            background = background,
            headerBackground = headerBackground,
            borderColor = borderColor,
            gutterColor = gutterColor,
            fontSize = fontSize,
            lineHeight = lineHeight,
            letterSpacing = letterSpacing,
            wrapLines = wrapLines,
            showAll = showAll,
            streaming = streaming,
            copyEnabled = copyEnabled,
            onCopy = copyCode,
        )
    }
}

@Composable
private fun SimpleCodeBlock(
    code: MarkdownCodeContent,
    color: Color,
    background: Color,
    borderColor: Color,
    fontSize: TextUnit,
    lineHeight: TextUnit,
    letterSpacing: TextUnit,
    wrapLines: Boolean,
    showAll: Boolean,
    streaming: Boolean,
    copyEnabled: Boolean,
    onCopy: () -> Unit,
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = background,
        border = BorderStroke(Dp.Hairline, borderColor),
        shape = RoundedCornerShape(6.dp),
    ) {
        Box {
            Box(Modifier.padding(horizontal = 12.dp, vertical = 11.dp)) {
                CanvasCodeViewport(
                    code = code,
                    color = color,
                    dark = true,
                    gutterColor = Color.Transparent,
                    gutterDividerColor = Color.Transparent,
                    showLineNumbers = false,
                    syntaxColorScheme = CodeSyntaxColorScheme.Bright,
                    fontSize = fontSize * 0.92f,
                    lineHeight = lineHeight,
                    letterSpacing = letterSpacing,
                    wrapLines = wrapLines,
                    showAll = showAll,
                    streaming = streaming,
                )
            }
            if (copyEnabled) {
                CopyCodeButton(
                    color = color.copy(alpha = 0.62f),
                    compact = true,
                    onCopy = onCopy,
                    modifier = Modifier.align(Alignment.TopEnd),
                )
            }
        }
    }
}

@Composable
private fun WorkbenchCodeBlock(
    code: MarkdownCodeContent,
    color: Color,
    dark: Boolean,
    background: Color,
    headerBackground: Color,
    borderColor: Color,
    gutterColor: Color,
    fontSize: TextUnit,
    lineHeight: TextUnit,
    letterSpacing: TextUnit,
    wrapLines: Boolean,
    showAll: Boolean,
    streaming: Boolean,
    copyEnabled: Boolean,
    onCopy: () -> Unit,
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = background,
        border = BorderStroke(Dp.Hairline, borderColor),
        shape = RoundedCornerShape(8.dp),
    ) {
        Column {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(headerBackground)
                    .padding(start = 12.dp, end = 6.dp, top = 5.dp, bottom = 5.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = code.language.ifBlank { "代码" },
                    color = color.copy(alpha = 0.66f),
                    fontSize = fontSize * 0.76f,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.weight(1f),
                )
                if (copyEnabled) {
                    CopyCodeButton(
                        color = color.copy(alpha = 0.70f),
                        compact = false,
                        onCopy = onCopy,
                    )
                }
            }
            HorizontalDivider(thickness = 1.dp, color = borderColor)
            Column(Modifier.padding(horizontal = 12.dp, vertical = 10.dp)) {
                CanvasCodeViewport(
                    code = code,
                    color = color,
                    dark = dark,
                    gutterColor = gutterColor,
                    gutterDividerColor = borderColor,
                    fontSize = fontSize * 0.92f,
                    lineHeight = lineHeight,
                    letterSpacing = letterSpacing,
                    wrapLines = wrapLines,
                    showAll = showAll,
                    streaming = streaming,
                )
            }
        }
    }
}

@Composable
private fun CopyCodeButton(
    color: Color,
    compact: Boolean,
    onCopy: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .clickable(role = Role.Button, onClick = onCopy)
            .then(
                if (compact) {
                    Modifier
                        .size(44.dp)
                        .semantics { contentDescription = "复制代码" }
                } else {
                    Modifier.padding(horizontal = 7.dp, vertical = 4.dp)
                },
            ),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        StrokeSvgIcon(
            paths = AppIconPaths.Copy,
            color = color,
            modifier = if (compact) {
                Modifier.offset(x = 8.dp, y = (-8).dp)
            } else {
                Modifier
            },
            iconSize = if (compact) 16.dp else 14.dp,
            strokeWidth = 1.8f,
        )
        if (!compact) {
            Text(
                text = "复制",
                color = color,
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.padding(start = 4.dp),
            )
        }
    }
}

@Composable
private fun rememberCopyCodeAction(code: MarkdownCodeContent): () -> Unit {
    val context = LocalContext.current
    val clipboard = remember(context) {
        context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    }
    val copiedText = code.accessibilityText(code.textLength)
    return remember(clipboard, context, copiedText) {
        {
            clipboard.setPrimaryClip(ClipData.newPlainText("ElecKoi code", copiedText))
            Toast.makeText(context, "代码已复制", Toast.LENGTH_SHORT).show()
        }
    }
}
