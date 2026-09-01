package com.eleckoi.android.foundation.design.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.selectionPalette
import java.io.File

@Composable
fun AvatarCircle(
    name: String,
    size: Int,
    fontSize: Int,
    appearance: AppearanceTheme,
    avatarPath: String = "",
    modifier: Modifier = Modifier,
    shape: Shape = CircleShape,
    height: Int = size,
    fallbackImage: Any? = null,
    showInitialWhenEmpty: Boolean = true,
) {
    val selection = appearance.selectionPalette()
    val avatarFile = remember(avatarPath) {
        avatarPath.takeIf { it.isNotBlank() }
            ?.let(::File)
            ?.takeIf { it.exists() }
    }
    Box(
        modifier = modifier
            .size(width = size.dp, height = height.dp)
            .clip(shape)
            .background(selection.activeContainer),
        contentAlignment = Alignment.Center,
    ) {
        val avatarModel = avatarFile ?: fallbackImage
        if (avatarModel != null) {
            AsyncImage(
                model = avatarModel,
                contentDescription = null,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop,
            )
        } else if (showInitialWhenEmpty) {
            Text(
                text = name.firstOrNull()?.toString() ?: "?",
                color = selection.indicator,
                fontSize = fontSize.sp,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}
