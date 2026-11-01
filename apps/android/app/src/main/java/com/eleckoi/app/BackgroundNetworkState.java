package com.eleckoi.app;

/** Tracks the default network without accepting events from a replaced connection. */
final class BackgroundNetworkState {
    private Long network;
    private Boolean blocked;
    private boolean observed;

    synchronized boolean available(long id) {
        if (network != null && network == id) return false;
        observed = true;
        network = id;
        blocked = null;
        return true;
    }

    synchronized boolean lost(long id) {
        if (network == null || network != id) return false;
        disconnected();
        return true;
    }

    synchronized void disconnected() {
        observed = true;
        network = null;
        blocked = null;
    }

    synchronized boolean blocked(long id, boolean value) {
        if (network == null || network != id || Boolean.valueOf(value).equals(blocked)) return false;
        blocked = value;
        return true;
    }

    synchronized String description() {
        if (!observed) return "尚未获取网络状态";
        if (network == null) return "当前没有可用网络";
        if (blocked == null) return "网络已连接，系统访问状态尚未确认";
        return blocked ? "系统已限制本应用联网" : "系统允许本应用联网";
    }

    synchronized String notification(String hostMessage) {
        if (Boolean.TRUE.equals(blocked)) return "联网受到系统限制，可在“后台运行”中查看设置";
        if (observed && network == null) return "网络未连接，等待网络恢复";
        return hostMessage;
    }
}
