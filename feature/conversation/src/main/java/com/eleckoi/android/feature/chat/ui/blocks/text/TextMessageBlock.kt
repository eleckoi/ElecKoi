package com.eleckoi.android.feature.chat.ui.blocks.text

import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.AppearanceTheme

@Composable
fun TextMessageBlock(
    content: String,
    appearance: AppearanceTheme,
    isUser: Boolean,
    modifier: Modifier = Modifier,
    fontSize: TextUnit = 17.sp,
    lineHeight: TextUnit = 24.sp,
    letterSpacing: TextUnit = 0.sp,
    paragraphSpacing: Float = 10f,
    contentKey: String = "text-message",
    streaming: Boolean = false,
    messageContainerVisible: Boolean = false,
    visualGeneration: Int = 0,
    onContentReady: () -> Unit = {},
    onRevealComplete: () -> Unit = {},
    cacheOwnerKey: String = contentKey,
) {
    key(contentKey, visualGeneration) {
        RichMarkdownBlock(
            markdown = content,
            appearance = appearance,
            isUser = isUser,
            modifier = modifier,
            fontSize = fontSize,
            lineHeight = lineHeight,
            letterSpacing = letterSpacing,
            paragraphSpacing = paragraphSpacing,
            streaming = streaming,
            messageContainerVisible = messageContainerVisible,
            visualGeneration = visualGeneration,
            onContentReady = onContentReady,
            onRevealComplete = onRevealComplete,
            cacheOwnerKey = cacheOwnerKey,
        )
    }
}
