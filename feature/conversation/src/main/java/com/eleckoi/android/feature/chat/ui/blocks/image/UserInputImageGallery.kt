package com.eleckoi.android.feature.chat.ui.blocks.image

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.eleckoi.android.feature.chat.model.ChatUserImageAttachment
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.components.noRippleClickable
import java.io.File

@Composable
fun UserInputImageGallery(
    images: List<ChatUserImageAttachment>,
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
    compact: Boolean = false,
    onRemove: ((String) -> Unit)? = null,
) {
    if (images.isEmpty()) return
    BoxWithConstraints(modifier = modifier) {
        val targetImageSize = when {
            compact -> 72.dp
            images.size == 1 -> 220.dp
            else -> 152.dp
        }
        val imageSize = targetImageSize.coerceAtMost(maxWidth)
        if (images.size == 1) {
            UserInputImageThumbnail(
                image = images.first(),
                imageSize = imageSize,
                compact = compact,
                appearance = appearance,
                onRemove = onRemove,
            )
        } else {
            LazyRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                contentPadding = PaddingValues(horizontal = if (compact) 1.dp else 0.dp),
            ) {
                items(images, key = ChatUserImageAttachment::id) { image ->
                    UserInputImageThumbnail(
                        image = image,
                        imageSize = imageSize,
                        compact = compact,
                        appearance = appearance,
                        onRemove = onRemove,
                    )
                }
            }
        }
    }
}

@Composable
private fun UserInputImageThumbnail(
    image: ChatUserImageAttachment,
    imageSize: Dp,
    compact: Boolean,
    appearance: AppearanceTheme,
    onRemove: ((String) -> Unit)?,
) {
    val overlap = if (onRemove == null) 0.dp else 4.dp
    Box(modifier = Modifier.size(imageSize + overlap)) {
        AsyncImage(
            model = File(image.localPath),
            contentDescription = image.displayName.ifBlank { "用户发送的图片" },
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .align(Alignment.BottomStart)
                .size(imageSize)
                .clip(RoundedCornerShape(if (compact) 12.dp else 16.dp))
                .background(appearance.mobileSearchBg),
        )
        if (onRemove != null) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .size(48.dp)
                    .noRippleClickable { onRemove(image.id) }
                    .semantics {
                        role = Role.Button
                        contentDescription = "移除图片"
                    },
                contentAlignment = Alignment.TopEnd,
            ) {
                Box(
                    modifier = Modifier
                        .size(24.dp)
                        .clip(CircleShape)
                        .background(Color.Black.copy(alpha = 0.64f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Close,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(16.dp),
                    )
                }
            }
        }
    }
}
