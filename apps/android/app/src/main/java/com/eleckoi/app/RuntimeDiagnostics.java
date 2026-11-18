package com.eleckoi.app;

import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.*;
import java.util.regex.Pattern;

/** Rotating shell diagnostics, independent of product data and browser availability. */
final class RuntimeDiagnostics {
    static final int SEGMENT_BYTES = 1_000_000, SEGMENTS = 4, REPORT_BYTES = 500_000;
    private static final int MAX_PENDING = 128, MAX_PENDING_BYTES = 256_000;
    private static final Set<String> TEXT = new HashSet<>(Arrays.asList("kind", "stage", "id", "command", "name", "message", "stack", "source", "level", "phase", "variant", "version", "runtimeVersion", "browser", "model", "manufacturer", "system", "abi"));
    private static final Set<String> NUMBERS = new HashSet<>(Arrays.asList("line", "column", "part", "parts", "elapsedMs", "delayMs", "pageMs", "pending", "heapBytes", "heapMaxBytes", "pssKb", "availableBytes", "versionCode", "sdk", "pid", "hostPid", "occurrences", "exitCode"));
    private static final Set<String> FLAGS = new HashSet<>(Arrays.asList("visible", "connected", "success", "lowMemory"));
    private static final Pattern SECRET = Pattern.compile("(?i)(authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|password|cookie|secret)([\\\"']?\\s*[:=]\\s*[\\\"']?)[^\\s,;\\\"']+");
    private static final Pattern BEARER = Pattern.compile("(?i)\\bBearer\\s+[A-Za-z0-9._~+/-]+=*");
    private static final Pattern KEY = Pattern.compile("\\bsk-[A-Za-z0-9_-]{8,}");
    private static final Pattern URL_DATA = Pattern.compile("(https?://[^\\s?#]+)[?#][^\\s]*");
    private static final Pattern DATA = Pattern.compile("(?:data:[^\\s]+|blob:[^\\s]+)");
    static final class Record extends JSONObject {
        Record with(String key, Object value) {
            try { super.put(key, value); return this; } catch (Exception invalid) { throw new IllegalArgumentException(invalid); }
        }
    }
    static Record event(String kind, String stage) { return new Record().with("kind", kind).with("stage", stage); }
    private final File directory;
    private final int segmentBytes;
    // Producers use only this lock. Flush, rotation and report I/O use the store monitor.
    private final Object pendingLock = new Object();
    private LinkedHashSet<Record> pending = new LinkedHashSet<>();
    private final LinkedHashMap<String, Record> repeatable = new LinkedHashMap<>();
    private int pendingBytes;
    private long dropped;
    private final ArrayDeque<byte[]> unwritten = new ArrayDeque<>();
    private long restoreLength = -1;
    private volatile String storageError = "";
    RuntimeDiagnostics(File directory) { this(directory, SEGMENT_BYTES); }
    RuntimeDiagnostics(File directory, int segmentBytes) { this.directory = directory; this.segmentBytes = segmentBytes; }
    static String clean(String text, int limit) {
        if (text == null) return "";
        String value = text.substring(0, Math.min(text.length(), limit));
        value = BEARER.matcher(value).replaceAll("Bearer [redacted]");
        value = SECRET.matcher(value).replaceAll("$1$2[redacted]");
        value = KEY.matcher(value).replaceAll("[redacted]");
        value = URL_DATA.matcher(value).replaceAll("$1");
        return DATA.matcher(value).replaceAll("[resource]");
    }
    static Record filter(JSONObject source) {
        Record result = new Record();
        for (String key : TEXT) if (source.opt(key) instanceof String) result.with(key, clean((String) source.opt(key), key.equals("stack") ? 8192 : key.equals("message") ? 2048 : 512));
        for (String key : NUMBERS) if (source.opt(key) instanceof Number) {
            double value = ((Number) source.opt(key)).doubleValue();
            if (Double.isFinite(value) && (value >= 0 || key.equals("exitCode"))) result.with(key, source.opt(key));
        }
        for (String key : FLAGS) if (source.opt(key) instanceof Boolean) result.with(key, source.opt(key));
        return result;
    }
    void record(JSONObject source) {
        Record value = filter(source);
        if (value.optString("kind").isEmpty()) return;
        String key = value.toString();
        int bytes = key.getBytes(StandardCharsets.UTF_8).length + 160;
        synchronized (pendingLock) {
            long now = System.currentTimeMillis();
            Record previous = repeatable.get(key);
            if (previous != null) {
                previous.with("count", previous.optLong("count") + 1).with("lastAt", now);
                return;
            }
            while (!repeatable.isEmpty() && (repeatable.size() >= MAX_PENDING || pendingBytes + bytes > MAX_PENDING_BYTES)) {
                Iterator<Map.Entry<String, Record>> oldest = repeatable.entrySet().iterator();
                Map.Entry<String, Record> first = oldest.next();
                pending.remove(first.getValue());
                pendingBytes -= first.getKey().getBytes(StandardCharsets.UTF_8).length + 160;
                oldest.remove();
                dropped++;
            }
            pending.add(value.with("firstAt", now).with("lastAt", now).with("count", 1));
            repeatable.put(key, value);
            pendingBytes += bytes;
        }
    }
    void recordHost(JSONObject source) {
        Record value = filter(source);
        synchronized (pendingLock) {
            long now = System.currentTimeMillis();
            pending.add(value.with("firstAt", now).with("lastAt", now).with("count", 1));
        }
    }
    int pendingCount() {
        synchronized (pendingLock) { return pending.size(); }
    }
    private Set<Record> takePending() {
        synchronized (pendingLock) {
            Set<Record> batch = pending;
            pending = new LinkedHashSet<>();
            repeatable.clear();
            pendingBytes = 0;
            if (dropped > 0) {
                batch.add(new Record().with("kind", "diagnostic-overflow").with("count", dropped).with("lastAt", System.currentTimeMillis()));
                dropped = 0;
            }
            return batch;
        }
    }
    synchronized void flush() {
        try {
            persistUnwritten();
            for (Record value : takePending()) unwritten.add((value + "\n").getBytes(StandardCharsets.UTF_8));
            persistUnwritten();
        } catch (IOException failure) { storageError = clean(failure.toString(), 512); }
    }
    private void persistUnwritten() throws IOException {
        if (unwritten.isEmpty()) return;
        Files.createDirectories(directory.toPath());
        File active = segment(0);
        if (restoreLength >= 0) {
            try (RandomAccessFile output = new RandomAccessFile(active, "rw")) {
                output.setLength(restoreLength);
            }
            restoreLength = -1;
        }
        while (!unwritten.isEmpty()) {
            int firstSize = unwritten.getFirst().length;
            if (firstSize > segmentBytes) throw new IOException("Diagnostic record exceeds segment size");
            long length = active.length();
            if (length + firstSize > segmentBytes) {
                rotate();
                length = 0;
            }
            ByteArrayOutputStream batch = new ByteArrayOutputStream();
            int count = 0;
            for (byte[] row : unwritten) {
                if (length + batch.size() + row.length > segmentBytes) break;
                batch.write(row);
                count++;
            }
            try (RandomAccessFile output = new RandomAccessFile(active, "rw")) {
                output.seek(length);
                try {
                    output.write(batch.toByteArray());
                } catch (IOException failure) {
                    // Retry from the last complete record boundary if the write partially succeeded.
                    restoreLength = length;
                    try {
                        output.setLength(length);
                        restoreLength = -1;
                    } catch (IOException rollback) {
                        failure.addSuppressed(rollback);
                    }
                    throw failure;
                }
                for (int index = 0; index < count; index++) unwritten.removeFirst();
            }
        }
        storageError = "";
    }
    private File segment(int index) { return new File(directory, "events-" + index + ".jsonl"); }
    private void rotate() throws IOException {
        Files.deleteIfExists(segment(SEGMENTS - 1).toPath());
        for (int index = SEGMENTS - 2; index >= 0; index--) if (segment(index).isFile())
            Files.move(segment(index).toPath(), segment(index + 1).toPath(), StandardCopyOption.REPLACE_EXISTING);
    }
    synchronized String report(JSONObject environment, int maximum) throws IOException {
        flush();
        String header = "ElecKoi Android runtime diagnostics\n" + filter(environment) + "\n";
        if (!storageError.isEmpty()) header += "Diagnostic storage failure: " + storageError + "\n";
        header += "Recent events (oldest first; bounded tail):\n";
        int budget = Math.min(maximum, REPORT_BYTES) - header.getBytes(StandardCharsets.UTF_8).length;
        List<byte[]> chunks = new ArrayList<>();
        for (int index = 0; index < SEGMENTS && budget > 0; index++) {
            File path = segment(index); if (!path.isFile()) continue;
            try (RandomAccessFile input = new RandomAccessFile(path, "r")) {
                int count = (int) Math.min(input.length(), budget); long offset = input.length() - count;
                byte[] chunk = new byte[count]; input.seek(offset); input.readFully(chunk);
                if (offset > 0) { int first = 0; while (first < chunk.length && chunk[first++] != '\n') { } chunk = Arrays.copyOfRange(chunk, first, chunk.length); }
                chunks.add(0, chunk); budget -= count;
            }
        }
        ByteArrayOutputStream output = new ByteArrayOutputStream(); output.write(header.getBytes(StandardCharsets.UTF_8));
        for (byte[] chunk : chunks) output.write(chunk);
        return output.toString(StandardCharsets.UTF_8.name());
    }
    /** 最近若干行事件（旧到新，已过白名单与 clean）。给 Bug 报告读，不改存储。 */
    synchronized List<String> recent(int limit) {
        flush();
        int maximum = Math.max(1, Math.min(limit, 2000));
        List<String> lines = new ArrayList<>();
        int budget = REPORT_BYTES;
        for (int index = SEGMENTS - 1; index >= 0 && budget > 0; index--) {
            File path = segment(index); if (!path.isFile()) continue;
            try {
                byte[] bytes = Files.readAllBytes(path.toPath());
                boolean partial = bytes.length > budget;
                if (partial) bytes = Arrays.copyOfRange(bytes, bytes.length - budget, bytes.length);
                budget -= bytes.length;
                String text = new String(bytes, StandardCharsets.UTF_8);
                if (partial) { int firstBreak = text.indexOf('\n'); text = firstBreak < 0 ? "" : text.substring(firstBreak + 1); }
                for (String line : text.split("\n")) if (!line.trim().isEmpty()) lines.add(line);
            } catch (IOException failure) { storageError = clean(failure.toString(), 512); }
        }
        return lines.size() <= maximum ? lines : new ArrayList<>(lines.subList(lines.size() - maximum, lines.size()));
    }
    synchronized File export(JSONObject environment) throws IOException {
        String text = report(environment, REPORT_BYTES);
        Files.createDirectories(directory.toPath());
        File exports = new File(directory, "export"); Files.createDirectories(exports.toPath());
        File target = new File(exports, "report.txt");
        Files.write(target.toPath(), text.getBytes(StandardCharsets.UTF_8));
        return target;
    }
    static Record failure(String kind, Throwable failure) {
        StringWriter text = new StringWriter();
        // Bound cause traversal and frames before allocating a report.
        Set<Throwable> seen = Collections.newSetFromMap(new IdentityHashMap<>());
        for (Throwable current = failure; current != null && seen.size() < 8 && seen.add(current); current = current.getCause()) {
            text.append(clean(current.toString(), 1024)).append('\n');
            StackTraceElement[] frames = current.getStackTrace();
            for (int i = 0; i < Math.min(frames.length, 32); i++) text.append("    at ").append(frames[i].toString()).append('\n');
        }
        return new Record().with("kind", kind).with("name", failure.getClass().getName()).with("message", clean(failure.getMessage(), 2048)).with("stack", clean(text.toString(), 8192));
    }
}
