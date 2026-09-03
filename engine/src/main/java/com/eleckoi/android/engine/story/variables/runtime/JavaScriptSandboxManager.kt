package com.eleckoi.android.engine.story.variables.runtime

import android.content.Context
import android.os.DeadObjectException
import android.webkit.WebView
import androidx.core.content.pm.PackageInfoCompat
import androidx.javascriptengine.JavaScriptIsolate
import androidx.javascriptengine.JavaScriptSandbox
import androidx.javascriptengine.SandboxDeadException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.guava.await
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

internal fun interface JavaScriptSandboxConnector {
    suspend fun connect(): JavaScriptSandboxConnection
}

internal interface JavaScriptSandboxConnection {
    val supportsPromiseReturn: Boolean

    suspend fun evaluate(script: String): String

    fun close()
}

internal fun interface JavaScriptRuntimeIdentityProvider {
    fun currentIdentity(): String
}

internal class JavaScriptPromiseReturnUnsupportedException : IllegalStateException()

/**
 * Owns the single JavaScriptSandbox connection allowed in one Android application process.
 *
 * Connection creation runs in [ownerScope], so cancelling a preview, chat turn, or EJS render does
 * not cancel AndroidX's bind future and leave its process-wide connection guard permanently busy.
 * Evaluations are serialized because every caller shares the same sandbox service connection.
 */
internal class JavaScriptSandboxManager(
    private val connector: JavaScriptSandboxConnector,
    private val runtimeIdentityProvider: JavaScriptRuntimeIdentityProvider,
    private val ownerScope: CoroutineScope,
    private val isConnectionFailure: (Throwable) -> Boolean,
) {
    private val mutex = Mutex()
    private var activeConnection: JavaScriptSandboxConnection? = null
    private var activeRuntimeIdentity: String = ""
    private var pendingConnection: Deferred<JavaScriptSandboxConnection>? = null
    private var pendingRuntimeIdentity: String = ""

    suspend fun evaluate(
        script: String,
        requirePromiseReturn: Boolean,
    ): String = mutex.withLock {
        var reconnectAttempted = false
        while (true) {
            var connection: JavaScriptSandboxConnection? = null
            try {
                connection = connectedSandbox()
                if (requirePromiseReturn && !connection.supportsPromiseReturn) {
                    throw JavaScriptPromiseReturnUnsupportedException()
                }
                return@withLock connection.evaluate(script)
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                if (!isConnectionFailure(error) || reconnectAttempted) throw error
                reconnectAttempted = true
                connection?.let(::invalidate)
            }
        }
        @Suppress("UNREACHABLE_CODE")
        error("JavaScript sandbox evaluation loop exited unexpectedly")
    }

    private suspend fun connectedSandbox(): JavaScriptSandboxConnection {
        while (true) {
            val requestedIdentity = runtimeIdentityProvider.currentIdentity()
            activeConnection?.let { connection ->
                if (activeRuntimeIdentity == requestedIdentity) return connection
                invalidate(connection)
            }

            val deferred = pendingConnection ?: ownerScope.async(start = CoroutineStart.DEFAULT) {
                connector.connect()
            }.also { connection ->
                pendingConnection = connection
                pendingRuntimeIdentity = requestedIdentity
            }
            val connection = try {
                deferred.await()
            } catch (error: CancellationException) {
                // A cancelled caller must not discard or cancel an application-owned bind. Only
                // clear a deferred that the owner scope itself actually cancelled.
                if (deferred.isCancelled && pendingConnection === deferred) clearPendingConnection()
                throw error
            } catch (error: Throwable) {
                if (pendingConnection === deferred) clearPendingConnection()
                throw error
            }

            if (pendingConnection !== deferred) {
                connection.closeQuietly()
                continue
            }
            val connectedIdentity = pendingRuntimeIdentity
            clearPendingConnection()
            if (connectedIdentity != runtimeIdentityProvider.currentIdentity()) {
                connection.closeQuietly()
                continue
            }
            activeConnection = connection
            activeRuntimeIdentity = connectedIdentity
            return connection
        }
    }

    private fun invalidate(connection: JavaScriptSandboxConnection) {
        if (activeConnection !== connection) return
        activeConnection = null
        activeRuntimeIdentity = ""
        connection.closeQuietly()
    }

    private fun clearPendingConnection() {
        pendingConnection = null
        pendingRuntimeIdentity = ""
    }
}

internal object ProcessJavaScriptSandboxManager {
    private val ownerScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    @Volatile
    private var instance: JavaScriptSandboxManager? = null

    fun get(context: Context): JavaScriptSandboxManager {
        instance?.let { return it }
        return synchronized(this) {
            instance ?: create(context.applicationContext).also { instance = it }
        }
    }

    private fun create(context: Context): JavaScriptSandboxManager = JavaScriptSandboxManager(
        connector = JavaScriptSandboxConnector {
            AndroidJavaScriptSandboxConnection(
                JavaScriptSandbox.createConnectedInstanceAsync(context).await(),
            )
        },
        runtimeIdentityProvider = JavaScriptRuntimeIdentityProvider {
            WebView.getCurrentWebViewPackage()?.let { packageInfo ->
                buildString {
                    append(packageInfo.packageName)
                    append(':').append(PackageInfoCompat.getLongVersionCode(packageInfo))
                    append(':').append(packageInfo.lastUpdateTime)
                }
            }.orEmpty()
        },
        ownerScope = ownerScope,
        isConnectionFailure = Throwable::isJavaScriptSandboxConnectionFailure,
    )
}

private class AndroidJavaScriptSandboxConnection(
    private val sandbox: JavaScriptSandbox,
) : JavaScriptSandboxConnection {
    override val supportsPromiseReturn: Boolean
        get() = sandbox.isFeatureSupported(JavaScriptSandbox.JS_FEATURE_PROMISE_RETURN)

    override suspend fun evaluate(script: String): String {
        val isolate = sandbox.createIsolate()
        return try {
            isolate.evaluateJavaScriptAsync(script).await()
        } finally {
            isolate.closeQuietly()
        }
    }

    override fun close() {
        sandbox.close()
    }
}

private fun JavaScriptSandboxConnection.closeQuietly() {
    runCatching { close() }
}

private fun JavaScriptIsolate.closeQuietly() {
    runCatching { close() }
}

private fun Throwable.isJavaScriptSandboxConnectionFailure(): Boolean =
    generateSequence(this) { it.cause }.any { error ->
        error is SandboxDeadException || error is DeadObjectException
    }
