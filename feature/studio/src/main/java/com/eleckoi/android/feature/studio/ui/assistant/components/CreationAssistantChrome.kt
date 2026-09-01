package com.eleckoi.android.feature.studio.ui.assistant.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.FolderOpen
import androidx.compose.material.icons.rounded.Menu
import androidx.compose.material.icons.rounded.Publish
import androidx.compose.material.icons.rounded.Save
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.components.DshIconPaths
import com.eleckoi.android.foundation.design.components.FilledSvgIcon

@Composable
internal fun CreationHeader(
    appearance: AppearanceTheme,
    showBack: Boolean,
    editorOpen: Boolean,
    canOpenFiles: Boolean,
    canPreview: Boolean,
    canPublish: Boolean,
    isPublishing: Boolean,
    onExit: () -> Unit,
    onNavigation: () -> Unit,
    onFiles: () -> Unit,
    onPreview: () -> Unit,
    onPublish: () -> Unit,
    onNewConversation: () -> Unit,
    onSave: () -> Unit,
    fileDirty: Boolean,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(48.dp)
            .background(appearance.mobileSurface)
            .padding(horizontal = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (!showBack) {
            IconButton(onClick = onExit) {
                Icon(
                    imageVector = Icons.AutoMirrored.Rounded.ArrowBack,
                    contentDescription = "返回",
                    tint = appearance.mobileText.copy(alpha = 0.84f),
                )
            }
        }
        IconButton(onClick = onNavigation) {
            Icon(
                imageVector = if (showBack) {
                    Icons.AutoMirrored.Rounded.ArrowBack
                } else {
                    Icons.Rounded.Menu
                },
                contentDescription = if (showBack) "返回" else "打开项目侧栏",
                tint = appearance.mobileText,
            )
        }
        Spacer(Modifier.weight(1f))
        if (editorOpen) {
            IconButton(onClick = onSave, enabled = fileDirty) {
                Icon(
                    Icons.Rounded.Save,
                    contentDescription = "保存文件",
                    tint = if (fileDirty) {
                        appearance.mobileBlue
                    } else {
                        appearance.mobileMuted.copy(alpha = 0.45f)
                    },
                )
            }
        } else {
            if (canOpenFiles) {
                IconButton(onClick = onFiles) {
                    Icon(
                        Icons.Rounded.FolderOpen,
                        contentDescription = "项目文件",
                        tint = appearance.mobileText,
                    )
                }
            }
            if (canPreview) {
                IconButton(onClick = onPreview) {
                    Icon(
                        Icons.Rounded.Visibility,
                        contentDescription = "网页预览",
                        tint = appearance.mobileText,
                    )
                }
                if (canPublish) {
                    IconButton(onClick = onPublish, enabled = !isPublishing) {
                        if (isPublishing) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(21.dp),
                                strokeWidth = 2.dp,
                                color = appearance.mobileBlue,
                            )
                        } else {
                            Icon(
                                Icons.Rounded.Publish,
                                contentDescription = "发布为沉浸前端",
                                tint = appearance.mobileBlue,
                            )
                        }
                    }
                }
            }
            IconButton(onClick = onNewConversation, enabled = canOpenFiles) {
                FilledSvgIcon(
                    paths = DshIconPaths.NewChat,
                    color = if (canOpenFiles) appearance.mobileText else appearance.mobileSoft,
                    iconSize = 26.dp,
                    viewportSize = DshIconPaths.Viewport16,
                    modifier = Modifier.semantics { contentDescription = "新建对话" },
                )
            }
        }
    }
}

@Composable
internal fun EmptyCreationWorkspace(
    appearance: AppearanceTheme,
    onOpenDrawer: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 28.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Icon(
                Icons.Rounded.AutoAwesome,
                contentDescription = null,
                modifier = Modifier.size(31.dp),
                tint = appearance.mobileSoft,
            )
            Text(
                "从侧栏选择或新建一段对话",
                modifier = Modifier.clickable(onClick = onOpenDrawer),
                color = appearance.mobileText,
                fontSize = 16.sp,
                fontWeight = FontWeight.Medium,
            )
        }
    }
}

@Composable
internal fun LoadingWorkspace(
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier.fillMaxWidth(),
        contentAlignment = Alignment.Center,
    ) {
        CircularProgressIndicator(
            modifier = Modifier.size(28.dp),
            strokeWidth = 2.dp,
            color = appearance.mobileBlue,
        )
    }
}
