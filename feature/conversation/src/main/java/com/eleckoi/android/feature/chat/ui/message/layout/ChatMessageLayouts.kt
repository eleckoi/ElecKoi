package com.eleckoi.android.feature.chat.ui.message

import androidx.compose.foundation.layout.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.eleckoi.android.feature.chat.model.ChatMessage
import com.eleckoi.android.feature.chat.model.ChatOpeningOption
import com.eleckoi.android.feature.preferences.ChatAvatarShape
import com.eleckoi.android.foundation.design.AppearanceTheme

@Composable
internal fun RoleplayMessageLayout(
    message: ChatMessage,
    appearance: AppearanceTheme,
    toolbarController: RoleplayToolbarController,
    avatarSize: Float,
    avatarShape: ChatAvatarShape,
    avatarNameGap: Dp,
    replySpacing: Float,
    cardPanel: Boolean,
    chatAreaInset: Dp,
    isUser: Boolean,
    isOpening: Boolean,
    isFirstInMessage: Boolean,
    openingPagerVisible: Boolean,
    openingOptions: List<ChatOpeningOption>,
    selectedOpeningIndex: Int,
    onSelectOpeningOption: (String) -> Unit,
    onRegenerate: (ChatMessage) -> Unit,
    onEdit: (ChatMessage) -> Unit,
    onCopy: () -> Unit,
    avatar: @Composable () -> Unit,
    nameText: @Composable (Modifier) -> Unit,
    messageBubble: @Composable (Modifier) -> Unit,
) {
    RoleplayTurnContainer(
        cardPanel = cardPanel,
        chatAreaInset = chatAreaInset,
        appearance = appearance,
    ) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
            val avatarLaneWidth = if (openingPagerVisible) {
                maxOf(avatarSize.dp, RoleplayOpeningPagerMinWidth)
            } else {
                avatarSize.dp
            }
            Column(
                modifier = Modifier.width(avatarLaneWidth),
                horizontalAlignment = Alignment.Start,
            ) {
                if (isFirstInMessage) {
                    avatar()
                } else {
                    Spacer(
                        modifier = Modifier
                            .width(avatarSize.dp)
                            .height(avatarShape.heightFor(avatarSize.dp)),
                    )
                }
                if (openingPagerVisible) {
                    Spacer(modifier = Modifier.height(6.dp))
                    OpeningPageControls(
                        options = openingOptions,
                        selectedIndex = selectedOpeningIndex,
                        appearance = appearance,
                        onSelect = onSelectOpeningOption,
                        compact = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
            Spacer(modifier = Modifier.width(avatarNameGap))
            Column(modifier = Modifier.weight(1f)) {
                if (isFirstInMessage) {
                    val toolsExpanded = toolbarController.titleExpandedMessageId == message.id
                    val toolbarWidth = if (toolsExpanded) {
                        RoleplayToolbarExpandedWidth
                    } else {
                        RoleplayToolbarReservedWidth
                    }
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = RoleplayToolSlotSize),
                    ) {
                        nameText(
                            Modifier
                                .fillMaxWidth()
                                .padding(end = toolbarWidth + RoleplayHeaderToolbarGap),
                        )
                        RoleplayTools(
                            modifier = Modifier.align(Alignment.TopEnd),
                            controller = toolbarController,
                            message = message,
                            appearance = appearance,
                            isUser = isUser,
                            visible = !message.pending,
                            regenerateEnabled = !isOpening,
                            onRegenerate = onRegenerate,
                            onCopy = onCopy,
                            onEdit = { onEdit(message) },
                        )
                    }
                    Spacer(modifier = Modifier.height(replySpacing.coerceIn(0f, 32f).dp))
                }
                messageBubble(Modifier.fillMaxWidth())
            }
        }
    }
}

@Composable
internal fun WideChatMessageLayout(
    isUser: Boolean,
    isFirstInMessage: Boolean,
    avatarNameGap: Dp,
    avatar: @Composable () -> Unit,
    nameText: @Composable (Modifier) -> Unit,
    messageBubble: @Composable (Modifier) -> Unit,
    assistantTools: @Composable () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = if (isUser) Alignment.End else Alignment.Start,
    ) {
        if (isFirstInMessage) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (isUser) {
                    nameText(Modifier)
                    Spacer(modifier = Modifier.width(avatarNameGap))
                    avatar()
                } else {
                    avatar()
                    Spacer(modifier = Modifier.width(avatarNameGap))
                    nameText(Modifier)
                }
            }
            Spacer(modifier = Modifier.height(6.dp))
        }
        messageBubble(Modifier)
        assistantTools()
    }
}

@Composable
internal fun SocialChatMessageLayout(
    isUser: Boolean,
    isFirstInMessage: Boolean,
    avatarSize: Float,
    avatarNameGap: Dp,
    avatar: @Composable () -> Unit,
    messageBubble: @Composable (Modifier) -> Unit,
) {
    val avatarSlotWidth = avatarSize.dp + avatarNameGap
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.Top,
    ) {
        if (!isUser) {
            if (isFirstInMessage) avatar() else Spacer(modifier = Modifier.width(avatarSize.dp))
            Spacer(modifier = Modifier.width(avatarNameGap))
        } else {
            Spacer(modifier = Modifier.width(avatarSlotWidth))
        }
        Box(
            modifier = Modifier.weight(1f),
            contentAlignment = if (isUser) Alignment.TopEnd else Alignment.TopStart,
        ) {
            messageBubble(Modifier)
        }
        if (isUser) {
            Spacer(modifier = Modifier.width(avatarNameGap))
            if (isFirstInMessage) avatar() else Spacer(modifier = Modifier.width(avatarSize.dp))
        } else {
            Spacer(modifier = Modifier.width(avatarSlotWidth))
        }
    }
}
