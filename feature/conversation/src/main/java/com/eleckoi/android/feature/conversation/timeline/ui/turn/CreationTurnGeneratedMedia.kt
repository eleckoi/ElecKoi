package com.eleckoi.android.feature.conversation.timeline.ui.turn

import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.feature.conversation.timeline.CreationTurnUi
import com.eleckoi.android.feature.conversation.timeline.CreatorGeneratedMediaResult

@Composable
fun CreationTurnGeneratedMedia(
    turn: CreationTurnUi,
    workspaceId: String,
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
) {
    if (workspaceId.isNotBlank() && turn.generatedMedia.isNotEmpty()) {
        CreatorGeneratedMediaGallery(
            workspaceId = workspaceId,
            items = turn.generatedMedia,
            appearance = appearance,
            modifier = modifier,
        )
    }
}

@Composable
internal fun CreatorGeneratedMediaGallery(
    workspaceId: String,
    items: List<CreatorGeneratedMediaResult>,
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    Column(modifier = modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items.forEachIndexed { index, item ->
                val previewUri = remember(context.packageName, workspaceId, item.assetId) {
                    Uri.Builder()
                        .scheme("content")
                        .authority("${context.packageName}.creator-media")
                        .appendPath(workspaceId)
                        .appendPath(item.assetId)
                        .build()
                }
                Box(
                    modifier = Modifier
                        .width(224.dp)
                        .clip(RoundedCornerShape(18.dp))
                        .background(appearance.mobileSearchBg)
                        .padding(8.dp),
                ) {
                    AsyncImage(
                        model = previewUri,
                        contentDescription = "候选图 ${index + 1}：${item.displayName}",
                        contentScale = ContentScale.Fit,
                        modifier = Modifier
                            .fillMaxWidth()
                            .aspectRatio(
                                (item.width.toFloat() / item.height.toFloat()).coerceIn(0.6f, 1.5f),
                            )
                            .clip(RoundedCornerShape(13.dp))
                            .background(appearance.mobileSurface),
                    )
                    Text(
                        text = (index + 1).toString(),
                        color = appearance.mobileText,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier
                            .align(Alignment.TopStart)
                            .padding(8.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .background(appearance.mobileSurface.copy(alpha = 0.9f))
                            .padding(horizontal = 8.dp, vertical = 4.dp),
                    )
                }
            }
        }
    }
}
