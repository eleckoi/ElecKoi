package com.eleckoi.app;

import android.app.Application;
import android.app.Activity;
import android.os.Bundle;
import android.os.PowerManager;
import android.app.KeyguardManager;

/** Owns Android platform services for Activity and scheduled-job lifetimes. */
public final class ElecKoiApplication extends Application {
    private AppUpdates updates;
    private AndroidDiagnostics diagnostics;
    private volatile int visibleActivities;
    @Override public void onCreate() {
        super.onCreate(); diagnostics=new AndroidDiagnostics(this); updates=new AppUpdates(this); updates.scheduleBackground();
        registerActivityLifecycleCallbacks(new ActivityLifecycleCallbacks() {
            public void onActivityStarted(Activity activity) { visibleActivities++; }
            public void onActivityStopped(Activity activity) { visibleActivities--; }
            public void onActivityCreated(Activity activity, Bundle state) {}
            public void onActivityResumed(Activity activity) {}
            public void onActivityPaused(Activity activity) {}
            public void onActivitySaveInstanceState(Activity activity, Bundle state) {}
            public void onActivityDestroyed(Activity activity) {}
        });
    }
    boolean visible() {
        return visibleActivities>0 && getSystemService(PowerManager.class).isInteractive()
            && !getSystemService(KeyguardManager.class).isKeyguardLocked();
    }
    AppUpdates updates() { return updates; }
    AndroidDiagnostics diagnostics() { return diagnostics; }
}
