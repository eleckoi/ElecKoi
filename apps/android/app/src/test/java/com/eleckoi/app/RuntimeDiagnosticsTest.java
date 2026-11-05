package com.eleckoi.app;

import org.json.JSONObject;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import java.io.File;
import java.nio.file.Files;
import java.nio.charset.StandardCharsets;
import static org.junit.Assert.*;

public class RuntimeDiagnosticsTest {
    @Rule public TemporaryFolder temporary = new TemporaryFolder();
    @Test public void recordsAfterReadinessMergesRepeatsAndSurvivesReopen() throws Exception {
        File directory = temporary.newFolder(); RuntimeDiagnostics store = new RuntimeDiagnostics(directory);
        store.record(RuntimeDiagnostics.event("page-lifecycle", "client-ready"));
        for(int i=0;i<100;i++) store.record(RuntimeDiagnostics.failure("page-error", new IllegalStateException("synthetic failure")));
        assertEquals(2,store.pendingCount()); store.flush();
        String report=new RuntimeDiagnostics(directory).report(new JSONObject(),48_000);
        assertTrue(report.contains("synthetic failure")); assertTrue(report.contains("RuntimeDiagnosticsTest.java"));
        assertTrue(report.contains("\"count\":100")); assertTrue(report.contains("client-ready"));
    }
    @Test public void keepsTheHeapLimitOfMemoryRecords() throws Exception {
        File directory = temporary.newFolder(); RuntimeDiagnostics store = new RuntimeDiagnostics(directory);
        store.record(new RuntimeDiagnostics.Record().with("kind", "memory").with("heapBytes", 1L).with("heapMaxBytes", 2L));
        store.flush();
        String line = new RuntimeDiagnostics(directory).recent(10).get(0);
        assertTrue(line.contains("\"heapMaxBytes\":2"));
    }
    @Test public void boundsMemoryDiskAndExportOverManyRequestsWithoutProductPayloads() throws Exception {
        File directory=temporary.newFolder(); RuntimeDiagnostics store=new RuntimeDiagnostics(directory,16_000);
        for(int round=0;round<60;round++) {
            for(int i=0;i<200;i++) store.record(RuntimeDiagnostics.event("browser-command","native-send").with("id","synthetic-"+round+"-"+i)
                .with("command","back").with("payload",new JSONObject().put("content","synthetic private content")));
            assertTrue(store.pendingCount()<=128); store.flush();
        }
        File first=store.export(new JSONObject().put("variant","compat"));
        File second=store.export(new JSONObject().put("variant","compat")); assertEquals(first,second);
        long bytes;
        try(java.util.stream.Stream<java.nio.file.Path> files=Files.walk(directory.toPath())) { bytes=files.filter(Files::isRegularFile).mapToLong(path->path.toFile().length()).sum(); }
        for(File file:directory.listFiles()) if(file.getName().startsWith("events-")) assertTrue(file.length()<=16_000);
        assertTrue(directory.listFiles().length<=RuntimeDiagnostics.SEGMENTS+1);
        assertTrue(bytes<=RuntimeDiagnostics.SEGMENTS*16_000+RuntimeDiagnostics.REPORT_BYTES);
        String text=Files.readString(second.toPath()); assertFalse(text.contains("synthetic private content"));
        assertTrue(text.contains("synthetic-59-199")); assertFalse(text.contains("synthetic-0-0"));
        assertTrue(text.contains("diagnostic-overflow"));
    }
    @Test public void stripsCredentialsUrlQueriesAndObjectPayloadsWhilePreservingStackLocation() throws Exception {
        File directory=temporary.newFolder(); RuntimeDiagnostics store=new RuntimeDiagnostics(directory);
        store.record(RuntimeDiagnostics.event("page-error","unhandledrejection").with("message","Authorization: Bearer synthetic-token api_key=synthetic-key password=synthetic-pass")
            .with("stack","Error\n at apply (http://127.0.0.1:31001/assets/synthetic.js?token=synthetic-secret:10:8)")
            .with("arguments",new JSONObject().put("content","synthetic content")));
        String report=store.report(new JSONObject(),48_000);
        for(String excluded:new String[]{"synthetic-token","synthetic-key","synthetic-pass","synthetic-secret","synthetic content"}) assertFalse(excluded,report.contains(excluded));
        assertTrue(report.contains("/assets/synthetic.js")); assertTrue(report.contains("[redacted]"));
    }
    @Test public void capsMultibyteReportAndIndividualFieldsAndReportsStorageFailure() throws Exception {
        File directory=temporary.newFolder(); RuntimeDiagnostics store=new RuntimeDiagnostics(directory);
        for(int i=0;i<128;i++) store.record(RuntimeDiagnostics.event("page-error","synthetic-"+i).with("stack","测".repeat(20_000)));
        assertTrue(store.report(new JSONObject(),12_000).getBytes(StandardCharsets.UTF_8).length<=12_000);
        File blocked=temporary.newFile(); RuntimeDiagnostics failed=new RuntimeDiagnostics(blocked);
        failed.record(RuntimeDiagnostics.event("page-error","synthetic")); failed.flush();
        assertTrue(failed.report(new JSONObject(),48_000).contains("Diagnostic storage failure"));
        try { failed.export(new JSONObject()); fail("Export must report IO failure"); } catch(java.io.IOException expected) { }
    }
}
