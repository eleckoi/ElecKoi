package com.eleckoi.android.feature.chat.data

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GenerationLeaseRegistryTest {
    @Test
    fun cancelledLeaseCannotBeRevivedByStartingAnotherGeneration() {
        val registry = GenerationLeaseRegistry()
        val first = registry.begin("session")

        registry.cancelActive()
        val second = registry.begin("session")

        assertTrue(registry.isCancelled(first))
        assertFalse(registry.isCurrent(first))
        assertFalse(registry.isCancelled(second))
        assertTrue(registry.isCurrent(second))
    }

    @Test
    fun finishingStaleLeaseCannotClearNewGeneration() {
        val registry = GenerationLeaseRegistry()
        val first = registry.begin("session")
        val second = registry.begin("session")

        registry.finish(first)

        assertTrue(registry.isCurrent(second))
        assertFalse(registry.isCancelled(second))
    }

    @Test
    fun staleLeaseCannotCommitAfterNewGenerationStarts() {
        val registry = GenerationLeaseRegistry()
        val first = registry.begin("session")
        registry.begin("session")
        var committed = false

        val accepted = registry.commitIfOwned(first) { committed = true }

        assertFalse(accepted)
        assertFalse(committed)
    }

    @Test
    fun cancelledLeaseCanOnlyCommitItsStoppedSnapshotWhileStillOwned() {
        val registry = GenerationLeaseRegistry()
        val lease = registry.begin("session")
        registry.cancelActive()

        assertFalse(registry.commitIfActive(lease) {})
        assertTrue(registry.commitIfOwned(lease) {})
    }

    @Test
    fun cancellingLeaseImmediatelyClosesItsRegisteredTransport() {
        val registry = GenerationLeaseRegistry()
        val lease = registry.begin("session")
        var disconnected = false
        lease.invokeOnCancel { disconnected = true }

        registry.cancelActive()

        assertTrue(disconnected)
    }

    @Test
    fun orphanRecoveryCannotRunWhileTheSessionHasALiveLease() {
        val registry = GenerationLeaseRegistry()
        registry.begin("session")
        var recovered = false

        assertFalse(registry.runIfSessionInactive("session") { recovered = true })
        assertFalse(recovered)

        registry.cancelActive()

        assertTrue(registry.runIfSessionInactive("session") { recovered = true })
        assertTrue(recovered)
    }
}
