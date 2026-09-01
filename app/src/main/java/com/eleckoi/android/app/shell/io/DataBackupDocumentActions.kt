package com.eleckoi.android.app.shell

import android.content.Context
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import com.eleckoi.android.app.service.backup.DataBackupService
import kotlinx.coroutines.launch

internal class DataBackupActions(
    val export: () -> Unit,
    val import: () -> Unit,
    val busy: State<Boolean>,
)

@Composable
internal fun rememberDataBackupActions(service: DataBackupService): DataBackupActions {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val currentService by rememberUpdatedState(service)
    var busy by remember { mutableStateOf(false) }
    val busyState = rememberUpdatedState(busy)

    val exportLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/zip"),
    ) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            busy = true
            runCatching { currentService.exportTo(uri) }
                .onSuccess { result ->
                    android.widget.Toast.makeText(
                        context,
                        "备份已导出（${result.characters} 个角色，${result.creatorWorkspaces} 个助手项目）",
                        android.widget.Toast.LENGTH_LONG,
                    ).show()
                }
                .onFailure { error -> showFailure(context, error) }
            busy = false
        }
    }
    val importLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument(),
    ) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            busy = true
            runCatching { currentService.importFrom(uri) }
                .onSuccess { result ->
                    android.widget.Toast.makeText(
                        context,
                        "备份已导入（${result.characters} 个角色，${result.creatorWorkspaces} 个助手项目）",
                        android.widget.Toast.LENGTH_LONG,
                    ).show()
                }
                .onFailure { error -> showFailure(context, error) }
            busy = false
        }
    }
    return remember(exportLauncher, importLauncher, busyState) {
        DataBackupActions(
            export = {
                if (!busyState.value) exportLauncher.launch("ElecKoi-数据备份.zip")
            },
            import = {
                if (!busyState.value) importLauncher.launch(arrayOf("application/zip", "application/octet-stream"))
            },
            busy = busyState,
        )
    }
}

private fun showFailure(context: Context, error: Throwable) {
    android.widget.Toast.makeText(
        context,
        "备份失败：${error.message.orEmpty().ifBlank { "未知错误" }}",
        android.widget.Toast.LENGTH_LONG,
    ).show()
}
