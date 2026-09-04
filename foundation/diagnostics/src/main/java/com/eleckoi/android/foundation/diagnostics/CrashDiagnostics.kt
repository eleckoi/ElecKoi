package com.eleckoi.android.foundation.diagnostics

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Build
import android.os.Debug
import android.os.Process
import androidx.core.content.pm.PackageInfoCompat
import java.io.File
import java.io.FileOutputStream
import java.io.PrintWriter
import java.io.StringWriter
import java.time.Instant
import java.util.ArrayDeque

data class CrashReportContents(
    val processExitRecords: Int,
    val uncaughtExceptionFiles: Int,
    val recentStageRecords: Int,
    val subsystemSections: Int,
    val deviceSnapshotFields: Int = 6,
) {
    val recordedIssueCount: Int
        get() = processExitRecords + uncaughtExceptionFiles
}

/**
 * Release-safe local crash archive.
 *
 * It deliberately stores lifecycle metadata only: no prompts, chat text, tool arguments, request
 * bodies, headers or credentials. Android's historical process-exit records cover crashes that an
 * in-process exception handler cannot catch, including native crashes, ANRs and low-memory kills.
 */
object CrashDiagnostics {
    private const val DirectoryName = "diagnostics"
    private const val BreadcrumbFileName = "breadcrumbs.log"
    private const val ProcessExitFileName = "process-exits.log"
    private const val PreferencesName = "crash-diagnostics"
    private const val LastExitTimestampKey = "last-exit-timestamp"
    private const val MaxBreadcrumbs = 80
    private const val MaxBreadcrumbFileBytes = 96 * 1024L
    private const val MaxProcessExitFileBytes = 192 * 1024L
    private const val MaxCrashFiles = 8
    private const val MaxTraceChars = 192 * 1024

    private val lock = Any()
    private val breadcrumbs = ArrayDeque<String>(MaxBreadcrumbs)
    private val reportSectionProviders = linkedMapOf<String, (Context) -> String>()
    @Volatile private var appContext: Context? = null
    @Volatile private var installed = false
    @Volatile private var emergencyMemory: ByteArray? = ByteArray(256 * 1024)

    fun install(context: Context) {
        synchronized(lock) {
            if (installed) return
            installed = true
            appContext = context.applicationContext
        }
        directory(context).mkdirs()
        loadRecentBreadcrumbs(context)
        captureHistoricalProcessExits(context)
        pruneCrashFiles(context)
        installUncaughtExceptionHandler(context)
        breadcrumb(
            event = "app_started",
            fields = mapOf(
                "pid" to Process.myPid(),
                "sdk" to Build.VERSION.SDK_INT,
            ),
        )
    }

    fun breadcrumb(event: String, fields: Map<String, Any?> = emptyMap()) {
        val context = appContext ?: return
        val line = buildString {
            append(Instant.now())
            append("  ")
            append(sanitize(event).take(80))
            fields.entries.take(16).forEach { (name, value) ->
                append("  ")
                append(sanitize(name).take(48))
                append('=')
                append(sanitize(value?.toString().orEmpty()).take(160))
            }
        }
        synchronized(lock) {
            while (breadcrumbs.size >= MaxBreadcrumbs) breadcrumbs.removeFirst()
            breadcrumbs.addLast(line)
            appendBounded(
                file = File(directory(context), BreadcrumbFileName),
                value = "$line\n",
                maxBytes = MaxBreadcrumbFileBytes,
            )
        }
    }

    fun memoryBreadcrumb(event: String, fields: Map<String, Any?> = emptyMap()) {
        val runtime = Runtime.getRuntime()
        breadcrumb(
            event = event,
            fields = fields + mapOf(
                "heap_used_mb" to (runtime.totalMemory() - runtime.freeMemory()) / Megabyte,
                "heap_max_mb" to runtime.maxMemory() / Megabyte,
                "native_heap_mb" to Debug.getNativeHeapAllocatedSize() / Megabyte,
            ),
        )
    }

    fun suggestedFileName(): String =
        "ElecKoi-crash-report-${System.currentTimeMillis()}.txt"

    /** A lightweight inventory used by the settings preview; it never reads chat content. */
    fun reportContents(context: Context): CrashReportContents {
        captureHistoricalProcessExits(context)
        val processExitRecords = runCatching {
            File(directory(context), ProcessExitFileName)
                .readLines()
                .count { it.trim() == "---" }
        }.getOrDefault(0)
        val recentStageRecords = runCatching {
            File(directory(context), BreadcrumbFileName)
                .useLines { lines -> lines.count { it.isNotBlank() } }
        }.getOrDefault(0)
        return CrashReportContents(
            processExitRecords = processExitRecords,
            uncaughtExceptionFiles = crashFiles(context).size,
            recentStageRecords = recentStageRecords,
            subsystemSections = synchronized(lock) { reportSectionProviders.size },
        )
    }

