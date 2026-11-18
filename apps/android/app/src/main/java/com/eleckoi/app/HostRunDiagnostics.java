package com.eleckoi.app;

import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicLong;

/** Queues each Host run's output in read order for the diagnostics writer. */
final class HostRunDiagnostics {
    static final String PROTOCOL_PREFIX = "ELECKOI_HOST\t";
    private static final int MESSAGE_CHARS = 2048;
    final String id = UUID.randomUUID().toString();
    private final RuntimeDiagnostics store;
    private final Runnable flushSoon;
    private final AtomicLong lines = new AtomicLong();
    private volatile String runtimeVersion = "";
    private volatile long hostPid;

    interface LineConsumer { void accept(String line) throws Exception; }

    HostRunDiagnostics(RuntimeDiagnostics store, Runnable flushSoon) {
        this.store = store;
        this.flushSoon = flushSoon;
        lifecycle("created", "");
    }
    void installed(String version) { runtimeVersion = version; lifecycle("starting", ""); }
    void ready(long pid) { hostPid = pid; }
    RuntimeDiagnostics.Record context(RuntimeDiagnostics.Record record) {
        return record.with("id", id).with("runtimeVersion", runtimeVersion).with("hostPid", hostPid);
    }
    void record(RuntimeDiagnostics.Record event) {
        store.recordHost(context(event));
        flushSoon.run();
    }
    void lifecycle(String phase, String message) {
        record(RuntimeDiagnostics.event("host-run", phase).with("message", message));
    }
    void protocol(JSONObject event) {
        // Ready URLs and other transport fields can carry authentication; retain only the error and event identity.
        record(RuntimeDiagnostics.event("host-protocol", event.optString("type")).with("message", event.optString("message")));
    }
    void failure(Throwable failure) {
        record(RuntimeDiagnostics.failure("host-error", failure));
    }
    void read(InputStream input, String source, LineConsumer consumer) throws Exception {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (!(source.equals("stdout") && line.startsWith(PROTOCOL_PREFIX))) output(source, line);
                consumer.accept(line);
            }
        }
    }
    private void output(String source, String raw) {
        // Redact the complete line before splitting, so a credential crossing a part boundary cannot leak.
        String line = RuntimeDiagnostics.clean(raw, raw.length());
        long sequence = lines.incrementAndGet();
        List<String> parts = new ArrayList<>();
        int start = 0;
        do {
            int end = Math.min(line.length(), start + MESSAGE_CHARS);
            if (end < line.length() && end > start && Character.isHighSurrogate(line.charAt(end - 1))) end--;
            parts.add(line.substring(start, end));
            start = end;
        } while (start < line.length());
        for (int part = 0; part < parts.size(); part++) {
            record(RuntimeDiagnostics.event("host-output", "line").with("source", source)
                .with("line", sequence).with("part", part + 1).with("parts", parts.size()).with("message", parts.get(part)));
        }
    }
    int awaitExit(Process child, Future<?> stderr, Future<?> stdout) throws InterruptedException, ExecutionException {
        int code = child.waitFor();
        try {
            stderr.get();
            stdout.get();
        } finally {
            record(RuntimeDiagnostics.event("host-run", "exited").with("exitCode", code));
            store.flush();
        }
        return code;
    }
}
