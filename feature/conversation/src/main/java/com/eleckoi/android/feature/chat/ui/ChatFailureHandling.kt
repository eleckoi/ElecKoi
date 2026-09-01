package com.eleckoi.android.feature.chat.ui

import kotlinx.coroutines.CancellationException

/**
 * Reports a genuine failure and lets cancellation through untouched.
 *
 * `runCatching` catches [CancellationException] like anything else, so a job that was replaced, a
 * screen that closed, or a stream the user stopped all arrive here looking like errors — and get
 * shown as "StandaloneCoroutine was cancelled". Cancellation is a lifecycle signal, never something
 * the reader did wrong, and rethrowing also restores the contract that a cancelled coroutine stops.
 */
internal inline fun <T> Result<T>.onRealFailure(action: (Throwable) -> Unit): Result<T> =
    onFailure { error ->
        if (error is CancellationException) throw error
        action(error)
    }
