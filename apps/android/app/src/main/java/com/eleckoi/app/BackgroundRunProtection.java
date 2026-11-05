package com.eleckoi.app;

import android.app.ActivityManager;
import android.app.Activity;
import android.app.Application;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.PixelFormat;
import android.net.Uri;
import android.os.*;
import android.provider.Settings;
import android.view.*;
import org.json.JSONObject;
import java.util.function.Consumer;

/** Optional Android window ownership follows application visibility, not WebView lifetime. */
final class BackgroundRunProtection implements AutoCloseable {
    private static final String PREFERENCES="background-run";
    private final Context context;
    private final Handler main=new Handler(Looper.getMainLooper());
    private final Consumer<String> diagnostic;
    private volatile boolean closed;
    private View window;
    private final ElecKoiApplication app;
    private final Application.ActivityLifecycleCallbacks visibility = new Application.ActivityLifecycleCallbacks() {
        public void onActivityStarted(Activity activity) { refresh(); }
        public void onActivityStopped(Activity activity) { refresh(); }
        public void onActivityResumed(Activity activity) { refresh(); }
        public void onActivityPaused(Activity activity) { refresh(); }
        public void onActivityCreated(Activity activity, Bundle state) {}
        public void onActivitySaveInstanceState(Activity activity, Bundle state) {}
        public void onActivityDestroyed(Activity activity) {}
    };
    private final BroadcastReceiver screen = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) { refresh(); }
    };
    BackgroundRunProtection(Context context, Consumer<String> diagnostic) {
        this.context=context; this.diagnostic=diagnostic; app=(ElecKoiApplication)context.getApplicationContext();
        app.registerActivityLifecycleCallbacks(visibility);
        IntentFilter filter=new IntentFilter(Intent.ACTION_SCREEN_OFF);
        filter.addAction(Intent.ACTION_SCREEN_ON); filter.addAction(Intent.ACTION_USER_PRESENT);
        if (Build.VERSION.SDK_INT>=33) app.registerReceiver(screen,filter,Context.RECEIVER_NOT_EXPORTED);
        else app.registerReceiver(screen,filter);
        refresh();
    }
    static boolean enabled(Context context) {
        return context.getSharedPreferences(PREFERENCES,Context.MODE_PRIVATE).getBoolean("enhanced",false);
    }
    static void setEnabled(Context context, boolean enabled) {
        context.getSharedPreferences(PREFERENCES,Context.MODE_PRIVATE).edit().putBoolean("enhanced",enabled).apply();
    }
    static String status(Context context) throws Exception {
        ActivityManager activity=context.getSystemService(ActivityManager.class);
        return new JSONObject().put("batteryExempt",context.getSystemService(PowerManager.class).isIgnoringBatteryOptimizations(context.getPackageName()))
            .put("backgroundRestricted",Build.VERSION.SDK_INT>=28 ? activity.isBackgroundRestricted() : JSONObject.NULL)
            .put("enhancedEnabled",enabled(context)).put("overlayAllowed",Settings.canDrawOverlays(context)).toString();
    }
    static Intent overlaySettings(Context context) {
        return new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,Uri.parse("package:"+context.getPackageName()));
    }
    void refresh() { main.post(this::sync); }
    private void sync() {
        boolean needed=!closed && !app.visible() && enabled(context) && Settings.canDrawOverlays(context);
        WindowManager manager=context.getSystemService(WindowManager.class);
        if (needed && window==null) {
            View candidate=new View(context); candidate.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
            WindowManager.LayoutParams params=new WindowManager.LayoutParams(1,1,WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
                    | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,PixelFormat.TRANSLUCENT);
            params.gravity=Gravity.TOP | Gravity.START; params.alpha=0f; params.setTitle("ElecKoi background protection");
            try { manager.addView(candidate,params); window=candidate; diagnostic.accept("Background protection window attached"); }
            catch (RuntimeException error) { diagnostic.accept("Generation protection window unavailable: "+error.getClass().getSimpleName()); }
        } else if (!needed && window!=null) {
            View previous=window; window=null;
            try { manager.removeViewImmediate(previous); diagnostic.accept("Background protection window released"); }
            catch (RuntimeException error) { diagnostic.accept("Generation protection window release failed: "+error.getClass().getSimpleName()); }
        }
    }
    @Override public void close() {
        if (closed) return;
        closed=true; app.unregisterActivityLifecycleCallbacks(visibility); app.unregisterReceiver(screen); refresh();
    }
}
