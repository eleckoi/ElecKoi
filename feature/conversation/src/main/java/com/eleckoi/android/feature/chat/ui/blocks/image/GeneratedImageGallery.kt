package com.eleckoi.android.feature.chat.ui.blocks.image

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.selection.DisableSelection
import androidx.compose.ui.Alignment
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.eleckoi.android.feature.chat.model.ChatImageAttachment
import com.eleckoi.android.foundation.design.AppearanceTheme

/** Renders one full story illustration or a compact grid created by adjacent IMAGE markers. */
@Composable
internal fun GeneratedImageGallery(
    attachments: List<ChatImageAttachment>,
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
    onRegenerate: ((String) -> Unit)? = null,
    onContentReady: (String) -> Unit = {},
) {
    if (attachments.isEmpty()) return
    // Assistant prose is selectable, but an image gallery is an interactive surface with its own
    // long-press menu and popup/dialog children. Letting the message row's SelectionContainer
    // register the gallery text makes the system copy toolbar race the image menu and can leave a
    // selection anchored to a disposed popup hierarchy.
    DisableSelection {
        if (attachments.size == 1) {
            val attachment = attachments.single()
            Box(
                modifier = modifier.fillMaxWidth(),
                contentAlignment = Alignment.Center,
            ) {
                GeneratedImageBlock(
                    attachment = attachment,
                    appearance = appearance,
                    modifier = Modifier.fillMaxWidth(attachment.inlineWidthFraction()),
                    compact = attachment.frameCount > 1,
                    onRegenerate = onRegenerate?.let { regenerate ->
                        { regenerate(attachment.id) }
                    },
                    onContentReady = { onContentReady(attachment.id) },
                )
            }
        } else {
            val columns = when (attachments.size) {
                2, 4 -> 2
                else -> 3
            }
            Column(
                modifier = modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(GridGap),
            ) {
                attachments.chunked(columns).forEach { rowAttachments ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(GridGap),
                    ) {
                        rowAttachments.forEach { attachment ->
                            key(attachment.id, attachment.status, attachment.localPath) {
                                GeneratedImageBlock(
                                    attachment = attachment,
                                    appearance = appearance,
                                    modifier = Modifier.weight(1f),
                                    compact = true,
                                    onRegenerate = onRegenerate?.let { regenerate ->
                                        { regenerate(attachment.id) }
                                    },
                                    onContentReady = { onContentReady(attachment.id) },
                                )
                            }
                        }
                        repeat(columns - rowAttachments.size) {
                            Spacer(modifier = Modifier.weight(1f))
                        }
                    }
                }
            }
        }
    }
}

private val GridGap = 4.dp
