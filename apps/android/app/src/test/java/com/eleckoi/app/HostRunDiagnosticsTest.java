package com.eleckoi.app;

import org.json.JSONObject;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.*;
import static org.junit.Assert.*;

public class HostRunDiagnosticsTest {
    @Rule public TemporaryFolder temporary = new TemporaryFolder();

    /** A real child exits with the same code as the reported incident, leaving both output pipes to drain. */
    public static final class FailingChild {
        public static void main(String[] args) {
            System.out.println("Synthetic Host ready");
            System.err.println("TypeError: Synthetic Host runtime failure");
            for (int i = 0; i < 180; i++) System.err.println("    at syntheticTask" + i + " (synthetic-host.mjs:" + (i + 1) + ":7)");
            System.err.print("Caused by: synthetic final line without newline");
            System.exit(1);
        }
    }

    @Test(timeout = 30_000) public void drainsBothPipesBeforePublishingExitAndKeepsTheCrashAfterRetryAndReopen() throws Exception {
        File directory = temporary.newFolder();
        RuntimeDiagnostics store = new RuntimeDiagnostics(directory);
        HostRunDiagnostics run = new HostRunDiagnostics(store);
        run.installed("synthetic-runtime-a"); run.ready(1234);
        String java = new File(System.getProperty("java.home"), "bin/java").getPath();
        String classes = new File(FailingChild.class.getProtectionDomain().getCodeSource().getLocation().toURI()).getPath();
        Process child = new ProcessBuilder(java, "-cp", classes, FailingChild.class.getName()).start();
        ExecutorService readers = Executors.newFixedThreadPool(2);
        try {
            Future<?> stderr = readers.submit(() -> { run.read(child.getErrorStream(), "stderr", ignored -> {}); return null; });
            Future<?> stdout = readers.submit(() -> { run.read(child.getInputStream(), "stdout", ignored -> {}); return null; });
            assertEquals(1, run.awaitExit(child, stderr, stdout));
            String firstReport = store.report(new JSONObject(), RuntimeDiagnostics.REPORT_BYTES);
            assertTrue(firstReport.contains("syntheticTask179"));
            assertTrue(firstReport.contains("synthetic final line without newline"));
            assertTrue(firstReport.indexOf("synthetic final line without newline") < firstReport.indexOf("\"exitCode\":1"));
            HostRunDiagnostics retry = new HostRunDiagnostics(store);
            retry.installed("synthetic-runtime-b");
            retry.lifecycle("failed", "Host 启动超过 120 秒，未收到经过校验的 ready 协议");
            retry.failure(new java.io.InterruptedIOException("read interrupted by close() on another thread"));
            RuntimeDiagnostics reopened = new RuntimeDiagnostics(directory);
            String copied = reopened.report(new JSONObject(), RuntimeDiagnostics.REPORT_BYTES);
            File exported = reopened.export(new JSONObject());
            assertEquals(copied, Files.readString(exported.toPath()));
            assertTrue(copied.contains(run.id)); assertTrue(copied.contains(retry.id));
            assertTrue(copied.contains("synthetic-runtime-a")); assertTrue(copied.contains("synthetic-runtime-b"));
            assertTrue(copied.contains("\"hostPid\":1234"));
            assertTrue(copied.contains("\"source\":\"stdout\"")); assertTrue(copied.contains("\"source\":\"stderr\""));
            assertTrue(copied.contains("TypeError: Synthetic Host runtime failure"));
            assertTrue(copied.contains("read interrupted by close()"));
        } finally {
            child.destroyForcibly(); readers.shutdownNow();
        }
    }

    @Test public void preservesLongUnicodeLinesAndRedactsSecretsBeforeSplitting() throws Exception {
        RuntimeDiagnostics store = new RuntimeDiagnostics(temporary.newFolder());
        HostRunDiagnostics run = new HostRunDiagnostics(store);
        String line = "测".repeat(2040) + "api_key=synthetic-secret " + "🦈".repeat(6000) + " END";
        run.read(input(line), "stderr", ignored -> {});
        List<JSONObject> parts = new ArrayList<>();
        for (String record : store.recent(200)) {
            JSONObject value = new JSONObject(record);
            if (value.optString("kind").equals("host-output")) parts.add(value);
        }
        StringBuilder recovered = new StringBuilder();
        for (int i = 0; i < parts.size(); i++) {
            JSONObject part = parts.get(i);
            assertEquals(i + 1, part.getInt("part")); assertEquals(parts.size(), part.getInt("parts"));
            recovered.append(part.getString("message"));
        }
        assertEquals(RuntimeDiagnostics.clean(line, line.length()), recovered.toString());
        assertFalse(recovered.toString().contains("synthetic-secret"));
        assertFalse(recovered.toString().contains("\uFFFD"));
    }

