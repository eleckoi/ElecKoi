package com.eleckoi.android.app.update

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AppVersionTest {
    @Test
    fun newerNumericReleaseIsDetected() {
        assertTrue(AppVersion.isNewer("v0.1.1", "0.1.0"))
        assertTrue(AppVersion.isNewer("1.0.0", "0.99.99"))
    }

    @Test
    fun equalOrOlderReleaseIsNotDetected() {
        assertFalse(AppVersion.isNewer("v0.1.0", "0.1.0"))
        assertFalse(AppVersion.isNewer("0.0.9", "0.1.0"))
    }

    @Test
    fun stableReleaseSortsAfterPreRelease() {
        assertTrue(AppVersion.isNewer("1.0.0", "1.0.0-rc.2"))
        assertFalse(AppVersion.isNewer("1.0.0-beta.2", "1.0.0"))
    }
}
