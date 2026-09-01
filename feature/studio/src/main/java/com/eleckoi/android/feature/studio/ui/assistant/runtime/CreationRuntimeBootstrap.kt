package com.eleckoi.android.feature.studio.ui.assistant.runtime

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Error
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.engine.workspace.runtime.model.LocalRuntimeHealth
import com.eleckoi.android.engine.workspace.runtime.model.LocalRuntimeState
import com.eleckoi.android.engine.workspace.runtime.model.RuntimeInstallationProgress
import com.eleckoi.android.engine.workspace.runtime.model.RuntimeInstallationStage
import com.eleckoi.android.engine.workspace.runtime.model.RuntimeInstallationState
import com.eleckoi.android.foundation.design.AppearanceTheme

@Composable
internal fun RuntimeBootstrapScreen(
    runtimeState: LocalRuntimeState,
    installationState: RuntimeInstallationState,
    appearance: AppearanceTheme,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val presentation = runtimeBootstrapPresentation(runtimeState, installationState)

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(appearance.mobileBg),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 36.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(13.dp),
        ) {
            if (presentation.showProgress) {
                CircularProgressIndicator(
                    modifier = Modifier.size(30.dp),
                    strokeWidth = 2.4.dp,
                    color = appearance.mobileBlue,
                )
            } else {
                Icon(
                    imageVector = Icons.Rounded.Error,
                    contentDescription = null,
                    modifier = Modifier.size(30.dp),
                    tint = appearance.mobileMuted,
                )
            }
            Text(
                text = presentation.title,
                color = appearance.mobileText,
                fontSize = 17.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = presentation.detail,
                color = appearance.mobileMuted,
                fontSize = 13.sp,
                lineHeight = 19.sp,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
            )
            presentation.actionLabel?.let { actionLabel ->
                TextButton(onClick = onRetry) {
                    Text(actionLabel, color = appearance.mobileBlue)
                }
            }
        }
    }
}

private fun installProgressLabel(progress: RuntimeInstallationProgress): String {
    val stage = when (progress.stage) {
        RuntimeInstallationStage.Checking -> "正在检查存储空间"
        RuntimeInstallationStage.DownloadingRootfs -> "正在校验内置 Ubuntu"
        RuntimeInstallationStage.DownloadingHarness -> "正在校验内置 ${progress.componentId.harnessDisplayName()}"
        RuntimeInstallationStage.DownloadingNode -> "正在下载 Node.js"
        RuntimeInstallationStage.DownloadingPnpm -> "正在下载 pnpm"
        RuntimeInstallationStage.ExtractingRootfs -> "正在部署 Ubuntu"
        RuntimeInstallationStage.ExtractingHarness -> "正在部署 ${progress.componentId.harnessDisplayName()}"
        RuntimeInstallationStage.ExtractingNode -> "正在部署 Node.js"
        RuntimeInstallationStage.ExtractingPnpm -> "正在部署 pnpm"
        RuntimeInstallationStage.ProvisioningPackages -> "正在安装 Python、Git 与网络工具"
        RuntimeInstallationStage.Verifying -> "正在验证本地创作环境"
        RuntimeInstallationStage.Activating -> "正在完成安装"
        RuntimeInstallationStage.Removing -> "正在卸载本地创作环境"
        RuntimeInstallationStage.Cleaning -> "正在清理旧版本与缓存"
    }
    val total = progress.totalBytes
    return if (total != null && total > 0) {
        val percent = (progress.completedBytes * 100 / total).coerceIn(0, 100)
        "$stage · $percent%"
    } else if (progress.processedEntries > 0) {
        "$stage · ${progress.processedEntries} 项"
    } else {
        stage
    }
}

internal data class RuntimeBootstrapPresentation(
    val title: String,
    val detail: String,
    val showProgress: Boolean,
    val actionLabel: String? = null,
)

internal fun runtimeBootstrapPresentation(
    runtimeState: LocalRuntimeState,
    installationState: RuntimeInstallationState,
): RuntimeBootstrapPresentation {
    val capabilities = runtimeState.creationCapabilitiesOrNull()
    val installing = installationState as? RuntimeInstallationState.Installing
    val failureMessage = when {
        installationState is RuntimeInstallationState.Failed -> installationState.message
        runtimeState is LocalRuntimeState.Failed -> runtimeState.message
        else -> null
    }
    val unsupported = capabilities?.health == LocalRuntimeHealth.Unsupported
    val waitingForUserInstall = capabilities?.health == LocalRuntimeHealth.NotInstalled &&
        installationState is RuntimeInstallationState.Idle
    return when {
        unsupported -> RuntimeBootstrapPresentation(
            title = "本地创作环境暂不可用",
            detail = "当前设备暂不支持本地创作环境",
            showProgress = false,
        )
        failureMessage != null -> RuntimeBootstrapPresentation(
            title = "本地创作环境暂不可用",
            detail = failureMessage,
            showProgress = false,
            actionLabel = "重新准备",
        )
        waitingForUserInstall -> RuntimeBootstrapPresentation(
            title = "本地创作环境尚未安装",
            detail = "安装尚未开始。请确认至少有 1.5 GiB 可用空间，然后开始安装。",
            showProgress = false,
            actionLabel = "开始安装",
        )
        installing != null -> RuntimeBootstrapPresentation(
            title = "正在准备本地创作环境",
            detail = installProgressLabel(installing.progress),
            showProgress = true,
        )
        capabilities?.health == LocalRuntimeHealth.NeedsRepair -> RuntimeBootstrapPresentation(
            title = "正在准备本地创作环境",
            detail = "正在恢复本地创作环境",
            showProgress = true,
        )
        else -> RuntimeBootstrapPresentation(
            title = "正在连接本地创作环境",
            detail = "正在读取 Ubuntu 与 Agent Harness 状态",
            showProgress = true,
        )
    }
}

private fun String?.harnessDisplayName(): String = when (this) {
    "deepseek" -> "DeepSeek Harness"
    null -> "Agent Harness"
    else -> this
}
