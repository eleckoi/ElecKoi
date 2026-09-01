package com.eleckoi.android.sdk.author.bridge

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AuthorBridgeRequestGateTest {
    @Test
    fun `rejects oversized utf8 requests`() {
        val gate = AuthorBridgeRequestGate(maxRequestBytes = 4)

        assertEquals(
            AuthorBridgeRequestRejection.RequestTooLarge,
            gate.tryAcquire("你好"),
        )
    }

    @Test
    fun `bounds concurrent requests and allows another after release`() {
        val gate = AuthorBridgeRequestGate(maxInFlight = 1)

        assertNull(gate.tryAcquire("{}"))
        assertEquals(AuthorBridgeRequestRejection.TooManyInFlight, gate.tryAcquire("{}"))
        gate.release()
        assertNull(gate.tryAcquire("{}"))
    }

    @Test
    fun `rate window expires deterministically`() {
        var now = 1_000L
        val gate = AuthorBridgeRequestGate(
            maxInFlight = 2,
            maxRequestsPerWindow = 1,
            windowMillis = 100,
            clockMillis = { now },
        )

        assertNull(gate.tryAcquire("{}"))
        gate.release()
        assertEquals(AuthorBridgeRequestRejection.RateLimited, gate.tryAcquire("{}"))
        now += 100
        assertNull(gate.tryAcquire("{}"))
    }
}
