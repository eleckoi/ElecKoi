package com.eleckoi.android.feature.chat.data.stream

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AppendOnlyTextTest {
    @Test
    fun acceptsGrowthWithoutScanningTheWholePrefixContract() {
        val previous = "开头" + "x".repeat(10_000) + "结尾"
        assertTrue(isAppendOnlyUpdate(previous, previous + "新内容"))
    }

    @Test
    fun rejectsShrinkAndBoundaryOrMiddleCorrections() {
        val previous = "a".repeat(64) + "b".repeat(64)
        assertFalse(isAppendOnlyUpdate(previous, previous.dropLast(1)))
        assertFalse(isAppendOnlyUpdate(previous, "z" + previous.drop(1) + "tail"))
        assertFalse(
            isAppendOnlyUpdate(
                previous,
                previous.replaceRange(previous.length / 2, previous.length / 2 + 1, "z") + "tail",
            ),
        )
    }

    @Test
    fun exactLengthCorrectionUsesExactEquality() {
        assertFalse(isAppendOnlyUpdate("旧内容", "新内容"))
        assertTrue(isAppendOnlyUpdate("相同", "相同"))
    }
}
