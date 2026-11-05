package com.eleckoi.app;

import android.app.ActivityManager;
import android.content.Context;
import android.os.*;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.function.Consumer;

/**
 * Low-frequency sampling and off-main-thread diagnostic storage/export.
 *
 * 两个变体都启用（ADR 0031，2026-11-05 修订）：以前只有兼容版启动采集，报告功能因此把标准版
 * 排除在外（ADR 0041 决定 8）。现在标准版与兼容版记录同一套事实——会话标记、页面异常、
 * 返回阶段、卡死看门狗、内存记录——报告在两版同形。代价只在窗口可见时付出（`visible`），
 * 存储仍受 RuntimeDiagnostics 的四段轮转上限约束。
 */
final class AndroidDiagnostics {
    private final Context context;
    private final RuntimeDiagnostics store;
    private final ScheduledExecutorService worker = Executors.newSingleThreadScheduledExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private volatile boolean visible;
    private volatile long pendingBeat;
    private boolean stallReported;
    private final java.util.concurrent.atomic.AtomicBoolean flushQueued=new java.util.concurrent.atomic.AtomicBoolean();
    /** Bug 报告一次带多少条最近事件。 */
    private static final int REPORT_EVENTS = 200;
    private final String sessionId = UUID.randomUUID().toString();
    private volatile long previousStartMillis;
    private volatile boolean previousEnded = true;
    private volatile boolean sessionEnded;
    AndroidDiagnostics(Context context) {
        this.context = context;
        store = new RuntimeDiagnostics(new File(context.getFilesDir(), "runtime-diagnostics"));
        // 先把上一次会话的尾巴读出来，再写本次标记——顺序反了就永远读到「自己」。
        classify(store.recent(REPORT_EVENTS * 2));
        record(new RuntimeDiagnostics.Record().with("kind", "session").with("stage", "started").with("id", sessionId));
        worker.scheduleWithFixedDelay(store::flush, 5, 5, TimeUnit.SECONDS);
        worker.scheduleWithFixedDelay(this::sample, 5, 5, TimeUnit.SECONDS);
        worker.scheduleWithFixedDelay(this::memory, 60, 60, TimeUnit.SECONDS);
        Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, failure) -> {
            record(RuntimeDiagnostics.failure("java-uncaught", failure));
            try { worker.submit(store::flush).get(1500, TimeUnit.MILLISECONDS); } catch (Exception ignored) { }
            if (previous != null) previous.uncaughtException(thread, failure);
        });
        record(environment().with("kind", "process-start"));
    }
    void record(JSONObject event) { store.record(event); }
    void event(String kind, String stage) { record(new RuntimeDiagnostics.Record().with("kind", kind).with("stage", stage)); }
    void visible(boolean value) { visible = value; event("activity", value ? "resume" : "pause"); }
    private void sample() {
        if (!visible) { pendingBeat = 0; return; }
        long now = SystemClock.elapsedRealtime();
        if (pendingBeat != 0) {
            if (!stallReported && now - pendingBeat > 1000) { stallReported = true; record(new RuntimeDiagnostics.Record().with("kind", "native-stall").with("delayMs", now - pendingBeat)); }
            return;
        }
        pendingBeat = now; stallReported = false;
        main.post(() -> {
            if(pendingBeat!=now) return;
            long start = pendingBeat; pendingBeat = 0;
            if (visible && start != 0 && SystemClock.elapsedRealtime() - start > 250)
                record(new RuntimeDiagnostics.Record().with("kind", "native-resumed").with("delayMs", SystemClock.elapsedRealtime() - start));
        });
    }
    private void memory() {
        if (!visible) return;
        ActivityManager.MemoryInfo memory = new ActivityManager.MemoryInfo();
        ((ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE)).getMemoryInfo(memory);
        Runtime runtime = Runtime.getRuntime();
        record(new RuntimeDiagnostics.Record().with("kind", "memory").with("heapBytes", runtime.totalMemory() - runtime.freeMemory())
            .with("pssKb", Debug.getPss()).with("availableBytes", memory.availMem).with("lowMemory", memory.lowMemory));
    }
    RuntimeDiagnostics.Record environment() {
        return new RuntimeDiagnostics.Record().with("variant", BuildConfig.BROWSER_VARIANT).with("version", BuildConfig.VERSION_NAME).with("versionCode", BuildConfig.VERSION_CODE)
            .with("sdk", Build.VERSION.SDK_INT).with("system", Build.VERSION.RELEASE).with("manufacturer", Build.MANUFACTURER).with("model", Build.MODEL)
            .with("abi", String.join(",", Build.SUPPORTED_ABIS)).with("pid", android.os.Process.myPid());
    }
    void report(JSONObject metadata, int maximum, Consumer<String> done) {
        worker.execute(() -> {
            String result;
            try { result = store.report(metadata, maximum); } catch (Exception failure) { result = "诊断读取失败：" + RuntimeDiagnostics.clean(failure.toString(), 512); }
            String text = result; main.post(() -> done.accept(text));
        });
    }
    void export(JSONObject metadata, Consumer<File> done, Consumer<String> failed) {
        worker.execute(() -> {
            try { File result = store.export(metadata); main.post(() -> done.accept(result)); }
            catch (Exception failure) { main.post(() -> failed.accept("诊断导出失败：" + RuntimeDiagnostics.clean(failure.toString(), 512))); }
        });
    }
    /** 读最近事件，判定上一次会话有没有配对的结束标记。 */
    private void classify(List<String> events) {
        JSONObject lastStart = null; String lastId = "";
        for (String line : events) {
            try {
                JSONObject record = new JSONObject(line);
                if (!"session".equals(record.optString("kind"))) continue;
                if ("started".equals(record.optString("stage"))) {
                    lastStart = record; lastId = record.optString("id"); previousEnded = false;
                } else if ("ended".equals(record.optString("stage")) && lastId.equals(record.optString("id"))) {
                    previousEnded = true;
                }
            } catch (Exception ignored) { }
        }
        if (lastStart != null) previousStartMillis = lastStart.optLong("firstAt", 0L);
    }
    /** 正常退出时补一个结束标记；强杀 / 崩溃时这一行不会出现。 */
    void sessionEnd() {
        if (sessionEnded) return;
        sessionEnded = true;
        record(new RuntimeDiagnostics.Record().with("kind", "session").with("stage", "ended").with("id", sessionId));
        try { store.flush(); } catch (Exception ignored) { }
    }
    /**
     * Bug 报告要的原始事实：环境、上次会话、最近事件、投递配置。
     *
     * 只给数据，不拼报告——脱敏、折叠与正文都在共享契约（TS）里，一份实现。
     * 读不到时返回 {@code {"available":false}}（桥据此不显示入口）。
     */
    String bugReportFacts() {
        try {
            JSONArray events = new JSONArray();
            for (String line : store.recent(REPORT_EVENTS)) events.put(line);
            RuntimeDiagnostics.Record env = environment();
            JSONObject environment = new JSONObject()
                .put("appVersion", BuildConfig.VERSION_NAME)
                .put("platform", "android")
                .put("arch", Build.SUPPORTED_ABIS.length > 0 ? Build.SUPPORTED_ABIS[0] : "unknown")
                .put("osVersion", "Android " + Build.VERSION.RELEASE)
                .put("runtime", ("compat".equals(env.optString("variant")) ? "GeckoView" : "Android WebView") + " / SDK " + Build.VERSION.SDK_INT);
            JSONObject session = new JSONObject()
                .put("startedAt", previousStartMillis > 0 ? Instant.ofEpochMilli(previousStartMillis).toString() : Instant.now().toString())
                .put("ended", previousStartMillis > 0 ? previousEnded : true);
            // 投递配置的唯一来源是 Android 资源（没有内置配置文件）；链接为空就不带 form，与「未配置」同义。
            JSONObject delivery = new JSONObject().put("mailbox", "").put("repository", "");
            String formUrl = context.getString(R.string.bug_report_form_url).trim();
            if (!formUrl.isEmpty()) {
                delivery.put("form", new JSONObject()
                    .put("shareUrl", formUrl)
                    .put("fields", new JSONObject()
                        .put("body", context.getString(R.string.bug_report_form_field_body))
                        .put("meta", context.getString(R.string.bug_report_form_field_meta))
                        .put("code", context.getString(R.string.bug_report_form_field_code))
                        .put("file", context.getString(R.string.bug_report_form_field_file))));
            }
            return new JSONObject()
                .put("available", true)
                .put("environment", environment)
                .put("session", session)
                .put("events", events)
                .put("delivery", delivery)
                .toString();
        } catch (Exception failure) { return "{\"available\":false}"; }
    }
    void flushSoon() { if(flushQueued.compareAndSet(false,true)) worker.execute(()->{ try { store.flush(); } finally { flushQueued.set(false); } }); }
}
