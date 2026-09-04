package com.eleckoi.android.feature.settings.ui.personalization

import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.role
import com.eleckoi.android.feature.settings.ui.personalization.components.CompactSettingsScaffold
import com.eleckoi.android.feature.settings.ui.personalization.components.SettingsSection
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.PhosphorRegular
import com.eleckoi.android.foundation.design.components.FilledSvgIcon
import com.eleckoi.android.foundation.design.components.noRippleClickable
import com.eleckoi.android.foundation.diagnostics.CrashDiagnostics
import com.eleckoi.android.foundation.diagnostics.CrashReportContents
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun CrashDiagnosticsPage(
    appearance: AppearanceTheme,
    onBack: () -> Unit,
) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val scope = rememberCoroutineScope()
    var contents by remember { mutableStateOf<CrashReportContents?>(null) }
    var pendingReport by remember { mutableStateOf<String?>(null) }
    var preparing by remember { mutableStateOf(false) }
    val saveReport = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("text/plain"),
    ) { uri ->
        val report = pendingReport
        pendingReport = null
        if (uri != null && report != null) {
            scope.launch {
                val result = withContext(Dispatchers.IO) {
                    runCatching {
                        context.contentResolver.openOutputStream(uri, "wt")?.bufferedWriter()?.use {
                            it.write(report)
                        } ?: error("无法打开保存位置")
                    }
                }
                Toast.makeText(
                    context,
                    if (result.isSuccess) {
                        "诊断报告已保存"
                    } else {
                        "保存失败：${result.exceptionOrNull()?.message.orEmpty()}"
                    },
                    Toast.LENGTH_LONG,
                ).show()
            }
        }
    }

    LaunchedEffect(Unit) {
        contents = withContext(Dispatchers.IO) { CrashDiagnostics.reportContents(context) }
    }

    CompactSettingsScaffold(
        title = "故障诊断",
        appearance = appearance,
        onBack = onBack,
    ) {
        SettingsSection(label = "崩溃日志", appearance = appearance) {
            CrashDiagnosticsContent(
                contents = contents,
                preparing = preparing,
                appearance = appearance,
                onExport = {
                    if (!preparing) {
                        preparing = true
                        scope.launch {
                            val result = withContext(Dispatchers.IO) {
                                runCatching {
                                    CrashDiagnostics.buildReport(context) to
                                        CrashDiagnostics.reportContents(context)
                                }
                            }
                            preparing = false
                            result.onSuccess { (report, refreshedContents) ->
                                contents = refreshedContents
                                pendingReport = report
                                saveReport.launch(CrashDiagnostics.suggestedFileName())
                            }.onFailure { error ->
                                Toast.makeText(
                                    context,
                                    "整理失败：${error.message.orEmpty()}",
                                    Toast.LENGTH_LONG,
                                ).show()
                            }
                        }
                    }
                },
            )
        }
    }
}

@Composable
private fun CrashDiagnosticsContent(
    contents: CrashReportContents?,
    preparing: Boolean,
    appearance: AppearanceTheme,
    onExport: () -> Unit,
) {
    Column(modifier = Modifier.padding(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(42.dp)
                    .background(appearance.mobileBlue.copy(alpha = 0.10f), RoundedCornerShape(13.dp)),
                contentAlignment = Alignment.Center,
            ) {
                FilledSvgIcon(
                    paths = listOf(PhosphorRegular.DownloadSimple),
                    color = appearance.mobileBlue,
                    iconSize = 23.dp,
                    viewportSize = 256f,
                )
            }
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(start = 12.dp),
            ) {
                Text(
                    text = "诊断报告",
                    color = appearance.mobileText,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = when {
                        contents == null -> "正在读取本机诊断记录"
                        contents.recordedIssueCount > 0 ->
                            "发现 ${contents.recordedIssueCount} 条异常记录，可导出排查"
                        else -> "暂无崩溃记录，也可导出当前运行状态"
                    },
                    color = appearance.mobileMuted,
                    fontSize = 12.sp,
                    lineHeight = 17.sp,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
            if (contents == null || preparing) {
                CircularProgressIndicator(
                    modifier = Modifier.size(21.dp),
                    color = appearance.mobileBlue,
                    strokeWidth = 2.dp,
                )
            }
        }

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 14.dp)
                .background(appearance.mobileSearchBg, RoundedCornerShape(14.dp))
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(7.dp),
        ) {
            ReportContentsRow("系统异常退出", contents?.processExitRecords?.let { "$it 条" } ?: "…", appearance)
            ReportContentsRow("未捕获异常", contents?.uncaughtExceptionFiles?.let { "$it 份" } ?: "…", appearance)
            ReportContentsRow("最近运行阶段", contents?.recentStageRecords?.let { "$it 条" } ?: "…", appearance)
            ReportContentsRow(
                "本地环境等诊断",
                contents?.subsystemSections?.let { "$it 组" } ?: "…",
                appearance,
            )
            ReportContentsRow(
                "设备与应用快照",
                contents?.deviceSnapshotFields?.let { "$it 项" } ?: "…",
                appearance,
            )
        }
        Text(
            text = "不含聊天正文、提示词、请求内容或 API Key",
            color = appearance.mobileSoft,
            fontSize = 11.sp,
            lineHeight = 16.sp,
            modifier = Modifier.padding(start = 2.dp, top = 9.dp),
        )
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 11.dp)
                .height(48.dp)
                .alpha(if (preparing) 0.58f else 1f)
                .background(appearance.mobileBlue, RoundedCornerShape(13.dp))
                .then(
                    if (preparing) {
                        Modifier
                    } else {
                        Modifier
                            .semantics { role = Role.Button }
                            .noRippleClickable(onClick = onExport)
                    },
                ),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = if (preparing) "正在整理报告" else "导出诊断报告",
                color = Color.White,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
            )
        }
    }
}

@Composable
private fun ReportContentsRow(
    label: String,
    value: String,
    appearance: AppearanceTheme,
) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .size(6.dp)
                .background(appearance.mobileBlue, RoundedCornerShape(3.dp)),
        )
        Text(
            text = label,
            color = appearance.mobileMuted,
            fontSize = 12.sp,
            modifier = Modifier
                .weight(1f)
                .padding(start = 8.dp),
        )
        Text(
            text = value,
            color = appearance.mobileText,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
        )
    }
}
