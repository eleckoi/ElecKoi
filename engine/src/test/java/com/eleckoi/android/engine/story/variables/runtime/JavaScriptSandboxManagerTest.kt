package com.eleckoi.android.engine.story.variables.runtime

import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.cancel
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class JavaScriptSandboxManagerTest {
    @Test
    fun `variable preview ejs and chat validation share one serialized connection`() = runBlocking {
        val ownerScope = testOwnerScope()
        try {
            val connectCount = AtomicInteger()
            val connection = RecordingConnection(evaluationDelayMillis = 2)
            val manager = manager(
                ownerScope = ownerScope,
                connector = {
                    connectCount.incrementAndGet()
                    connection
                },
            )
            val scripts = List(20) { index ->
                listOf(
                    "variable-preview-$index",
                    "ejs-render-$index",
                    "chat-state-validation-$index",
                )
            }.flatten()

            val results = scripts.map { script ->
                async(Dispatchers.Default) { manager.evaluate(script, requirePromiseReturn = false) }
            }.awaitAll()

            assertEquals(scripts, results)
            assertEquals(1, connectCount.get())
            assertEquals(scripts.size, connection.evaluationCount.get())
            assertEquals(1, connection.maxConcurrentEvaluations.get())
        } finally {
            ownerScope.cancel()
        }
    }

    @Test
    fun `cancelling caller does not cancel the application owned bind`() = runBlocking {
        val ownerScope = testOwnerScope()
        try {
            val connectCount = AtomicInteger()
            val connectStarted = CompletableDeferred<Unit>()
            val releaseConnection = CompletableDeferred<Unit>()
            val connection = RecordingConnection()
            val manager = manager(
                ownerScope = ownerScope,
                connector = {
                    connectCount.incrementAndGet()
                    connectStarted.complete(Unit)
                    releaseConnection.await()
                    connection
                },
            )
            val cancelledCaller = launch(Dispatchers.Default) {
                manager.evaluate("cancelled-preview", requirePromiseReturn = false)
            }

            withTimeout(5_000) { connectStarted.await() }
            cancelledCaller.cancelAndJoin()
            assertFalse(releaseConnection.isCancelled)
            releaseConnection.complete(Unit)

            val result = withTimeout(5_000) {
                manager.evaluate("next-chat-validation", requirePromiseReturn = false)
            }
            assertEquals("next-chat-validation", result)
            assertEquals(1, connectCount.get())
            assertEquals(1, connection.evaluationCount.get())
        } finally {
            ownerScope.cancel()
        }
    }

    @Test
    fun `webview runtime change closes old connection before reconnecting`() = runBlocking {
        val ownerScope = testOwnerScope()
        try {
            val runtimeIdentity = AtomicReference("webview:1")
            val connections = mutableListOf<RecordingConnection>()
            val manager = manager(
                ownerScope = ownerScope,
                runtimeIdentity = runtimeIdentity::get,
                connector = {
                    RecordingConnection().also(connections::add)
                },
            )

            assertEquals("first", manager.evaluate("first", requirePromiseReturn = false))
            runtimeIdentity.set("webview:2")
            assertEquals("second", manager.evaluate("second", requirePromiseReturn = false))

            assertEquals(2, connections.size)
            assertTrue(connections.first().closed)
            assertFalse(connections.last().closed)
        } finally {
            ownerScope.cancel()
        }
    }

    @Test
    fun `dead sandbox is closed and current evaluation retries once`() = runBlocking {
        val ownerScope = testOwnerScope()
        try {
            val deadConnection = RecordingConnection(failure = FakeSandboxDeadException())
            val healthyConnection = RecordingConnection()
            val connections = ArrayDeque(listOf(deadConnection, healthyConnection))
            val manager = manager(
                ownerScope = ownerScope,
                connector = { connections.removeFirst() },
                isConnectionFailure = { it is FakeSandboxDeadException },
            )

            assertEquals("schema", manager.evaluate("schema", requirePromiseReturn = false))
            assertTrue(deadConnection.closed)
            assertEquals(1, deadConnection.evaluationCount.get())
            assertEquals(1, healthyConnection.evaluationCount.get())
        } finally {
            ownerScope.cancel()
        }
    }

    @Test
    fun `dead connection during bind is retried once`() = runBlocking {
        val ownerScope = testOwnerScope()
        try {
            val healthyConnection = RecordingConnection()
            val connectCount = AtomicInteger()
            val manager = manager(
                ownerScope = ownerScope,
                connector = {
                    if (connectCount.getAndIncrement() == 0) throw FakeSandboxDeadException()
                    healthyConnection
                },
                isConnectionFailure = { it is FakeSandboxDeadException },
            )

            assertEquals("schema", manager.evaluate("schema", requirePromiseReturn = false))
            assertEquals(2, connectCount.get())
            assertEquals(1, healthyConnection.evaluationCount.get())
        } finally {
            ownerScope.cancel()
        }
    }

    private fun manager(
        ownerScope: CoroutineScope,
        connector: suspend () -> JavaScriptSandboxConnection,
        runtimeIdentity: () -> String = { "webview:stable" },
        isConnectionFailure: (Throwable) -> Boolean = { false },
    ) = JavaScriptSandboxManager(
        connector = JavaScriptSandboxConnector(connector),
        runtimeIdentityProvider = JavaScriptRuntimeIdentityProvider(runtimeIdentity),
        ownerScope = ownerScope,
        isConnectionFailure = isConnectionFailure,
    )

    private fun testOwnerScope(): CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private class RecordingConnection(
        private val evaluationDelayMillis: Long = 0,
        private val failure: Throwable? = null,
    ) : JavaScriptSandboxConnection {
        override val supportsPromiseReturn: Boolean = true
        val evaluationCount = AtomicInteger()
        val maxConcurrentEvaluations = AtomicInteger()
        private val activeEvaluations = AtomicInteger()

        @Volatile
        var closed: Boolean = false
            private set

        override suspend fun evaluate(script: String): String {
            evaluationCount.incrementAndGet()
            val active = activeEvaluations.incrementAndGet()
            maxConcurrentEvaluations.updateMaximum(active)
            return try {
                failure?.let { throw it }
                if (evaluationDelayMillis > 0) delay(evaluationDelayMillis)
                script
            } finally {
                activeEvaluations.decrementAndGet()
            }
        }

        override fun close() {
            closed = true
        }
    }

    private class FakeSandboxDeadException : RuntimeException()
}

private fun AtomicInteger.updateMaximum(candidate: Int) {
    while (true) {
        val current = get()
        if (candidate <= current || compareAndSet(current, candidate)) return
    }
}
