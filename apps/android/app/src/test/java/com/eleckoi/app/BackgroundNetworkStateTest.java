package com.eleckoi.app;

import org.junit.Test;
import static org.junit.Assert.*;

public class BackgroundNetworkStateTest {
    @Test public void networkAccessIsUnknownUntilTheSystemReportsIt() {
        BackgroundNetworkState state = new BackgroundNetworkState();
        assertEquals("尚未获取网络状态", state.description());
        assertEquals("Host 正在运行", state.notification("Host 正在运行"));
        state.available(42);
        assertEquals("网络已连接，系统访问状态尚未确认", state.description());
        assertFalse(state.blocked(19, true));
        assertEquals("Host 正在运行", state.notification("Host 正在运行"));
    }

    @Test public void restrictionAndRecoveryPreserveTheHostPhaseMessage() {
        BackgroundNetworkState state = new BackgroundNetworkState();
        state.available(42);
        assertTrue(state.blocked(42, true));
        assertEquals("系统已限制本应用联网", state.description());
        assertTrue(state.notification("正在执行工具").contains("联网受到系统限制"));
        assertFalse(state.blocked(42, true));
        assertFalse(state.available(42));
        assertTrue(state.notification("正在执行工具").contains("联网受到系统限制"));
        assertTrue(state.blocked(42, false));
        assertEquals("正在执行工具", state.notification("正在执行工具"));
        assertEquals("系统允许本应用联网", state.description());
    }

    @Test public void lateCallbacksFromThePreviousNetworkDoNotChangeTheCurrentConnection() {
        BackgroundNetworkState state = new BackgroundNetworkState();
        state.available(42); state.blocked(42, true);
        state.available(73); state.blocked(73, false);
        assertFalse(state.lost(42));
        assertFalse(state.blocked(42, true));
        assertEquals("Host 正在运行", state.notification("Host 正在运行"));
        assertTrue(state.lost(73));
        assertTrue(state.notification("Host 正在运行").contains("等待网络恢复"));
        state.available(81);
        assertEquals("网络已连接，系统访问状态尚未确认", state.description());
        assertEquals("Host 正在运行", state.notification("Host 正在运行"));
    }
}
