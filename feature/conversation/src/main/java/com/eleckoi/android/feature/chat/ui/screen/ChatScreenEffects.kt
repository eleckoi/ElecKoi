package com.eleckoi.android.feature.chat.ui.screen

import com.eleckoi.android.feature.chat.ui.ChatEffect
import com.eleckoi.android.feature.chat.ui.ChatIntent
import com.eleckoi.android.feature.chat.ui.ChatViewModel

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.pm.ActivityInfo
import android.view.WindowManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.platform.LocalContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

internal class ChatHistoryDocumentActions internal constructor(
    val importHistory: () -> Unit,
)

/**
 * Owns Android document contracts and content-resolver I/O for the native chat page.
 *
 * ChatScreen only requests an import or emits an export effect; URI lifecycles stay at this
 * platform boundary instead of leaking through the conversation rendering tree.
 */
@Composable
internal fun rememberChatHistoryDocumentActions(
    viewModel: ChatViewModel,
): ChatHistoryDocumentActions {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var pendingExportText by remember { mutableStateOf("") }
    val importLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    context.contentResolver.openInputStream(uri)
                        ?.bufferedReader()
                        ?.use { it.readText() }
                        .orEmpty()
                }
            }.onSuccess { text ->
                viewModel.onIntent(ChatIntent.ImportHistoryChats(text))
            }.onFailure { error ->
                viewModel.onIntent(ChatIntent.ReportError(error.message ?: "读取聊天记录失败"))
            }
        }
    }
    val exportLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/json"),
    ) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch(Dispatchers.IO) {
            runCatching {
                context.contentResolver.openOutputStream(uri)
                    ?.bufferedWriter()
                    ?.use { it.write(pendingExportText) }
            }.onFailure { error ->
                viewModel.onIntent(ChatIntent.ReportError(error.message ?: "保存聊天记录失败"))
            }
        }
    }

    LaunchedEffect(viewModel, exportLauncher) {
        viewModel.effects.collect { effect ->
            when (effect) {
                is ChatEffect.ExportHistoryReady -> {
                    pendingExportText = effect.json
                    exportLauncher.launch(effect.fileName)
                }
            }
        }
    }

    return remember(importLauncher) {
        ChatHistoryDocumentActions(
            importHistory = { importLauncher.launch("application/json") },
        )
    }
}

@Composable
internal fun KeepNativeChatWindowUnresized() {
    val context = LocalContext.current
    DisposableEffect(context) {
        val activity = context.findHostActivity()
        val previousSoftInputMode = activity?.window?.attributes?.softInputMode
        activity?.window?.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING)
        onDispose {
            activity?.window?.setSoftInputMode(
                previousSoftInputMode ?: WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE,
            )
        }
    }
}

@Composable
internal fun SyncChatOrientation(allowLandscape: Boolean) {
    val context = LocalContext.current
    val activity = remember(context) { context.findHostActivity() }

    DisposableEffect(activity, allowLandscape) {
        activity?.requestedOrientation = if (allowLandscape) {
            ActivityInfo.SCREEN_ORIENTATION_FULL_USER
        } else {
            ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
        }
        onDispose {
            if (activity?.isChangingConfigurations != true) {
                activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
            }
        }
    }
}

private tailrec fun Context.findHostActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findHostActivity()
    else -> null
}
