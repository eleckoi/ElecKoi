package com.eleckoi.app;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.junit.Test;
import static org.junit.Assert.*;

/** 上次会话判定（ADR 0041 决定 15）：找「最近一次没有配对 ended 的会话」，不是「最近一次会话」。 */
public class AndroidDiagnosticsSessionTest {
    private static String started(String id, long firstAt) {
        return "{\"kind\":\"session\",\"stage\":\"started\",\"id\":\"" + id + "\",\"firstAt\":" + firstAt + "}";
    }
    private static String ended(String id) {
        return "{\"kind\":\"session\",\"stage\":\"ended\",\"id\":\"" + id + "\"}";
    }
    private static List<String> events(String... lines) {
        return new ArrayList<>(Arrays.asList(lines));
    }

    @Test public void treatsTheLatestUnpairedStartAsTheCrash() {
        AndroidDiagnostics.PreviousSession previous = AndroidDiagnostics.classifySessions(events(started("a", 1), ended("a"), started("b", 2)));
        assertFalse(previous.ended);
        assertEquals(2L, previous.startMillis);
    }

    @Test public void keepsEvidenceWhenTheCrashIsTwoLaunchesBack() {
        // a 崩了（有 start 没 end），b 正常结束：不能因为 b 配对了 ended 就说「上次正常结束」。
        AndroidDiagnostics.PreviousSession previous = AndroidDiagnostics.classifySessions(events(started("a", 10), started("b", 20), ended("b")));
        assertFalse(previous.ended);
        assertEquals(10L, previous.startMillis);
    }

    @Test public void endedForAnotherSessionIdDoesNotPairTheStart() {
        AndroidDiagnostics.PreviousSession previous = AndroidDiagnostics.classifySessions(events(started("a", 5), ended("b")));
        assertFalse(previous.ended);
        assertEquals(5L, previous.startMillis);
    }

    @Test public void reportsNormalExitOnlyWhenEverySessionPaired() {
        AndroidDiagnostics.PreviousSession previous = AndroidDiagnostics.classifySessions(events(started("a", 1), ended("a"), started("b", 2), ended("b")));
        assertTrue(previous.ended);
        assertEquals(2L, previous.startMillis);
    }

    @Test public void ignoresMalformedLinesAndEmptyHistory() {
        assertTrue(AndroidDiagnostics.classifySessions(events("not json", "{\"kind\":\"memory\"}")).ended);
        AndroidDiagnostics.PreviousSession empty = AndroidDiagnostics.classifySessions(new ArrayList<>());
        assertTrue(empty.ended);
        assertEquals(0L, empty.startMillis);
    }
}
