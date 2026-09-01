package com.eleckoi.android.feature.chat.ui.screen

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import com.eleckoi.android.feature.chat.model.ChatDraft
import com.eleckoi.android.feature.chat.ui.ChatPresentationReadinessState
import com.eleckoi.android.feature.chat.ui.ChatUiState
import com.eleckoi.android.feature.chat.ui.layout.ChatTopBar
import com.eleckoi.android.foundation.design.AppearanceTheme

@Composable
internal fun ChatScreenTopBar(
    state: ChatUiState,
    draft: ChatDraft?,
    roleplay: Boolean,
    appearance: AppearanceTheme,
    effectiveBackgroundPath: String,
    menuExpanded: Boolean,
    onBack: () -> Unit,
    onOpenMenu: () -> Unit,
    onDismissMenu: () -> Unit,
    onCustomizeBackground: () -> Unit,
    onCreateChat: () -> Unit,
) {
    ChatTopBar(
        title = draft?.session?.characterPersona?.assistantName?.ifBlank { "聊天" }
            ?: state.chatCharacterName.ifBlank { "聊天" },
        appearance = appearance,
        onBack = onBack,
        onMore = onOpenMenu,
        moreMenuExpanded = menuExpanded,
        onDismissMoreMenu = onDismissMenu,
        onCustomizeBackground = onCustomizeBackground,
        onCreateChat = onCreateChat,
        effectiveBackgroundPath = effectiveBackgroundPath,
        bandColor = if (roleplay) {
            appearance.mobileSurface.copy(
                alpha = if (state.chatRoleplayCardPanel) 0.96f else 0f,
            )
        } else {
            null
        },
        stableStatusBarInset = roleplay,
    )
}

@Composable
internal fun ChatConversationStateContent(
    state: ChatUiState,
    draft: ChatDraft?,
    showLoadingStatus: Boolean,
    roleplayWebActive: Boolean,
    presentationReadiness: ChatPresentationReadinessState,
    onCreateChat: () -> Unit,
    roleplayContent: @Composable (ChatDraft, Float) -> Unit,
    nativeContent: @Composable (ChatDraft, Float) -> Unit,
) {
    when {
        state.isDraftLoading -> if (showLoadingStatus) {
            ChatCenteredStatus(
                text = "正在加载本地聊天...",
                appearance = state.appearance,
            )
        }

        draft == null -> EmptyChatState(
            hasCharacter = state.chatCharacterId.isNotBlank(),
            appearance = state.appearance,
            onCreateChat = onCreateChat,
        )

        else -> {
            val presentationAlpha by animateFloatAsState(
                targetValue = if (presentationReadiness.revealed) 1f else 0f,
                animationSpec = if (roleplayWebActive) {
                    snap()
                } else if (presentationReadiness.revealed) {
                    tween(durationMillis = 120)
                } else {
                    snap()
                },
                label = "chat-presentation",
            )
            if (roleplayWebActive) {
                roleplayContent(draft, presentationAlpha)
            } else {
                nativeContent(draft, presentationAlpha)
            }
        }
    }
}

@Composable
internal fun ChatComposerBar(
    visible: Boolean,
    roleplayWebActive: Boolean,
    userBrowsedAwayFromBottom: Boolean,
    roleplayWebCanScrollForward: Boolean,
    appearance: AppearanceTheme,
    onJumpToBottom: () -> Unit,
    onComposerHeightChanged: (Int) -> Unit,
    onComposerTopChanged: (Float) -> Unit,
    composer: @Composable (Modifier) -> Unit,
) {
    AnimatedVisibility(
        visible = visible,
        enter = fadeIn(tween(180)),
        exit = fadeOut(tween(100)),
    ) {
        if (roleplayWebActive) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding(),
            ) {
                composer(Modifier.fillMaxWidth())
                if (userBrowsedAwayFromBottom && roleplayWebCanScrollForward) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .padding(end = 16.dp)
                            .offset(
                                y = -(ChatJumpToBottomButtonSize + ChatJumpToBottomButtonGap),
                            ),
                    ) {
                        ChatJumpToBottomButton(
                            appearance = appearance,
                            onClick = onJumpToBottom,
                        )
                    }
                }
            }
        } else {
            composer(
                Modifier
                    .fillMaxWidth()
                    .onSizeChanged { onComposerHeightChanged(it.height) }
                    .onGloballyPositioned { coordinates ->
                        onComposerTopChanged(coordinates.boundsInRoot().top)
                    },
            )
        }
    }
}

@Composable
internal fun BoxScope.ChatNativeJumpToBottom(
    visible: Boolean,
    composerTopPx: Float,
    appearance: AppearanceTheme,
    onClick: () -> Unit,
) {
    val density = LocalDensity.current
    val jumpToBottomTop = with(density) {
        (composerTopPx - ChatJumpToBottomButtonSize.toPx() - ChatJumpToBottomButtonGap.toPx())
            .coerceAtLeast(0f)
            .toDp()
    }
    AnimatedVisibility(
        visible = visible,
        modifier = Modifier
            .align(Alignment.TopEnd)
            .padding(end = 16.dp)
            .offset(y = jumpToBottomTop),
        enter = fadeIn(tween(durationMillis = 180)),
        exit = fadeOut(tween(durationMillis = 140)),
    ) {
        ChatJumpToBottomButton(
            appearance = appearance,
            onClick = onClick,
        )
    }
}
