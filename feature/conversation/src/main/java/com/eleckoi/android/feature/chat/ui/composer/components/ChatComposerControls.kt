package com.eleckoi.android.feature.chat.ui.composer.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.eleckoi.android.feature.chat.ui.composer.ChatPhosphorIcon
import com.eleckoi.android.feature.chat.ui.composer.ChatPhosphorIconPaths
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.components.AppIconPaths
import com.eleckoi.android.foundation.design.components.FilledSvgIcon
import com.eleckoi.android.foundation.design.components.noRippleClickable

@Composable
internal fun ComposerChip(
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    Box(
        modifier = modifier
            .height(30.dp)
            .clip(RoundedCornerShape(999.dp))
            .background(appearance.mobileSearchBg)
            .then(if (onClick != null) Modifier.noRippleClickable(onClick = onClick) else Modifier),
        contentAlignment = Alignment.Center,
    ) {
        content()
    }
}

@Composable
internal fun ComposerCircleButton(
    path: String,
    contentDescription: String,
    appearance: AppearanceTheme,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    filled: Boolean = false,
    bare: Boolean = false,
    enabled: Boolean = true,
) {
    Box(
        modifier = modifier
            .size(34.dp)
            .clip(RoundedCornerShape(999.dp))
            .background(
                when {
                    bare -> Color.Transparent
                    filled -> appearance.mobileText
                    else -> appearance.mobileSearchBg
                },
            )
            .then(if (enabled) Modifier.noRippleClickable(onClick = onClick) else Modifier)
            .semantics { this.contentDescription = contentDescription },
        contentAlignment = Alignment.Center,
    ) {
        ChatPhosphorIcon(
            path = path,
            color = when {
                !enabled -> appearance.mobileSoft
                filled && !bare -> appearance.mobileSurface
                else -> appearance.mobileText
            },
            size = if (bare) 19.dp else 16.dp,
        )
    }
}

@Composable
internal fun ComposerPrimaryActionButton(
    isSending: Boolean,
    stopEnabled: Boolean,
    inputFocused: Boolean,
    hasText: Boolean,
    submitEnabled: Boolean,
    voiceInputEnabled: Boolean,
    appearance: AppearanceTheme,
    onSubmit: () -> Unit,
    onStop: () -> Unit,
    onVoiceInput: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val action = when {
        isSending -> ComposerPrimaryAction.Stop
        inputFocused -> ComposerPrimaryAction.Send
        else -> ComposerPrimaryAction.Voice
    }
    val enabled = when (action) {
        ComposerPrimaryAction.Stop -> stopEnabled
        ComposerPrimaryAction.Send -> hasText && submitEnabled
        ComposerPrimaryAction.Voice -> voiceInputEnabled
    }
    if (action == ComposerPrimaryAction.Voice) {
        ComposerVoiceButton(
            enabled = enabled,
            onClick = onVoiceInput,
            modifier = modifier,
        )
        return
    }
    Box(
        modifier = modifier
            .size(30.dp)
            .then(
                if (enabled) {
                    Modifier.noRippleClickable(
                        onClick = when (action) {
                            ComposerPrimaryAction.Stop -> onStop
                            ComposerPrimaryAction.Send -> onSubmit
                            ComposerPrimaryAction.Voice -> onVoiceInput
                        },
                    )
                } else {
                    Modifier
                },
            )
            .semantics {
                contentDescription = when (action) {
                    ComposerPrimaryAction.Stop -> "停止生成"
                    ComposerPrimaryAction.Send -> "发送"
                    ComposerPrimaryAction.Voice -> "语音输入"
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        when (action) {
            ComposerPrimaryAction.Send -> FilledSvgIcon(
                paths = AppIconPaths.MessageSendPaperPlane,
                color = if (enabled) appearance.mobileText else appearance.mobileSoft,
                iconSize = 23.dp,
                viewportSize = 520f,
            )
            ComposerPrimaryAction.Stop -> ChatPhosphorIcon(
                path = ChatPhosphorIconPaths.Stop,
                color = if (enabled) appearance.mobileText else appearance.mobileSoft,
                size = 14.dp,
            )
            ComposerPrimaryAction.Voice -> Unit
        }
    }
}

private enum class ComposerPrimaryAction { Voice, Send, Stop }

private val ComposerVoiceButtonBackground = Color(0xFF17191D)

@Composable
private fun ComposerVoiceButton(
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .size(34.dp)
            .clip(RoundedCornerShape(999.dp))
            .background(ComposerVoiceButtonBackground)
            .then(if (enabled) Modifier.noRippleClickable(onClick = onClick) else Modifier)
            .semantics { contentDescription = "语音输入" },
        contentAlignment = Alignment.Center,
    ) {
        FilledSvgIcon(
            paths = AppIconPaths.VoiceInputWaveform,
            color = Color.White,
            iconSize = 20.dp,
            viewportSize = 1024f,
        )
    }
}
