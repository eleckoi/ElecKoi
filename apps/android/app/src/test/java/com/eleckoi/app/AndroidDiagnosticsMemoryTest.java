package com.eleckoi.app;

import org.junit.Test;
import static org.junit.Assert.*;

/** 内存落盘规则（ADR 0031 2026-11-05 修订）：平时不写，吃紧才写。 */
public class AndroidDiagnosticsMemoryTest {
    private static final long MB = 1024L * 1024;
    @Test public void staysQuietWhenMemoryIsCalm() {
        assertFalse(AndroidDiagnostics.memoryWorthRecording(false, 20 * MB, 256 * MB, 18 * MB));
        assertFalse(AndroidDiagnostics.memoryWorthRecording(false, 20 * MB, 256 * MB, 0));
    }
    @Test public void recordsWhenSystemFlagsLowMemoryEvenIfHeapLooksCalm() {
        assertTrue(AndroidDiagnostics.memoryWorthRecording(true, 8 * MB, 256 * MB, 8 * MB));
    }
    @Test public void recordsOnceHeapReachesFourFifthsOfItsLimit() {
        assertFalse(AndroidDiagnostics.memoryWorthRecording(false, 204 * MB, 256 * MB, 0));
        assertTrue(AndroidDiagnostics.memoryWorthRecording(false, 205 * MB, 256 * MB, 0));
    }
    @Test public void recordsWhenHeapGrowsByThirtyTwoMegabytesSinceLastRecord() {
        assertFalse(AndroidDiagnostics.memoryWorthRecording(false, 51 * MB, 1024 * MB, 20 * MB));
        assertTrue(AndroidDiagnostics.memoryWorthRecording(false, 52 * MB, 1024 * MB, 20 * MB));
    }
    @Test public void ignoresUnknownHeapLimitAndShrinkingHeap() {
        assertFalse(AndroidDiagnostics.memoryWorthRecording(false, 90 * MB, 0, 0));
        assertFalse(AndroidDiagnostics.memoryWorthRecording(false, 10 * MB, 1024 * MB, 400 * MB));
    }
}
