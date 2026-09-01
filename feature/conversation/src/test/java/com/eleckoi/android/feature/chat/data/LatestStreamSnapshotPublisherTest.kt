package com.eleckoi.android.feature.chat.data

import java.util.concurrent.CopyOnWriteArrayList
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.yield
import org.junit.Assert.assertEquals
import org.junit.Test

class LatestStreamSnapshotPublisherTest {
    @Test
    fun `drops obsolete presentation snapshots but flushes the newest value`() = runBlocking {
        val emitted = CopyOnWriteArrayList<Int>()
        val publisher = LatestStreamSnapshotPublisher<Int>(
            scope = this,
            frameIntervalMillis = 200L,
            emit = emitted::add,
        )

        publisher.offer(1)
        while (emitted.isEmpty()) yield()
        (2..100).forEach(publisher::offer)
        delay(10L)
        publisher.stopAndFlush(100)

        assertEquals(listOf(1, 100), emitted.toList())
    }

    @Test
    fun `guaranteed lifecycle snapshot is delivered before the latest settled snapshot`() = runBlocking {
        val emitted = CopyOnWriteArrayList<Int>()
        val publisher = LatestStreamSnapshotPublisher<Int>(
            scope = this,
            frameIntervalMillis = 20L,
            emit = emitted::add,
        )

        publisher.offerGuaranteed(1)
        publisher.offer(2)

        withTimeout(1_000L) {
            while (emitted.size < 2) yield()
        }
        publisher.stop()

        assertEquals(listOf(1, 2), emitted.toList())
    }
}
