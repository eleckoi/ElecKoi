package com.eleckoi.android.feature.settings.ui.runtime

import com.eleckoi.android.engine.workspace.runtime.model.RuntimeInstallationProgress
import com.eleckoi.android.engine.workspace.runtime.model.RuntimeInstallationStage
import com.eleckoi.android.engine.workspace.runtime.model.RuntimeMaintenanceOperation
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RuntimeMaintenanceProgressTest {
    @Test
    fun `all install stages map forward through four visible phases`() {
        val phases = maintenancePhases(RuntimeMaintenanceOperation.Install)
        val stages = RuntimeInstallationStage.entries.filter { it != RuntimeInstallationStage.Removing }
        val indices = stages.map {
            phases.indexOf(maintenancePhaseOf(it, RuntimeMaintenanceOperation.Install))
        }

        assertEquals(4, phases.size)
        assertTrue(indices.all { it in phases.indices })
        assertEquals(indices.sorted(), indices)
    }

    @Test
    fun `uninstall has its own three phases`() {
        val phases = maintenancePhases(RuntimeMaintenanceOperation.Uninstall)

        assertEquals(3, phases.size)
        assertEquals(
            RuntimeMaintenancePhase.Remove,
            maintenancePhaseOf(RuntimeInstallationStage.Removing, RuntimeMaintenanceOperation.Uninstall),
        )
        assertEquals(
            RuntimeMaintenancePhase.CleanUp,
            maintenancePhaseOf(RuntimeInstallationStage.Cleaning, RuntimeMaintenanceOperation.Uninstall),
        )
    }

    @Test
    fun `byte progress refines the current visible phase`() {
        val fraction = maintenanceFraction(
            RuntimeInstallationProgress(RuntimeInstallationStage.DownloadingRootfs, 50, 100),
            RuntimeMaintenanceOperation.Install,
        )

        assertEquals(0.375f, fraction, 0.001f)
        assertEquals(38, maintenancePercent(fraction))
        assertEquals(99, maintenancePercent(1f))
    }

    @Test
    fun `remaining estimate waits for meaningful progress`() {
        assertEquals(6, maintenanceRemainingMinutes(120_000, 0.25f))
        assertNull(maintenanceRemainingMinutes(120_000, 0.05f))
        assertNull(maintenanceRemainingMinutes(0, 0.5f))
    }

    @Test
    fun `runtime byte labels stay compact`() {
        assertEquals("1.42 GiB", formatRuntimeBytes(1_524_713_390))
        assertEquals("880 MiB", formatRuntimeBytes(880L * 1024 * 1024))
        assertEquals("512 KiB", formatRuntimeBytes(512L * 1024))
        assertEquals("0 MiB", formatRuntimeBytes(0))
    }
}