    /**
     * Adds a bounded, release-safe subsystem section to exported diagnostic reports.
     *
     * Providers run only when the user explicitly exports a report. Registering the same title
     * again replaces the old provider, which keeps Application recreation idempotent.
     */
    fun registerReportSection(title: String, provider: (Context) -> String) {
        val normalizedTitle = title.trim().take(80)
        require(normalizedTitle.isNotEmpty()) { "Diagnostic report section title cannot be blank" }
        synchronized(lock) {
            reportSectionProviders[normalizedTitle] = provider
        }
    }

    fun buildReport(context: Context): String {
        captureHistoricalProcessExits(context)
        val info = runCatching {
            context.packageManager.getPackageInfo(context.packageName, 0)
        }.getOrNull()
        val versionCode = info?.let(PackageInfoCompat::getLongVersionCode) ?: 0L
        val runtime = Runtime.getRuntime()
        return buildString {
            appendLine("ElecKoi 故障诊断报告")
            appendLine("生成时间: ${Instant.now()}")
            appendLine("应用: ${info?.versionName.orEmpty()} ($versionCode)")
            appendLine("设备: ${Build.MANUFACTURER} ${Build.MODEL}")
            appendLine("Android: ${Build.VERSION.RELEASE} / SDK ${Build.VERSION.SDK_INT}")
            appendLine("进程: pid=${Process.myPid()}")
            appendLine(
                "内存: heap_used=${(runtime.totalMemory() - runtime.freeMemory()) / Megabyte}MB " +
                    "heap_max=${runtime.maxMemory() / Megabyte}MB " +
                    "native=${Debug.getNativeHeapAllocatedSize() / Megabyte}MB",
            )
            appendLine()
            val subsystemSections = synchronized(lock) { reportSectionProviders.toList() }
            subsystemSections.forEach { (title, provider) ->
                appendLine("===== $title =====")
                val text = runCatching { provider(context.applicationContext) }
                    .getOrElse { error ->
                        "诊断采集失败: ${error.javaClass.name}: ${error.message.orEmpty()}"
                    }
                appendLine(sanitize(text).takeLast(MaxTraceChars).ifBlank { "暂无记录" })
                appendLine()
            }
            appendSection("系统进程退出记录", File(directory(context), ProcessExitFileName))
            val crashFiles = crashFiles(context).sortedBy(File::lastModified)
            if (crashFiles.isEmpty()) {
                appendLine("===== 未捕获异常记录 =====")
                appendLine("暂无 Java/Kotlin 未捕获异常文件。Native 崩溃、ANR 和系统杀进程请看上方退出记录。")
                appendLine()
            } else {
                crashFiles.forEach { file -> appendSection("未捕获异常 · ${file.name}", file) }
            }
            appendSection("最近运行阶段", File(directory(context), BreadcrumbFileName))
            appendLine("说明: 报告不会收集聊天正文、提示词、请求正文、请求头或 API Key。")
        }
    }

    private fun StringBuilder.appendSection(title: String, file: File) {
        appendLine("===== $title =====")
        val text = runCatching { file.readText() }.getOrDefault("")
        appendLine(if (text.isBlank()) "暂无记录" else sanitize(text).takeLast(MaxTraceChars))
        appendLine()
    }

