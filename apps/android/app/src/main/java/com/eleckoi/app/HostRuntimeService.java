package com.eleckoi.app;

import android.app.*;
import android.content.*;
import android.net.*;
import android.os.*;
import android.util.Log;
import org.json.JSONObject;
import java.io.*;
import java.lang.Process;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.*;
import java.util.concurrent.*;

/** Owns one actual ARM64 Node Host independently of Activity rotation and WebView lifetime. */
public final class HostRuntimeService extends Service {
    static final String START = "com.eleckoi.app.START", STOP = "com.eleckoi.app.STOP", RESTART = "com.eleckoi.app.RESTART";
    static final String RECOVER_PLUGINS = "com.eleckoi.app.RECOVER_PLUGINS";
    private static final String CHANNEL = "unified-host", PREFIX = "ELECKOI_HOST\t";
    private static final int NOTIFICATION = 41;
    public interface Listener { void changed(Snapshot snapshot); }
    public static final class Snapshot {
        public final String phase, message, url, diagnostic;
        public final String healthUrl, runtimeVersion;
        public final long hostPid;
        final RuntimeInstallProgress installationProgress;
        Snapshot(String phase, String message, String url, String diagnostic, String healthUrl, String runtimeVersion, long hostPid) {
            this(phase, message, url, diagnostic, healthUrl, runtimeVersion, hostPid, null);
        }
        Snapshot(String phase, String message, String url, String diagnostic, String healthUrl, String runtimeVersion, long hostPid,
                 RuntimeInstallProgress installationProgress) {
            this.phase = phase; this.message = message; this.url = url; this.diagnostic = diagnostic;
            this.healthUrl = healthUrl; this.runtimeVersion = runtimeVersion; this.hostPid = hostPid;
            this.installationProgress = installationProgress;
        }
    }
    public final class LocalBinder extends Binder {
        public HostRuntimeService service() { return HostRuntimeService.this; }
    }
    private final LocalBinder binder = new LocalBinder();
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService control = Executors.newSingleThreadExecutor();
    private final ExecutorService streams = Executors.newCachedThreadPool();
    private final Set<Listener> listeners = new CopyOnWriteArraySet<>();
    private final ArrayDeque<String> logs = new ArrayDeque<>();
    private volatile Snapshot snapshot = new Snapshot("idle", "Host 尚未启动", "", "", "", "", 0);
    private volatile String healthUrl = "", runtimeVersion = "";
    private volatile long hostPid;
    private long startupStartedAt, processStartedAt;
    private boolean firstOutputSeen;
    private boolean profileStartup;
    private long lastInstallationProgressAt;
    private volatile Process process;
    private volatile RuntimeInstaller.Installation activeInstallation;
    private volatile boolean starting, stopping, foregroundActive;
    private PowerManager.WakeLock wakeLock;
    private RuntimePaths paths;
    private ConnectivityManager connectivity;
    private ConnectivityManager.NetworkCallback networkCallback;
    private final BackgroundNetworkState backgroundNetwork = new BackgroundNetworkState();
    private String lastBackgroundStatus = "";

