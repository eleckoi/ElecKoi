package com.eleckoi.android.feature.appfont.data

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

// Downloads live here rather than in the settings page because a 15-25 MB font takes long enough
// that people navigate away mid-transfer. Tying the coroutine to the composable meant leaving the
// page cancelled the download and left a partial file behind.
//
// Process-scoped rather than WorkManager on purpose: this is work the user just asked for and is
// waiting on, not work that has to survive the process being killed. If the process does die, the
// partial file is swept on the next launch and the user can tap again.
object AppFontDownloader {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _activeFontId = MutableStateFlow<String?>(null)
    val activeFontId: StateFlow<String?> = _activeFontId.asStateFlow()

    private val _progress = MutableStateFlow(0f)
    val progress: StateFlow<Float> = _progress.asStateFlow()

    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()

    /** Bumped after every finished attempt so listeners re-read installed state from disk. */
    private val _completions = MutableStateFlow(0)
    val completions: StateFlow<Int> = _completions.asStateFlow()

    val isIdle: Boolean get() = _activeFontId.value == null

    fun start(repository: AppFontRepository, entry: AppFontCatalogEntry) {
        // One at a time: concurrent downloads would each stage a file, and the sweep below could
        // not then tell an in-flight partial from an abandoned one.
        if (_activeFontId.value != null) return
        _activeFontId.value = entry.id
        _progress.value = 0f
        _message.value = null
        scope.launch {
            repository.download(entry) { fraction -> _progress.value = fraction }
                .onSuccess {
                    repository.selectFont(entry.id)
                    _message.value = "${entry.name} 已下载并应用"
                }
                .onFailure { error ->
                    _message.value = "${entry.name} 下载失败：${error.message ?: "未知原因"}"
                }
            _completions.value += 1
            _activeFontId.value = null
        }
    }

    // Only safe while nothing is transferring, otherwise this would delete the staging file out
    // from under an active download.
    fun sweepAbandoned(repository: AppFontRepository) {
        if (!isIdle) return
        repository.clearAbandonedDownloads()
    }

    fun consumeMessage() {
        _message.value = null
    }
}