    @Test public void recordsProtocolFailuresWithoutPersistingTransportCredentials() throws Exception {
        RuntimeDiagnostics store = new RuntimeDiagnostics(temporary.newFolder());
        HostRunDiagnostics run = new HostRunDiagnostics(store);
        JSONObject ready = new JSONObject().put("type", "ready").put("url", "http://127.0.0.1:31001/?token=synthetic-transport-secret");
        run.read(input(HostRunDiagnostics.PROTOCOL_PREFIX + ready), "stdout", line ->
            run.protocol(new JSONObject(line.substring(HostRunDiagnostics.PROTOCOL_PREFIX.length()))));
        run.protocol(new JSONObject().put("type", "fatal").put("message", "Synthetic boot failure api_key=synthetic-api-secret"));
        String report = store.report(new JSONObject(), RuntimeDiagnostics.REPORT_BYTES);
        assertTrue(report.contains("Synthetic boot failure")); assertTrue(report.contains("host-protocol"));
        assertFalse(report.contains("synthetic-transport-secret")); assertFalse(report.contains("synthetic-api-secret"));
    }

    @Test(timeout = 30_000) public void concurrentHostOutputRotationKeepsDiskAndExportsBounded() throws Exception {
        File directory = temporary.newFolder();
        RuntimeDiagnostics store = new RuntimeDiagnostics(directory);
        HostRunDiagnostics run = new HostRunDiagnostics(store);
        ExecutorService readers = Executors.newFixedThreadPool(2);
        try {
            List<Future<?>> writes = new ArrayList<>();
            for (String source : new String[] { "stdout", "stderr" }) writes.add(readers.submit(() -> {
                for (int i = 0; i < 600; i++) run.read(input(source + "-" + i + " " + "测".repeat(1500)), source, ignored -> {});
                return null;
            }));
            for (int i = 0; i < 30; i++) store.export(new JSONObject());
            for (Future<?> write : writes) write.get(30, TimeUnit.SECONDS);
            long bytes = 0;
            for (File file : directory.listFiles()) if (file.getName().startsWith("events-")) {
                assertTrue(file.length() <= RuntimeDiagnostics.SEGMENT_BYTES); bytes += file.length();
                for (String record : Files.readAllLines(file.toPath())) new JSONObject(record);
            }
            assertTrue(bytes <= RuntimeDiagnostics.SEGMENTS * RuntimeDiagnostics.SEGMENT_BYTES);
            assertTrue(directory.listFiles().length <= RuntimeDiagnostics.SEGMENTS + 1);
            File report = store.export(new JSONObject());
            assertTrue(report.length() <= RuntimeDiagnostics.REPORT_BYTES);
            assertEquals(report, store.export(new JSONObject()));
            assertTrue(Files.readString(report.toPath()).contains("-599"));
            assertTrue(bytes + report.length() <= RuntimeDiagnostics.SEGMENTS * RuntimeDiagnostics.SEGMENT_BYTES + RuntimeDiagnostics.REPORT_BYTES);
        } finally { readers.shutdownNow(); }
    }

    @Test public void reportsOutputStorageFailureInsteadOfReturningAnApparentlyCompleteReport() throws Exception {
        RuntimeDiagnostics store = new RuntimeDiagnostics(temporary.newFile());
        HostRunDiagnostics run = new HostRunDiagnostics(store);
        run.read(input("Synthetic error before exit"), "stderr", ignored -> {});
        assertTrue(store.report(new JSONObject(), 48_000).contains("Diagnostic storage failure"));
    }

    private static ByteArrayInputStream input(String text) {
        return new ByteArrayInputStream(text.getBytes(StandardCharsets.UTF_8));
    }
}