    private fun installUncaughtExceptionHandler(context: Context) {
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            emergencyMemory = null
            runCatching { writeCrashFile(context, thread, throwable) }
            previous?.uncaughtException(thread, throwable)
                ?: run {
                    Process.killProcess(Process.myPid())
                    kotlin.system.exitProcess(10)
                }
        }
    }

    private fun writeCrashFile(context: Context, thread: Thread, throwable: Throwable) {
        val file = File(directory(context), "crash-${System.currentTimeMillis()}.txt")
        val stack = StringWriter().also { writer ->
            PrintWriter(writer).use(throwable::printStackTrace)
        }.toString()
        val recent = synchronized(lock) { breadcrumbs.joinToString("\n") }
        FileOutputStream(file).bufferedWriter().use { writer ->
            writer.appendLine("timestamp=${Instant.now()}")
            writer.appendLine("thread=${sanitize(thread.name)}")
            writer.appendLine("exception=${throwable.javaClass.name}")
            writer.appendLine(sanitize(stack).take(MaxTraceChars))
            writer.appendLine("--- recent stages ---")
            writer.appendLine(recent)
        }
        pruneCrashFiles(context)
    }

    private fun captureHistoricalProcessExits(context: Context) {
        if (Build.VERSION.SDK_INT < 30) return
        val activityManager = context.getSystemService(ActivityManager::class.java) ?: return
        val preferences = context.getSharedPreferences(PreferencesName, Context.MODE_PRIVATE)
        val lastTimestamp = preferences.getLong(LastExitTimestampKey, 0L)
        val exits = runCatching {
            activityManager.getHistoricalProcessExitReasons(context.packageName, 0, 16)
        }.getOrDefault(emptyList())
        val fresh = exits.filter { it.timestamp > lastTimestamp }.sortedBy(ApplicationExitInfo::getTimestamp)
        if (fresh.isEmpty()) return
        val file = File(directory(context), ProcessExitFileName)
        fresh.forEach { info ->
            if (info.reason in AbnormalExitReasons) {
                val trace = runCatching {
                    info.traceInputStream?.use { stream ->
                        val buffer = ByteArray(8 * 1024)
                        val output = StringBuilder()
                        while (output.length < MaxTraceChars) {
                            val count = stream.read(buffer)
                            if (count <= 0) break
                            output.append(buffer.decodeToString(0, count))
                        }
                        output.toString().take(MaxTraceChars)
                    }.orEmpty()
                }.getOrDefault("")
                val record = buildString {
                    appendLine("timestamp=${Instant.ofEpochMilli(info.timestamp)}")
                    appendLine("process=${sanitize(info.processName.orEmpty())}")
                    appendLine("reason=${reasonName(info.reason)}(${info.reason}) status=${info.status}")
                    appendLine("importance=${info.importance} pss_kb=${info.pss} rss_kb=${info.rss}")
                    info.description?.let { description ->
                        appendLine("description=${sanitize(description)}")
                    }
                    if (trace.isNotBlank()) appendLine("trace=${sanitize(trace)}")
                    appendLine("---")
                }
                synchronized(lock) {
                    appendBounded(file, record, MaxProcessExitFileBytes)
                }
            }
        }
        preferences.edit().putLong(
            LastExitTimestampKey,
            fresh.maxOf(ApplicationExitInfo::getTimestamp),
        ).apply()
    }

    private fun loadRecentBreadcrumbs(context: Context) {
        val lines = runCatching {
            File(directory(context), BreadcrumbFileName).readLines().takeLast(MaxBreadcrumbs)
        }.getOrDefault(emptyList())
        synchronized(lock) {
            breadcrumbs.clear()
            lines.forEach(breadcrumbs::addLast)
        }
    }

    private fun appendBounded(file: File, value: String, maxBytes: Long) {
        file.parentFile?.mkdirs()
        if (file.length() + value.toByteArray().size > maxBytes) {
            val retained = runCatching { file.readText().takeLast((maxBytes / 2).toInt()) }
                .getOrDefault("")
            file.writeText(retained)
        }
        file.appendText(value)
    }

    private fun pruneCrashFiles(context: Context) {
        crashFiles(context)
            .sortedByDescending(File::lastModified)
            .drop(MaxCrashFiles)
            .forEach { file -> runCatching { file.delete() } }
    }

    private fun crashFiles(context: Context): List<File> =
        directory(context).listFiles { file ->
            file.isFile && file.name.startsWith("crash-") && file.extension == "txt"
        }?.toList().orEmpty()

    private fun directory(context: Context) = File(context.filesDir, DirectoryName)

    private fun reasonName(reason: Int): String = when (reason) {
        2 -> "SIGNALED"
        3 -> "LOW_MEMORY"
        4 -> "CRASH"
        5 -> "CRASH_NATIVE"
        6 -> "ANR"
        7 -> "INITIALIZATION_FAILURE"
        9 -> "EXCESSIVE_RESOURCE"
        12 -> "DEPENDENCY_DIED"
        14 -> "FREEZER"
        else -> "OTHER"
    }

    private fun sanitize(value: String): String = value
        .replace(BearerSecret, "$1<redacted>")
        .replace(NamedSecret, "$1<redacted>")
        .replace(OpenAiStyleSecret, "<redacted>")

    private val AbnormalExitReasons = setOf(2, 3, 4, 5, 6, 7, 9, 12, 14)
    private val BearerSecret = Regex("(?i)(bearer\\s+)[A-Za-z0-9._~+/-]{8,}")
    private val NamedSecret = Regex(
        "(?i)((?:api[_ -]?key|access[_ -]?token|session[_ -]?token|secret|password)\\s*[:=]\\s*[\\\"']?)[^\\s\\\"',}]+",
    )
    private val OpenAiStyleSecret = Regex("(?i)\\bsk-[A-Za-z0-9_-]{8,}\\b")
    private const val Megabyte = 1024L * 1024L
}