    @Override public void onCreate() {
        super.onCreate();
        NotificationManager notifications = getSystemService(NotificationManager.class);
        notifications.createNotificationChannel(new NotificationChannel(CHANNEL, "本地 ElecKoi Host", NotificationManager.IMPORTANCE_LOW));
        connectivity = getSystemService(ConnectivityManager.class);
        Network initialNetwork = connectivity.getActiveNetwork();
        if (initialNetwork == null) backgroundNetwork.disconnected();
        else backgroundNetwork.available(initialNetwork.getNetworkHandle());
        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override public void onAvailable(Network network) {
                control.execute(() -> { backgroundNetwork.available(network.getNetworkHandle()); refreshDns(); refreshBackgroundStatus(); });
            }
            @Override public void onLinkPropertiesChanged(Network network, LinkProperties links) { control.execute(() -> refreshDns()); }
            @Override public void onLost(Network network) {
                control.execute(() -> { backgroundNetwork.lost(network.getNetworkHandle()); refreshDns(); refreshBackgroundStatus(); });
            }
            @Override public void onBlockedStatusChanged(Network network, boolean blocked) {
                control.execute(() -> { if (backgroundNetwork.blocked(network.getNetworkHandle(), blocked)) refreshBackgroundStatus(); });
            }
        };
        connectivity.registerDefaultNetworkCallback(networkCallback);
    }
    @Override public IBinder onBind(Intent intent) { return binder; }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? START : intent.getAction();
        startForeground(NOTIFICATION, notification(snapshot.message)); foregroundActive = true;
        refreshBackgroundStatus();
        if (STOP.equals(action)) {
            stopping = true; control.execute(() -> { if (stopHost()) { foregroundActive = false; stopForeground(STOP_FOREGROUND_REMOVE); stopSelf(); } });
        } else if (RESTART.equals(action) || RECOVER_PLUGINS.equals(action)) {
            stopping = true; control.execute(() -> {
                if (stopHost()) { stopping = false; startHost(RECOVER_PLUGINS.equals(action)); }
            });
        } else if (process == null && !starting) {
            profileStartup = intent != null && intent.getBooleanExtra("eleckoi.profileStartup", false)
                && (getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0;
            starting = true; stopping = false; control.execute(this::startHost);
        }
        return START_NOT_STICKY;
    }
    public Snapshot snapshot() { return snapshot; }
    public void observe(Listener listener) { listeners.add(listener); main.post(() -> listener.changed(snapshot)); }
    public void removeObserver(Listener listener) { listeners.remove(listener); }
    String backgroundStatus() {
        return backgroundNetwork.description() + "\n" + BackgroundRunSettings.description(this);
    }
    void refreshBackgroundStatus() {
        main.post(() -> {
            if (!foregroundActive) return;
            String status = backgroundStatus();
            if (!status.equals(lastBackgroundStatus)) {
                lastBackgroundStatus = status;
                log("Background policy: " + status.replace('\n', ';'));
                ((ElecKoiApplication)getApplication()).diagnostics().record(RuntimeDiagnostics.event("background-policy", status));
            }
            getSystemService(NotificationManager.class).notify(NOTIFICATION, notification(snapshot.message));
        });
    }
    private void startHost() {
        startHost(false);
    }
    private void startHost(boolean disableUserPlugins) {
        starting = true;
        startupStartedAt = SystemClock.elapsedRealtime();
        try {
            if (!Arrays.asList(Build.SUPPORTED_ABIS).contains("arm64-v8a")) throw new IOException("离线本地 Host 需要 ARM64 Android 设备");
            paths = new RuntimePaths(this); refreshDns();
            healthUrl = ""; runtimeVersion = ""; hostPid = 0;
            state("installing", "准备统一 Host 运行环境", "");
            RuntimeInstaller.Installation installation = RuntimeInstaller.install(this, paths, progress -> {
                if (stopping) throw new CancellationException("Host startup cancelled");
                installationProgress(progress);
            });
            log("Startup runtime available after " + (SystemClock.elapsedRealtime() - startupStartedAt) + " ms");
            if (stopping) return;
            runtimeVersion = installation.version;
            activeInstallation = installation;
            wakeLock = getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ElecKoi:UnifiedHost");
            wakeLock.acquire();
            state("starting", "启动 Node 与共同 DSH Host", "",
                snapshot.installationProgress == null ? null : RuntimeInstallProgress.starting(), true);
            processStartedAt = SystemClock.elapsedRealtime(); firstOutputSeen = false;
            Process child = RuntimeCommand.create(this, paths, installation, profileStartup, disableUserPlugins).start(); process = child;
            log("Startup child created after " + (SystemClock.elapsedRealtime() - startupStartedAt) + " ms");
            streams.execute(() -> readLines(child, child.getErrorStream(), false));
            streams.execute(() -> readLines(child, child.getInputStream(), true));
            streams.execute(() -> {
                try {
                    int code = child.waitFor();
                    if (process == child) {
                        process = null; releaseWakeLock();
                        if (!stopping) state("failed", snapshot.phase.equals("failed") ? snapshot.message + " (exit " + code + ")" : "Host 进程退出，代码 " + code, "");
                    }
                } catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
            });
            // Startup must settle into a real ready state, an explicit failure or a process exit.
            streams.execute(() -> {
                try {
                    Thread.sleep(120_000);
                    if (process == child && snapshot.phase.equals("starting")) {
                        state("failed", "Host 启动超过 120 秒，未收到经过校验的 ready 协议", "");
                        child.destroy();
                    }
                } catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
            });
        } catch (Exception error) {
            ((ElecKoiApplication)getApplication()).diagnostics().record(RuntimeDiagnostics.failure("host-error",error));
            releaseWakeLock();
            if (!stopping) { log(error.toString()); state("failed", error.getMessage() == null ? error.toString() : error.getMessage(), ""); }
        } finally { starting = false; }
    }
    private void readLines(Process child, InputStream input, boolean protocol) {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                synchronized (this) {
                    if (process == child && !firstOutputSeen) {
                        firstOutputSeen = true;
                        log("Startup first output after " + (SystemClock.elapsedRealtime() - processStartedAt) + " ms from child launch");
                    }
                }
                if (protocol && line.startsWith(PREFIX)) handleProtocol(child, line.substring(PREFIX.length()));
                else log(line);
            }
        } catch (Exception error) {
            synchronized (this) {
                if (process == child && !stopping) {
                    ((ElecKoiApplication)getApplication()).diagnostics().record(RuntimeDiagnostics.failure("host-error",error));
                    log(error.toString());
                    // Closing the failed process also closes its other output
                    // stream. Preserve the original startup/protocol failure.
                    String message = snapshot.phase.equals("failed") ? snapshot.message : "Host 输出读取失败：" + error.getMessage();
                    state("failed", message, ""); child.destroy();
                }
            }
        }
    }
    private void handleProtocol(Process child, String raw) throws Exception {
        JSONObject event = new JSONObject(raw);
        if (event.getInt("protocolVersion") != 1) throw new IOException("Unsupported Host protocol version");
        switch (event.getString("type")) {
            case "ready":
                log("Startup ready protocol after " + (SystemClock.elapsedRealtime() - processStartedAt) + " ms from child launch");
                String url = event.getString("url");
                URL target = new URL(url);
                if (!target.getProtocol().equals("http") || !target.getHost().equals("127.0.0.1") || target.getPort() <= 0)
                    throw new IOException("Invalid local Host URL");
                URL health = new URL(event.getString("healthUrl"));
                if (!health.getProtocol().equals(target.getProtocol()) || !health.getHost().equals(target.getHost()) || health.getPort() != target.getPort())
                    throw new IOException("Host health URL origin differs from its ready URL");
                HttpURLConnection probe = (HttpURLConnection) health.openConnection();
                probe.setConnectTimeout(15_000); probe.setReadTimeout(15_000);
                long readyPid;
                try {
                    if (probe.getResponseCode() != 200) throw new IOException("Host health HTTP " + probe.getResponseCode());
                    JSONObject result;
                    try (InputStream body = probe.getInputStream()) { result = new JSONObject(RuntimeInstaller.readText(body)); }
                    if (!result.getString("status").equals("ready") || !result.getString("architecture").equals("dsh-remote")
                        || result.getInt("protocolVersion") != 1 || !result.getString("arch").equals("arm64"))
                        throw new IOException("Host health contract mismatch: " + result);
                    readyPid = result.getLong("pid");
                } finally { probe.disconnect(); }
                // ready is published by the Host only after eleckoiSystem.status succeeds;
                // Android also verifies the actual HTTP application is reachable.
                HostPageHandshake.verify(target);
                log("Startup HTTP verified after " + (SystemClock.elapsedRealtime() - startupStartedAt) + " ms");
                synchronized (this) {
                    if (process == child && !stopping && !snapshot.phase.equals("failed")) {
                        hostPid = readyPid; healthUrl = health.toExternalForm();
                        state("ready", "共同 Host 已就绪", url);
                        RuntimeInstaller.Installation admitted = activeInstallation;
                        control.execute(() -> {
                            if (process != child || stopping || !snapshot.phase.equals("ready")) return;
                            try { RuntimeInstaller.retireUnused(paths.installations, admitted.directory, this::log); }
                            catch (IOException error) { log("旧运行时清理失败，已保留目录：" + error.getMessage()); }
                        });
                    }
                }
                break;
            case "fatal": throw new IOException(event.optString("message", "Host fatal error"));
            case "profile-recovered":
                log("用户插件已停用，ElecKoi 内置组合已保留。配置备份：" + event.optString("backupPath", "无用户配置文件"));
                break;
            case "shutdown-complete": log("Host shutdown complete"); break;
            case "update-tasks-complete": log("Host update tasks: " + event.optString("active")); break;
            case "control-error": throw new IOException(event.getString("message"));
            default: throw new IOException("Unknown Host protocol event: " + event.getString("type"));
        }
    }
    private boolean stopHost() {
        Process child = process;
        if (child != null) {
            try {
                synchronized (child) {
                    child.getOutputStream().write("{\"type\":\"shutdown\"}\n".getBytes(StandardCharsets.UTF_8)); child.getOutputStream().flush();
                }
                if (!child.waitFor(15, TimeUnit.SECONDS)) { child.destroy(); if (!child.waitFor(3, TimeUnit.SECONDS)) child.destroyForcibly(); }
            } catch (Exception error) { log("Host shutdown: " + error); child.destroyForcibly(); }
            try {
                if (!child.waitFor(5, TimeUnit.SECONDS)) {
                    state("failed", "Host 未能停止，插件配置未修改，请关闭应用后重试", ""); return false;
                }
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
                state("failed", "Host 停止被中断，插件配置未修改", ""); return false;
            }
            if (process == child) process = null;
        }
        releaseWakeLock(); healthUrl = ""; hostPid = 0; state("stopped", "Host 已停止", "");
        return true;
    }
    private void refreshDns() {
        if (paths == null) return;
        try {
            LinkProperties link = connectivity.getLinkProperties(connectivity.getActiveNetwork());
            StringBuilder resolver = new StringBuilder("# Android active network\n");
            if (link != null) for (java.net.InetAddress address : link.getDnsServers()) resolver.append("nameserver ").append(address.getHostAddress()).append('\n');
            resolver.append("options timeout:2 attempts:2\n");
            File temporary = new File(paths.root, "resolv.conf.tmp");
            Files.write(temporary.toPath(), resolver.toString().getBytes(StandardCharsets.UTF_8));
            Files.move(temporary.toPath(), paths.resolver.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        } catch (Exception error) { log("DNS update failed: " + error); }
    }
    private synchronized void log(String line) {
        logs.addLast(line); while (logs.size() > 120) logs.removeFirst(); Log.i("ElecKoiUnifiedHost", line);
    }
    private synchronized String diagnostics() { return String.join("\n", logs); }
    private synchronized void state(String phase, String message, String url) {
        state(phase, message, url, null, true);
    }
    private synchronized void installationProgress(RuntimeInstallProgress progress) {
        RuntimeInstallProgress previous = snapshot.installationProgress;
        boolean stageChanged = previous == null || previous.stage != progress.stage || previous.archiveNumber != progress.archiveNumber;
        long now = SystemClock.elapsedRealtime();
        if (!stageChanged && progress.copiedBytes != progress.totalBytes && now - lastInstallationProgressAt < 150) return;
        lastInstallationProgressAt = now;
        state("installing", progress.message(), "", progress, stageChanged);
    }
    private synchronized void state(String phase, String message, String url, RuntimeInstallProgress progress, boolean durable) {
        snapshot = new Snapshot(phase, message, url, diagnostics(), healthUrl, runtimeVersion, hostPid, progress);
        if(durable) ((ElecKoiApplication)getApplication()).diagnostics().record(RuntimeDiagnostics.event("host-lifecycle",phase).with("hostPid",hostPid));
        Snapshot current = snapshot;
        // Copy progress stays in memory; phase transitions retain diagnostics and update the notification.
        if (durable) persistState(current);
        main.post(() -> {
            for (Listener listener : listeners) listener.changed(current);
            if (durable && foregroundActive) getSystemService(NotificationManager.class).notify(NOTIFICATION, notification(current.message));
        });
    }
    private void persistState(Snapshot current) {
        if (paths == null) return;
        try {
            JSONObject value = new JSONObject().put("schemaVersion", 1).put("protocolVersion", 1)
                .put("phase", current.phase).put("message", current.message).put("url", current.url)
                .put("healthUrl", current.healthUrl).put("runtimeVersion", current.runtimeVersion)
                .put("hostPid", current.hostPid).put("androidPid", android.os.Process.myPid())
                .put("diagnostic", current.diagnostic);
            File temporary = new File(paths.root, "host-state.json.tmp");
            synchronized (this) {
                Files.write(temporary.toPath(), value.toString().getBytes(StandardCharsets.UTF_8));
                Files.move(temporary.toPath(), paths.state.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (Exception error) { Log.e("ElecKoiUnifiedHost", "Host state persistence failed", error); }
    }
    private Notification notification(String text) {
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent stop = PendingIntent.getService(this, 1, new Intent(this, HostRuntimeService.class).setAction(STOP), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent diagnostics = PendingIntent.getActivity(this, 2, new Intent(this,MainActivity.class).setAction("eleckoi.diagnostics")
            .putExtra("eleckoi.diagnostics",true).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent background = PendingIntent.getActivity(this, 3, new Intent(this,MainActivity.class)
            .setAction(BackgroundRunSettings.OPEN).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder notification=new Notification.Builder(this,CHANNEL).setSmallIcon(android.R.drawable.ic_menu_info_details).setContentTitle("ElecKoi 本地 Host")
            .setContentText(backgroundNetwork.notification(text)).setContentIntent(open).setOngoing(true)
            .addAction(new Notification.Action.Builder(null,"后台运行",background).build());
        if("compat".equals(BuildConfig.BROWSER_VARIANT)) notification.addAction(new Notification.Action.Builder(null,"运行诊断",diagnostics).build());
        return notification.addAction(new Notification.Action.Builder(null,"停止",stop).build()).build();
    }
    private synchronized void releaseWakeLock() { if (wakeLock != null && wakeLock.isHeld()) wakeLock.release(); wakeLock = null; }
    @Override public void onDestroy() {
        stopping = true; foregroundActive = false; connectivity.unregisterNetworkCallback(networkCallback);
        control.execute(() -> { stopHost(); streams.shutdownNow(); control.shutdown(); });
        listeners.clear(); super.onDestroy();
    }
}
