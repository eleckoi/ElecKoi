package com.eleckoi.android.feature.chat.ui.blocks.image

import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import com.eleckoi.android.feature.chat.model.ChatImageAttachment
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
internal fun rememberGeneratedImageDownloader(): (ChatImageAttachment) -> Unit {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var pendingDownload by remember { mutableStateOf<File?>(null) }
    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("image/png"),
    ) { uri ->
        val source = pendingDownload
        pendingDownload = null
        if (uri == null || source == null) return@rememberLauncherForActivityResult
        scope.launch(Dispatchers.IO) {
            val result = runCatching {
                context.contentResolver.openOutputStream(uri)?.use { output ->
                    source.inputStream().use { input -> input.copyTo(output) }
                } ?: error("无法打开保存位置")
            }
            withContext(Dispatchers.Main) {
                Toast.makeText(
                    context,
                    if (result.isSuccess) "图片已保存" else result.exceptionOrNull()?.message ?: "图片保存失败",
                    if (result.isSuccess) Toast.LENGTH_SHORT else Toast.LENGTH_LONG,
                ).show()
            }
        }
    }
    return { attachment ->
        val source = attachment.localPath.takeIf(String::isNotBlank)?.let(::File)
        if (source?.isFile != true) {
            Toast.makeText(context, "图片文件不存在", Toast.LENGTH_SHORT).show()
        } else {
            pendingDownload = source
            launcher.launch("ElecKoi-${attachment.frameIndex}-${System.currentTimeMillis()}.png")
        }
    }
}
