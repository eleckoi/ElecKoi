package com.eleckoi.app;

import android.Manifest;
import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.animation.AnimatorSet;
import android.animation.ObjectAnimator;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.*;
import android.provider.Settings;
import android.util.Base64;
import android.webkit.*;
import android.webkit.CookieManager;
import android.widget.*;
import android.view.*;
import androidx.core.view.WindowInsetsCompat;
import org.json.JSONObject;
import org.json.JSONArray;
import java.util.function.Consumer;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;

/** Platform UI only. The real Host owns pages, accounts, products and conversations. */
public final class MainActivity extends Activity implements HostRuntimeService.Listener {
    private static final int PICK_FILES = 20, SAVE_FILE = 21, NOTIFICATIONS = 22, SAVE_DIAGNOSTICS = 23;
    private AndroidDiagnostics diagnostics;
    private File pendingDiagnosticExport;
    private boolean diagnosticExportBusy;
    private final ExecutorService files = Executors.newSingleThreadExecutor();
    private HostRuntimeService runtime;
    private boolean bound;
    private BrowserSurface web;
    private boolean imeVisible;
    private boolean bottomButtonNavigation;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private long pageStartedAt;
    private String clientReadyUrl = "";
    private final WebClientStartupDiagnostics clientStartupDiagnostics = new WebClientStartupDiagnostics();
    private String clientStartupFailure = "";
    private Runnable pageTimeout;
    private long pageLoadGeneration;
    private FrameLayout page;
    private TextView status;
    private LinearLayout runtimePanel;
    private LinearLayout startupProgressPanel;
    private FrameLayout startupProgressOverlay;
    private TextView startupProgressLabel, firstInstallationNotice;
    private ProgressBar startupProgressBar;
    private StartupMascotView startupMascot;
    private AnimatorSet startupExit;
    private volatile String loadedUrl = "";
    private boolean appearanceDark;
    private int appearanceBackground = Color.rgb(245, 245, 245);
    private int appearanceSurface = Color.WHITE;
    private int appearanceForeground = Color.rgb(22, 22, 22);
    private int appearanceBorder = Color.rgb(184, 184, 184);
    private AlertDialog diagnosticsDialog;
    private Consumer<Uri[]> fileChoice;
    private PendingSave pendingSave;
    private String platformSource;
    private SystemSpeech systemSpeech;
    private AppUpdates updates;
    private final AppUpdates.Listener updateListener = snapshot -> ui.post(() -> {
        try { if (web != null && sameHost(web.getUrl())) emitBrowserEvent("eleckoi:updates-changed", new JSONObject(snapshot)); } catch (Exception error) { showFailure(error.toString()); }
    });
    private final ConcurrentMap<String, StagedSave> stagedSaves = new ConcurrentHashMap<>();
    private final ServiceConnection connection = new ServiceConnection() {
        @Override public void onServiceConnected(ComponentName name, IBinder binder) {
            runtime = ((HostRuntimeService.LocalBinder) binder).service(); runtime.observe(MainActivity.this);
        }
        @Override public void onServiceDisconnected(ComponentName name) { runtime = null; showFailure("Host 服务连接断开"); }
    };
    private static final class PendingSave {
        final String requestId, name, mimeType, text, downloadUrl;
        final File source;
        PendingSave(String id, String name, String mime, String text, String download, File source) {
            requestId=id; this.name=name; mimeType=mime; this.text=text; downloadUrl=download; this.source=source;
        }
    }
    private static final class StagedSave {
        final PendingSave request;
        final OutputStream output;
        StagedSave(PendingSave request, OutputStream output) { this.request=request; this.output=output; }
    }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        diagnostics=((ElecKoiApplication)getApplication()).diagnostics();
        updates=((ElecKoiApplication)getApplication()).updates();
        updates.observe(updateListener); updates.startup();
        systemSpeech = new SystemSpeech(this, this::platformResult);
        page = new FrameLayout(this);
        if (Build.VERSION.SDK_INT >= 30) getWindow().setDecorFitsSystemWindows(false);
        page.setOnApplyWindowInsetsListener((view, insets) -> {
            WindowInsetsCompat compat = WindowInsetsCompat.toWindowInsetsCompat(insets, view);
            boolean buttons = compat.getInsets(WindowInsetsCompat.Type.tappableElement()).bottom > 0;
            if (bottomButtonNavigation != buttons) {
                bottomButtonNavigation = buttons;
                applyNavigationLayout();
            }
            boolean visible = compat.isVisible(WindowInsetsCompat.Type.ime());
            if (imeVisible != visible) {
                imeVisible = visible;
                applyImeVisibility();
            }
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets safe = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
            } else {
                view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            // The container already applies these insets to the WebView bounds.
            return WindowInsetsCompat.CONSUMED.toWindowInsets();
        });
        runtimePanel = new LinearLayout(this); runtimePanel.setOrientation(LinearLayout.VERTICAL); runtimePanel.setElevation(0f);
        runtimePanel.setPadding(dp(20), dp(16), dp(20), dp(16));
        runtimePanel.setVisibility(View.GONE);
        status = new TextView(this); status.setTextSize(14); status.setLineSpacing(dp(3), 1f); status.setPadding(0, dp(8), 0, dp(10));
        runtimePanel.addView(status);
        LinearLayout actions = new LinearLayout(this);
        actions.addView(button("重试", this::retryStartup));
        actions.addView(button("查看错误", this::showDiagnostics));
        actions.setGravity(Gravity.CENTER_VERTICAL); actions.setPadding(0, dp(2), 0, 0);
        runtimePanel.addView(actions, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        Button recover = button("停用用户插件并重启", this::confirmPluginRecovery);
        LinearLayout.LayoutParams recoveryLayout = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(44));
        recoveryLayout.topMargin = dp(6); recover.setLayoutParams(recoveryLayout);
        runtimePanel.addView(recover);
        startupProgressPanel = new LinearLayout(this); startupProgressPanel.setOrientation(LinearLayout.VERTICAL);
        startupProgressOverlay = new FrameLayout(this);
        startupProgressOverlay.setClickable(true);
        startupProgressPanel.setClipChildren(false);
        startupProgressPanel.setPadding(dp(8), dp(16), dp(8), dp(16));
        firstInstallationNotice = new TextView(this);
        firstInstallationNotice.setText(R.string.first_runtime_installation); firstInstallationNotice.setTextSize(14);
        firstInstallationNotice.setGravity(Gravity.CENTER); firstInstallationNotice.setPadding(0, dp(16), 0, 0);
        firstInstallationNotice.setVisibility(View.GONE);
        firstInstallationNotice.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        startupProgressLabel = new TextView(this); startupProgressLabel.setTextSize(16); startupProgressLabel.setGravity(Gravity.CENTER);
        startupProgressLabel.setId(R.id.runtime_startup_label);
        startupProgressLabel.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        startupMascot = new StartupMascotView(this);
        LinearLayout.LayoutParams mascotLayout = new LinearLayout.LayoutParams(dp(216), dp(132));
        mascotLayout.gravity = Gravity.CENTER_HORIZONTAL; mascotLayout.bottomMargin = dp(24);
        startupProgressPanel.addView(startupMascot, mascotLayout);
        startupProgressPanel.addView(startupProgressLabel);
        startupProgressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        startupProgressBar.setId(R.id.runtime_startup_progress); startupProgressBar.setMax(100);
        LinearLayout.LayoutParams barLayout = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(8));
        barLayout.topMargin = dp(16); startupProgressPanel.addView(startupProgressBar, barLayout);
        startupProgressPanel.addView(firstInstallationNotice);
        showStartupProgress(null, getString(R.string.runtime_starting));
        applyAppearance(false, null);
        try (InputStream source = getAssets().open("platform-facade.js")) {
            platformSource = RuntimeInstaller.readText(source);
        } catch (IOException error) { throw new IllegalStateException("Packaged platform facade missing", error); }
        web = new PlatformBrowser(this, platformSource, new PlatformBridge(), new BrowserSurface.Listener() {
            public boolean sameHost(String url) { return MainActivity.this.sameHost(url); }
            public void diagnostic(JSONObject event) { diagnostics.record(event); }
            public void external(String url) { MainActivity.this.openExternal(url); }
            public void failure(String message) { showFailure(message); }
            public void documentReady() { applyImeVisibility(); applyNavigationLayout(); }
            public void console(String level, String message, String source, int line) { ui.post(() -> {
                if (("ERROR".equalsIgnoreCase(level) || "WARNING".equalsIgnoreCase(level) || "warn".equals(level))
                    && sameHost(web.getUrl()) && clientStartupDiagnostics.record(level + ": " + message, source, line)) {
                    if (!clientStartupFailure.isEmpty()) status.setText(clientStartupDiagnostics.failure(clientStartupFailure));
                }
            }); }
            public void chooseFiles(String[] types, boolean multiple, boolean save, String name, Consumer<Uri[]> completion) {
                chooseBrowserFiles(types, multiple, save, name, completion);
            }
            public void download(String url, String disposition, String mime, InputStream body) { browserDownload(url, disposition, mime, body); }
            public BrowserSurface.Resource media(Uri url, String method, java.util.Map<String,String> headers) { return localMedia(url, method, headers); }
        });
        web.setAppearance(appearanceDark, appearanceBackground);
        web.view().setId(R.id.browser_surface);
        page.addView(web.view(), new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        FrameLayout.LayoutParams progressLayout = new FrameLayout.LayoutParams(dp(360), ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER);
        startupProgressOverlay.addView(startupProgressPanel, progressLayout);
        // Keep one native indicator visible until the real Client is painted.
        page.addView(startupProgressOverlay, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        page.addOnLayoutChangeListener((view, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom) -> {
            int available = right - left - page.getPaddingLeft() - page.getPaddingRight() - dp(32);
            if (available <= 0) return;
            FrameLayout.LayoutParams layout = (FrameLayout.LayoutParams) startupProgressPanel.getLayoutParams();
            int width = Math.min(dp(360), available);
            if (layout.width != width) { layout.width = width; startupProgressPanel.setLayoutParams(layout); }
            LinearLayout.LayoutParams mascotLayoutParams = (LinearLayout.LayoutParams) startupMascot.getLayoutParams();
            int mascotWidth = Math.min(dp(216), Math.max(1, width - dp(16)));
            if (mascotLayoutParams.width != mascotWidth) {
                mascotLayoutParams.width = mascotWidth;
                mascotLayoutParams.height = Math.round(mascotWidth * 132f / 216);
                startupMascot.setLayoutParams(mascotLayoutParams);
            }
        });
        page.addView(runtimePanel, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP));
        setContentView(page);
        if(getIntent().getBooleanExtra("eleckoi.diagnostics",false)) ui.post(this::showDiagnostics);
        page.requestApplyInsets();
        // UI development uses the same Android WebView and platform bridge,
        // connected to a local shared Host via adb reverse. It does not claim
        // that the emulator ran the phone-local ARM64 runtime.
        String previewUrl = getIntent().getStringExtra("eleckoi.previewUrl");
        if (previewUrl != null && (getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            Uri preview = Uri.parse(previewUrl);
            if (!"http".equals(preview.getScheme()) || !"127.0.0.1".equals(preview.getHost()))
                throw new IllegalArgumentException("WebClient preview requires a local adb-reversed Host URL");
            runtimePanel.setVisibility(View.GONE);
            loadHostPage(previewUrl);
            return;
        }
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
            && !getPreferences(MODE_PRIVATE).getBoolean("notificationRequested", false)) {
            getPreferences(MODE_PRIVATE).edit().putBoolean("notificationRequested", true).apply();
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATIONS);
        }
        startRuntime(HostRuntimeService.START);
    }
    private JSONObject attributePayload(String name, boolean value) {
        try { return new JSONObject().put("name", name).put("value", value); }
        catch (Exception error) { throw new IllegalArgumentException(error); }
    }
    private void emitBrowserEvent(String type, Object detail) {
        try { web.command("emit", new JSONObject().put("event", type).put("detail", detail), null); }
        catch (Exception error) { showFailure("平台事件发送失败：" + error); }
    }
    private void browserCommand(String type, JSONObject payload, Consumer<String> completion) {
        web.command(type, payload, completion);
    }
    private void chooseBrowserFiles(String[] accepted, boolean multiple, boolean save, String name, Consumer<Uri[]> completion) {
        if (fileChoice != null) fileChoice.accept(null);
        fileChoice = completion;
        String[] types = accepted == null ? new String[0] : accepted;
        Intent choose = new Intent(save ? Intent.ACTION_CREATE_DOCUMENT : Intent.ACTION_OPEN_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
        if (types.length > 0 && !types[0].trim().isEmpty()) choose.putExtra(Intent.EXTRA_MIME_TYPES, types);
        choose.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple);
        if (save) choose.setType(types.length > 0 && !types[0].trim().isEmpty() ? types[0] : "application/octet-stream").putExtra(Intent.EXTRA_TITLE, name);
        try { startActivityForResult(choose, PICK_FILES); }
        catch (Exception error) { fileChoice.accept(null); fileChoice = null; showFailure("文件选择失败：" + error.getMessage()); }
    }
    private void browserDownload(String url, String disposition, String mime, InputStream body) {
        String name = URLUtil.guessFileName(url, disposition, mime);
        String type = mime == null ? "application/octet-stream" : mime;
        if (body != null) {
            long generation = pageLoadGeneration;
            files.execute(() -> {
                File staged = null;
                try (InputStream input = body) {
                    staged = File.createTempFile("eleckoi-download-", ".bin", getCacheDir());
                    try (OutputStream output = new FileOutputStream(staged)) { copy(input, output); }
                    PendingSave save = new PendingSave("download-" + System.nanoTime(), name, type, null, null, staged);
                    ui.post(() -> {
                        if (isDestroyed() || generation != pageLoadGeneration) discardSource(save);
                        else beginSave(save);
                    });
                } catch (Exception error) {
                    if (staged != null && !staged.delete()) android.util.Log.e("ElecKoiDownload", "Download staging cleanup failed");
                    showFailure("文件下载失败：" + error);
                }
            });
            return;
        }
        if (url.startsWith("blob:") || url.startsWith("data:")) {
            try { web.command("download", new JSONObject().put("name", name).put("url", url).put("mime", type), null); }
            catch (Exception error) { showFailure("文件下载失败：" + error); }
            return;
        }
        beginSave(new PendingSave("download-" + System.nanoTime(), name, type, null, url, null));
    }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private void applyImeVisibility() {
        if (web == null || !sameHost(web.getUrl())) return;
        browserCommand("attribute", attributePayload("data-eleckoi-ime-visible", imeVisible), null);
    }
    private void applyNavigationLayout() {
        if (web == null || !sameHost(web.getUrl())) return;
        browserCommand("attribute", attributePayload("data-eleckoi-button-navigation", bottomButtonNavigation), null);
    }
    private GradientDrawable panelButtonBackground(boolean primary) {
        GradientDrawable drawable = new GradientDrawable(); drawable.setCornerRadius(dp(10));
        int accent = appearanceDark ? Color.rgb(142, 179, 255) : Color.rgb(40, 93, 216);
        drawable.setColor(primary ? accent : Color.TRANSPARENT);
        drawable.setStroke(dp(1), primary ? accent : appearanceBorder);
        return drawable;
    }
    private void themeNativeChildren(View view) {
        if (view instanceof Button) {
            Button button = (Button) view;
            boolean primary = "primary".equals(button.getTag());
            button.setTextColor(primary ? (appearanceDark ? Color.rgb(16, 35, 66) : Color.WHITE) : appearanceForeground);
            button.setBackground(panelButtonBackground(primary));
            button.setAllCaps(false); button.setMinHeight(dp(44)); button.setMinimumHeight(dp(44));
        } else if (view instanceof TextView) {
            ((TextView) view).setTextColor(view == status ? (appearanceDark ? Color.rgb(195, 200, 208) : Color.rgb(65, 65, 65)) : appearanceForeground);
        }
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int index = 0; index < group.getChildCount(); index++) themeNativeChildren(group.getChildAt(index));
        }
    }
    private void themeDiagnosticsDialog() {
        if (diagnosticsDialog == null || diagnosticsDialog.getWindow() == null) return;
        GradientDrawable background = new GradientDrawable(); background.setColor(appearanceSurface);
        background.setCornerRadius(dp(12)); background.setStroke(dp(1), appearanceBorder);
        diagnosticsDialog.getWindow().setBackgroundDrawable(background);
        themeNativeChildren(diagnosticsDialog.getWindow().getDecorView());
    }
    private Button button(String text, Runnable action) {
        Button button = new Button(this); button.setText(text); button.setTextSize(13); button.setAllCaps(false);
        button.setMinHeight(dp(44)); button.setMinimumHeight(dp(44)); button.setMinWidth(dp(44));
        button.setPadding(dp(12), 0, dp(12), 0); button.setGravity(Gravity.CENTER); button.setStateListAnimator(null);
        boolean primary = text.startsWith("重试"); button.setTag(primary ? "primary" : "secondary");
        button.setBackground(panelButtonBackground(primary));
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(0, dp(44), 1f); layout.setMargins(0, 0, dp(6), 0); button.setLayoutParams(layout);
        button.setOnClickListener(v -> action.run()); return button;
    }
    private void startRuntime(String action) {
        Intent intent = new Intent(this, HostRuntimeService.class).setAction(action)
            .putExtra("eleckoi.profileStartup", getIntent().getBooleanExtra("eleckoi.profileStartup", false));
        startForegroundService(intent);
        if (!bound) { bound = bindService(intent, connection, BIND_AUTO_CREATE); }
    }
    private void retryStartup() {
        runtimePanel.setVisibility(View.GONE);
        showStartupProgress(null, getString(R.string.runtime_starting));
        if (runtime != null && runtime.snapshot().phase.equals("ready")) loadHostPage(runtime.snapshot().url);
        else startRuntime(HostRuntimeService.RESTART);
    }
    private void confirmPluginRecovery() {
        AlertDialog dialog = new AlertDialog.Builder(this).setTitle("停用用户插件并重启")
            .setMessage("保留 ElecKoi 内置插件、已安装的插件包及聊天数据，并备份用户插件配置。启动后可进入插件中心卸载不兼容的插件。")
            .setNegativeButton("取消", null)
            .setPositiveButton("停用并重启", (current, which) -> {
                web.stopLoading();
                loadedUrl = ""; clientReadyUrl = ""; pageLoadGeneration++;
                if (pageTimeout != null) ui.removeCallbacks(pageTimeout);
                runtimePanel.setVisibility(View.GONE);
                showStartupProgress(null, getString(R.string.runtime_starting));
                startRuntime(HostRuntimeService.RECOVER_PLUGINS);
            }).create();
        dialog.show();
        if (dialog.getWindow() != null) {
            GradientDrawable background = new GradientDrawable(); background.setColor(appearanceSurface); background.setCornerRadius(dp(22));
            dialog.getWindow().setBackgroundDrawable(background);
            themeNativeChildren(dialog.getWindow().getDecorView());
        }
    }
    @Override public void changed(HostRuntimeService.Snapshot value) {
        if (value.phase.equals("failed") || value.phase.equals("stopped")) {
            showFailure(value.message); return;
        }
        if (value.phase.equals("ready") && !value.url.equals(loadedUrl)) {
            loadHostPage(value.url);
        } else if (!value.phase.equals("ready")) {
            runtimePanel.setVisibility(View.GONE);
            showStartupProgress(value.installationProgress, getString(R.string.runtime_starting));
        }
    }
    private void showStartupProgress(RuntimeInstallProgress progress, String message) {
        cancelStartupExit();
        startupProgressOverlay.setAlpha(1f);
        startupProgressLabel.setAlpha(1f);
        startupMascot.setTranslationY(0f); startupMascot.setScaleX(1f); startupMascot.setScaleY(1f);
        boolean indeterminate = progress == null || progress.indeterminate();
        startupProgressBar.setIndeterminate(indeterminate);
        startupProgressBar.setVisibility(progress == null ? View.GONE : View.VISIBLE);
        if (!indeterminate) startupProgressBar.setProgress(progress.percent());
        String label = progress == null ? message : progress.message();
        startupProgressLabel.setText(indeterminate ? label : label + "  " + progress.percent() + "%");
        startupProgressBar.setContentDescription(label);
        firstInstallationNotice.setVisibility(progress == null ? View.GONE : View.VISIBLE);
        startupProgressOverlay.setVisibility(View.VISIBLE);
        startupMascot.showLoading();
    }
    private void cancelStartupExit() {
        if (startupExit == null) return;
        AnimatorSet exit = startupExit; startupExit = null;
        exit.removeAllListeners(); exit.cancel();
    }
    private void hideStartupProgress() {
        cancelStartupExit();
        startupMascot.stopLoading();
        startupProgressOverlay.setVisibility(View.GONE);
    }
    private void completeStartupProgress() {
        startupMascot.stopLoading();
        if (!startupMascot.canAnimate()) {
            hideStartupProgress(); return;
        }
        cancelStartupExit();
        AnimatorSet press = new AnimatorSet();
        press.playTogether(ObjectAnimator.ofFloat(startupMascot, View.SCALE_X, 1f, 1.03f),
                ObjectAnimator.ofFloat(startupMascot, View.SCALE_Y, 1f, .95f));
        press.setDuration(100);
        AnimatorSet hop = new AnimatorSet();
        hop.playTogether(ObjectAnimator.ofFloat(startupMascot, View.TRANSLATION_Y, 0f, -dp(14), 0f),
                ObjectAnimator.ofFloat(startupMascot, View.SCALE_X, 1.03f, 1f),
                ObjectAnimator.ofFloat(startupMascot, View.SCALE_Y, .95f, 1f));
        hop.setDuration(240);
        AnimatorSet movement = new AnimatorSet(); movement.playSequentially(press, hop);
        ObjectAnimator fade = ObjectAnimator.ofFloat(startupProgressOverlay, View.ALPHA, 1f, 0f);
        fade.setStartDelay(240); fade.setDuration(200);
        ObjectAnimator labelFade = ObjectAnimator.ofFloat(startupProgressLabel, View.ALPHA, 1f, 0f);
        labelFade.setDuration(120);
        startupExit = new AnimatorSet(); startupExit.playTogether(movement, fade, labelFade);
        startupExit.addListener(new AnimatorListenerAdapter() {
            @Override public void onAnimationEnd(Animator animation) {
                if (startupExit != animation) return;
                startupExit = null;
                startupProgressOverlay.setVisibility(View.GONE);
            }
        });
        startupExit.start();
    }
    private void loadHostPage(String value) {
        diagnostics.event("page-lifecycle", "load");
        long generation = ++pageLoadGeneration;
        web.stopLoading();
        loadedUrl = value;
        clientReadyUrl = ""; pageStartedAt = SystemClock.elapsedRealtime();
        clientStartupFailure = "";
        clientStartupDiagnostics.begin(web.identity(), web.userAgent());
        runtimePanel.setVisibility(View.GONE);
        showStartupProgress(null, getString(R.string.runtime_page_loading));
        if (pageTimeout != null) ui.removeCallbacks(pageTimeout);
        pageTimeout = () -> { if (clientReadyUrl.isEmpty()) showFailure("页面启动超时，请重试或查看错误。"); };
        ui.postDelayed(pageTimeout, 120_000);
        files.execute(() -> {
            try {
                String cookie = HostPageHandshake.verify(new URL(value));
                ui.post(() -> {
                    if (web == null || generation != pageLoadGeneration) return;
                    web.loadAuthenticated(value, cookie, () -> web != null && generation == pageLoadGeneration,
                        error -> showFailure("页面认证失败：" + error));
                });
            } catch (IOException error) {
                ui.post(() -> { if (web != null && generation == pageLoadGeneration) showFailure("页面认证失败：" + error.getMessage()); });
            }
        });
    }
    private void showFailure(String error) { runOnUiThread(() -> {
        diagnostics.record(RuntimeDiagnostics.event("shell-failure", "visible").with("message", error));
        diagnostics.flushSoon();
        if (pageTimeout != null) ui.removeCallbacks(pageTimeout);
        hideStartupProgress();
        clientStartupFailure = error;
        status.setText(clientStartupDiagnostics.failure(error)); runtimePanel.setVisibility(View.VISIBLE);
    }); }
    private void showDiagnostics() {
        if(!diagnostics.enabled()) { showHostDiagnostics(); return; }
        if(diagnosticsDialog!=null) return;
        ScrollView scrolling = new ScrollView(this); TextView text = new TextView(this); text.setTextIsSelectable(true);
        text.setTextSize(13); text.setLineSpacing(dp(3), 1f); text.setPadding(dp(16), dp(12), dp(16), dp(12));
        text.setText("正在读取运行诊断…"); scrolling.addView(text);
        diagnostics.report(diagnosticMetadata(), 48_000, text::setText);
        LinearLayout content=new LinearLayout(this); content.setOrientation(LinearLayout.VERTICAL);
        int height=Math.min(dp(320),Math.max(dp(100),getResources().getDisplayMetrics().heightPixels-dp(240)));
        content.addView(scrolling,new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,height));
        LinearLayout actions=new LinearLayout(this); actions.setPadding(dp(16),0,dp(10),0);
        actions.addView(button("复制",()->diagnostics.report(diagnosticMetadata(),RuntimeDiagnostics.REPORT_BYTES,report->{
            ((ClipboardManager)getSystemService(CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("ElecKoi 运行诊断",report));
            Toast.makeText(this,"诊断已复制",Toast.LENGTH_SHORT).show();
        })));
        actions.addView(button("导出",()->exportDiagnostics(false))); actions.addView(button("分享",()->exportDiagnostics(true))); content.addView(actions);
        TextView title = new TextView(this); title.setText("运行诊断"); title.setTextSize(17);
        title.setTypeface(null, android.graphics.Typeface.BOLD); title.setPadding(dp(16), dp(16), dp(16), dp(8));
        diagnosticsDialog = new AlertDialog.Builder(this).setCustomTitle(title).setView(content)
            .setPositiveButton("关闭", null).setNeutralButton("停止 Host", (dialog, which) -> startRuntime(HostRuntimeService.STOP)).create();
        diagnosticsDialog.setOnShowListener(dialog -> themeDiagnosticsDialog());
        diagnosticsDialog.setOnDismissListener(dialog -> diagnosticsDialog = null);
        diagnosticsDialog.show();
    }
    private void showHostDiagnostics() {
        if(diagnosticsDialog!=null) return;
        HostRuntimeService.Snapshot value=runtime==null?null:runtime.snapshot();
        ScrollView scrolling=new ScrollView(this); TextView text=new TextView(this); text.setTextIsSelectable(true);
        text.setTextSize(13); text.setLineSpacing(dp(3),1f); text.setPadding(dp(16),dp(12),dp(16),dp(12));
        text.setText(value==null?status.getText():(clientStartupFailure.isEmpty()?clientStartupDiagnostics.details():status.getText())
            +"\n\n"+value.phase+"\n"+value.message+"\n\n"+value.diagnostic); scrolling.addView(text);
        TextView title=new TextView(this); title.setText("本地 Host 运行详情"); title.setTextSize(17);
        title.setTypeface(null,android.graphics.Typeface.BOLD); title.setPadding(dp(16),dp(16),dp(16),dp(8));
        diagnosticsDialog=new AlertDialog.Builder(this).setCustomTitle(title).setView(scrolling)
            .setPositiveButton("关闭",null).setNeutralButton("停止 Host",(dialog,which)->startRuntime(HostRuntimeService.STOP)).create();
        diagnosticsDialog.setOnShowListener(dialog->themeDiagnosticsDialog());
        diagnosticsDialog.setOnDismissListener(dialog->diagnosticsDialog=null); diagnosticsDialog.show();
    }
    private RuntimeDiagnostics.Record diagnosticMetadata() {
        RuntimeDiagnostics.Record result=diagnostics.environment();
        if(web!=null) result.with("browser",web.identity());
        if(runtime!=null) { HostRuntimeService.Snapshot snapshot=runtime.snapshot(); result.with("phase",snapshot.phase).with("hostPid",snapshot.hostPid); }
        return result;
    }
    private void exportDiagnostics(boolean share) {
        if(diagnosticExportBusy) return;
        diagnosticExportBusy=true;
        diagnostics.export(diagnosticMetadata(),report->{
            if(isFinishing() || isDestroyed()) { diagnosticExportBusy=false; return; }
            try {
                if(share) {
                    Uri uri=androidx.core.content.FileProvider.getUriForFile(this,getPackageName()+".diagnostics",report);
                    Intent send=new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_STREAM,uri)
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    send.setClipData(ClipData.newRawUri("诊断报告",uri));
                    startActivity(Intent.createChooser(send,"分享运行诊断")); diagnosticExportBusy=false;
                } else {
                    pendingDiagnosticExport=report;
                    startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                        .setType("text/plain").putExtra(Intent.EXTRA_TITLE,"eleckoi-diagnostics.txt"),SAVE_DIAGNOSTICS);
                }
            } catch(Exception failure) { pendingDiagnosticExport=null; diagnosticExportBusy=false; Toast.makeText(this,"诊断导出失败："+failure.getMessage(),Toast.LENGTH_LONG).show(); }
        },error->{ diagnosticExportBusy=false; Toast.makeText(this,error,Toast.LENGTH_LONG).show(); });
    }
    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent); setIntent(intent);
        if(intent.getBooleanExtra("eleckoi.diagnostics",false)) showDiagnostics();
    }
    private void notificationSettings() { startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName())); }
    private boolean sameHost(String url) {
        if (loadedUrl.isEmpty()) return false;
        try { URI expected = URI.create(loadedUrl), actual = URI.create(url);
            return actual.getScheme().equals(expected.getScheme()) && actual.getHost().equals(expected.getHost()) && actual.getPort() == expected.getPort();
        } catch (Exception error) { return false; }
    }
    private BrowserSurface.Resource localMedia(Uri mediaUrl, String method, java.util.Map<String,String> requestHeaders) {
        HttpURLConnection connection = null;
        try {
            String activeHost = loadedUrl;
            if (activeHost.isEmpty() || !"GET".equals(method)) throw new IOException("Host is not ready for media");
            Uri route = Uri.parse(activeHost).buildUpon().path("/eleckoi/media/asset").clearQuery()
                .appendQueryParameter("reference", mediaUrl.toString()).build();
            connection = (HttpURLConnection) new URL(route.toString()).openConnection();
            connection.setConnectTimeout(10_000); connection.setReadTimeout(30_000);
            connection.setInstanceFollowRedirects(false);
            String cookie = web.cookies(activeHost);
            if (cookie != null) connection.setRequestProperty("Cookie", cookie);
            String range = requestHeaders.get("Range");
            if (range != null) connection.setRequestProperty("Range", range);
            int code = connection.getResponseCode();
            java.util.Map<String, String> headers = new java.util.HashMap<>();
            for (java.util.Map.Entry<String, java.util.List<String>> header : connection.getHeaderFields().entrySet()) {
                if (header.getKey() != null) headers.put(header.getKey(), String.join(", ", header.getValue()));
            }
            HttpURLConnection owner = connection;
            InputStream body = code >= 400 ? connection.getErrorStream() : connection.getInputStream();
            if (body == null) body = new ByteArrayInputStream(new byte[0]);
            InputStream stream = new FilterInputStream(body) {
                @Override public void close() throws IOException { try { super.close(); } finally { owner.disconnect(); } }
            };
            String type = connection.getContentType();
            if (type == null) type = "application/octet-stream";
            return new BrowserSurface.Resource(type.split(";", 2)[0], code, connection.getResponseMessage(), headers, stream);
        } catch (Exception error) {
            if (connection != null) connection.disconnect();
            android.util.Log.e("ElecKoiMedia", "Local media request failed", error);
            return new BrowserSurface.Resource("text/plain", 502, "Media unavailable", java.util.Collections.emptyMap(),
                new ByteArrayInputStream("Local media request failed".getBytes(StandardCharsets.UTF_8)));
        }
    }
    private void openExternal(String url) {
        Uri uri = Uri.parse(url); String scheme = uri.getScheme();
        if (!"http".equals(scheme) && !"https".equals(scheme) && !"mailto".equals(scheme)) { showFailure("无法打开链接协议：" + scheme); return; }
        try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception error) { showFailure("外部链接打开失败：" + error.getMessage()); }
    }
    private void beginSave(PendingSave request) {
        if (pendingSave != null) { discardSource(request); platformResult(request.requestId, false, "已有文件等待保存"); return; }
        pendingSave = request;
        try { startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
            .setType(request.mimeType).putExtra(Intent.EXTRA_TITLE, request.name), SAVE_FILE); }
        catch (Exception error) { pendingSave = null; discardSource(request); platformResult(request.requestId, false, error.toString()); }
    }
    @Override protected void onActivityResult(int requestCode, int resultCode, Intent intent) {
        super.onActivityResult(requestCode, resultCode, intent);
        if(requestCode==SAVE_DIAGNOSTICS) {
            File report=pendingDiagnosticExport; pendingDiagnosticExport=null;
            if(resultCode!=RESULT_OK || intent==null || intent.getData()==null || report==null) { diagnosticExportBusy=false; return; }
            Uri target=intent.getData();
            files.execute(()->{
                String result="诊断已导出";
                try(InputStream input=new FileInputStream(report); OutputStream output=getContentResolver().openOutputStream(target,"wt")) {
                    if(output==null) throw new IOException("保存目标无法打开"); copy(input,output);
                } catch(Exception failure) { result="诊断导出失败："+RuntimeDiagnostics.clean(failure.toString(),512); }
                String message=result; runOnUiThread(()->{ diagnosticExportBusy=false; Toast.makeText(this,message,Toast.LENGTH_LONG).show(); });
            }); return;
        }
        if (requestCode == PICK_FILES && fileChoice != null) {
            Uri[] selected = resultCode == RESULT_OK && intent != null && intent.getData() != null ? new Uri[]{intent.getData()} : null;
            if (intent != null && intent.getClipData() != null && resultCode == RESULT_OK) {
                ClipData clip = intent.getClipData(); selected = new Uri[clip.getItemCount()];
                for (int i = 0; i < selected.length; i++) selected[i] = clip.getItemAt(i).getUri();
            }
            fileChoice.accept(selected); fileChoice = null;
        }
        if (requestCode == SAVE_FILE && pendingSave != null) {
            PendingSave request = pendingSave; pendingSave = null;
            if (resultCode != RESULT_OK || intent == null || intent.getData() == null) { discardSource(request); platformResult(request.requestId, true, "cancelled"); return; }
            Uri target = intent.getData();
            files.execute(() -> {
                try {
                    try (OutputStream output = getContentResolver().openOutputStream(target, "wt")) {
                        if (output == null) throw new IOException("保存目标无法打开");
                        if (request.source != null) {
                            try (InputStream input = new FileInputStream(request.source)) { copy(input, output); }
                        } else if (request.text != null) output.write(request.text.getBytes(StandardCharsets.UTF_8));
                        else download(request.downloadUrl, output);
                    }
                    platformResult(request.requestId, true, target.toString());
                } catch (Exception error) { platformResult(request.requestId, false, error.toString()); }
                finally { discardSource(request); }
            });
        }
    }
    private void download(String url, OutputStream output) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(30_000); connection.setReadTimeout(60_000);
        String cookies = sameHost(url) ? web.cookies(url) : null; if (cookies != null) connection.setRequestProperty("Cookie", cookies);
        try {
            if (connection.getResponseCode() != 200) throw new IOException("下载 HTTP " + connection.getResponseCode());
            try (InputStream input = connection.getInputStream()) { copy(input, output); }
        } finally { connection.disconnect(); }
    }
    private static void copy(InputStream input, OutputStream output) throws IOException {
        byte[] buffer = new byte[64 * 1024]; int count;
        while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
    }
    private void discardSource(PendingSave request) {
        if (request.source != null && request.source.exists() && !request.source.delete())
            showFailure("临时导出文件清理失败：" + request.source.getName());
    }
    private static String bridgeResult(boolean success, String result) {
        try { return new JSONObject().put("success", success).put("result", result).toString(); }
        catch (Exception error) { throw new IllegalStateException(error); }
    }
    private void platformResult(String id, boolean success, Object result) {
        runOnUiThread(() -> {
            if (web == null) return;
            try { JSONObject event = new JSONObject().put("id", id).put("success", success).put("result", result);
                emitBrowserEvent("eleckoi:platform-result", event);
            } catch (Exception error) { showFailure("平台结果发送失败：" + error); }
        });
    }
    private final class PlatformBridge implements BrowserSurface.Bridge {
        public Object invoke(String method, JSONArray a) throws Exception {
            switch (method) {
                case "browserDiagnostics": diagnostics.record(a.getJSONObject(0)); return null;
                case "clientReady": clientReady(a.getString(0)); return null;
                case "clientFailed": clientFailed(a.getString(0), a.getString(1)); return null;
                case "tts": tts(a.getString(0), a.getString(1), a.getString(2)); return null;
                case "readTtsAudio": return readTtsAudio(a.getString(0), a.getLong(1), a.getInt(2));
                case "releaseTtsAudio": return releaseTtsAudio(a.getString(0));
                case "saveText": saveText(a.getString(0), a.getString(1), a.getString(2), a.getString(3)); return null;
                case "beginFile": return beginFile(a.getString(0), a.getString(1), a.getString(2));
                case "writeFile": return writeFile(a.getString(0), a.getString(1));
                case "finishFile": return finishFile(a.getString(0));
                case "abortFile": return abortFile(a.getString(0));
                case "reportError": reportError(a.getString(0)); return null;
                case "openExternal": openExternal(a.getString(0)); return null;
                case "bugReportFacts": return diagnostics.bugReportFacts();
                case "notificationSettings": notificationSettings(); return null;
                case "updateStatus": return updateStatus();
                case "checkUpdates": checkUpdates(a.getString(0)); return null;
                case "downloadUpdate": downloadUpdate(a.getString(0)); return null;
                case "appearance": appearance(a.getString(0), a.getString(1)); return null;
                case "version": return version();
                default: throw new IllegalArgumentException("Unsupported Android platform operation: " + method);
            }
        }
        public void clientReady(String url) { runOnUiThread(() -> {
            if (web == null || isFinishing() || !sameHost(url) || !sameHost(web.getUrl()) || !clientReadyUrl.isEmpty()) return;
            clientReadyUrl = loadedUrl;
            diagnostics.event("page-lifecycle", "client-ready");
            clientStartupDiagnostics.complete();
            clientStartupFailure = "";
            applyImeVisibility();
            if (pageTimeout != null) ui.removeCallbacks(pageTimeout);
            runtimePanel.setVisibility(View.GONE);
            completeStartupProgress();
            android.util.Log.i("ElecKoiStartup", "Web client rendered in " + (SystemClock.elapsedRealtime() - pageStartedAt) + " ms");
        }); }
        public void clientFailed(String url, String message) { runOnUiThread(() -> {
            if (web != null && sameHost(url) && sameHost(web.getUrl())) showFailure(message);
        }); }
        public void tts(String id, String method, String json) { runOnUiThread(() -> systemSpeech.invoke(id,method,json)); }
        public String readTtsAudio(String token, long offset, int count) { return systemSpeech.read(token,offset,count); }
        public String releaseTtsAudio(String token) { return systemSpeech.release(token); }
        public void saveText(String id, String name, String mime, String text) {
            runOnUiThread(() -> { if (sameHost(web.getUrl())) beginSave(new PendingSave(id, name, mime, text, null, null)); else platformResult(id, false, "Host page not active"); });
        }
        public String beginFile(String id, String name, String mime) {
            try {
                File source = File.createTempFile("eleckoi-export-", ".bin", getCacheDir());
                String token = java.util.UUID.randomUUID().toString();
                stagedSaves.put(token, new StagedSave(new PendingSave(id, name, mime, null, null, source), new FileOutputStream(source)));
                return bridgeResult(true, token);
            } catch (Exception error) { return bridgeResult(false, error.toString()); }
        }
        public String writeFile(String token, String base64) {
            StagedSave save = stagedSaves.get(token);
            if (save == null) return bridgeResult(false, "Unknown file transfer: " + token);
            try { save.output.write(Base64.decode(base64, Base64.DEFAULT)); return bridgeResult(true, ""); }
            catch (Exception error) { abortFile(token); return bridgeResult(false, error.toString()); }
        }
        public String finishFile(String token) {
            StagedSave save = stagedSaves.remove(token);
            if (save == null) return bridgeResult(false, "Unknown file transfer: " + token);
            try {
                save.output.close();
                runOnUiThread(() -> beginSave(save.request));
                return bridgeResult(true, "");
            } catch (Exception error) { discardSource(save.request); return bridgeResult(false, error.toString()); }
        }
        public String abortFile(String token) {
            StagedSave save = stagedSaves.remove(token);
            if (save == null) return bridgeResult(true, "");
            try { save.output.close(); discardSource(save.request); return bridgeResult(true, ""); }
            catch (Exception error) { discardSource(save.request); return bridgeResult(false, error.toString()); }
        }
        public void reportError(String message) { runOnUiThread(() -> showFailure("文件导出失败：" + message)); }
        public void openExternal(String url) { runOnUiThread(() -> MainActivity.this.openExternal(url)); }
        public void notificationSettings() { runOnUiThread(MainActivity.this::notificationSettings); }
        public String updateStatus() { return updates.status(); }
        public void checkUpdates(String id) {
            updates.check(true,success -> { try { platformResult(id,true,new JSONObject(updates.status())); } catch(Exception error) { platformResult(id,false,error.toString()); } });
        }
        public void downloadUpdate(String id) { runOnUiThread(() -> {
            try { startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(updates.downloadUrl()))); platformResult(id,true,new JSONObject(updates.status())); }
            catch(Exception error) { platformResult(id,false,error.toString()); }
        }); }
        public void appearance(String mode, String surface) { runOnUiThread(() -> applyAppearance("dark".equals(mode), surface)); }
        public String version() { return "1"; }
    }
    @Override public boolean onCreateOptionsMenu(Menu menu) { menu.add("Host 运行详情").setOnMenuItemClickListener(item -> { showDiagnostics(); return true; }); return true; }
    @Override public void onBackPressed() {
        if (web == null || clientReadyUrl.isEmpty()) { super.onBackPressed(); return; }
        browserCommand("back", new JSONObject(), consumed -> {
            if ("true".equals(consumed)) return;
            if (!"false".equals(consumed)) { showFailure("浏览器未返回有效的导航结果"); return; }
            if (web.canGoBack()) web.goBack();
            else MainActivity.super.onBackPressed();
        });
    }
    private void applyAppearance(boolean dark, String surface) {
        int background = dark ? Color.rgb(13, 15, 18) : Color.rgb(245, 245, 245);
        if (surface != null && surface.matches("#[0-9a-fA-F]{6}")) background = Color.parseColor(surface);
        int foreground = dark ? Color.rgb(245, 245, 245) : Color.rgb(22, 22, 22);
        appearanceDark = dark; appearanceForeground = foreground; appearanceBackground = background;
        appearanceSurface = dark ? Color.rgb(36, 40, 46) : Color.WHITE;
        appearanceBorder = dark ? Color.rgb(74, 82, 93) : Color.rgb(184, 184, 184);
        // Android 15+ draws transparent system bars over these real view surfaces.
        // The inset padding belongs to page, not to WebView or runtimePanel.
        getWindow().setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(background));
        getWindow().getDecorView().setBackgroundColor(background);
        if (page != null) page.setBackgroundColor(background);
        if (web != null) web.setAppearance(dark, background);
        getWindow().setStatusBarColor(background); getWindow().setNavigationBarColor(background);
        if (Build.VERSION.SDK_INT >= 29) {
            getWindow().setStatusBarContrastEnforced(false);
            getWindow().setNavigationBarContrastEnforced(false);
        }
        if (Build.VERSION.SDK_INT >= 28) getWindow().setNavigationBarDividerColor(background);
        int flags = getWindow().getDecorView().getSystemUiVisibility();
        int lightBars = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        getWindow().getDecorView().setSystemUiVisibility(dark ? flags & ~lightBars : flags | lightBars);
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController controller = getWindow().getInsetsController();
            int lightAppearance = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
            if (controller != null) controller.setSystemBarsAppearance(dark ? 0 : lightAppearance, lightAppearance);
        }
        runtimePanel.setBackgroundColor(background);
        themeNativeChildren(runtimePanel);
        startupProgressPanel.setBackgroundColor(background);
        startupProgressOverlay.setBackgroundColor(background);
        themeNativeChildren(startupProgressPanel);
        android.content.res.ColorStateList accent = android.content.res.ColorStateList.valueOf(getColor(dark ? R.color.eleckoi_accent : R.color.eleckoi_primary));
        startupProgressBar.setProgressTintList(accent); startupProgressBar.setIndeterminateTintList(accent);
        startupProgressBar.setProgressBackgroundTintList(android.content.res.ColorStateList.valueOf(appearanceBorder));
        themeDiagnosticsDialog();
    }
    @Override protected void onResume() { super.onResume(); diagnostics.visible(true); web.onResume(); startupMascot.setActive(true); }
    @Override protected void onPause() {
        diagnostics.visible(false); diagnostics.flushSoon();
        startupMascot.setActive(false);
        if (startupExit != null) hideStartupProgress();
        web.onPause(); super.onPause();
    }
    @Override protected void onDestroy() {
        if (isFinishing()) diagnostics.sessionEnd();
        updates.removeObserver(updateListener);
        pageLoadGeneration++;
        hideStartupProgress();
        if (pageTimeout != null) ui.removeCallbacks(pageTimeout);
        if (runtime != null) runtime.removeObserver(this); if (bound) unbindService(connection);
        if (fileChoice != null) fileChoice.accept(null);
        if (pendingSave != null) { discardSource(pendingSave); platformResult(pendingSave.requestId, false, "Activity closed while saving"); }
        for (String token : stagedSaves.keySet()) new PlatformBridge().abortFile(token);
        systemSpeech.close();
        web.destroy(); web=null;
        files.shutdown(); super.onDestroy();
    }
}
