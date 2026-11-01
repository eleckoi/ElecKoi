package com.eleckoi.app;

import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

/** Reads Android execution policies and opens their system-owned controls. */
final class BackgroundRunSettings {
    static final String OPEN = "eleckoi.background-settings";

    static String description(Context context) {
        PowerManager power = context.getSystemService(PowerManager.class);
        ActivityManager activity = context.getSystemService(ActivityManager.class);
        ConnectivityManager connectivity = context.getSystemService(ConnectivityManager.class);
        boolean exempt = power.isIgnoringBatteryOptimizations(context.getPackageName());
        String restricted = Build.VERSION.SDK_INT >= 28
            ? (activity.isBackgroundRestricted() ? "已限制" : "未限制") : "当前系统不提供此状态";
        String dataSaver;
        switch (connectivity.getRestrictBackgroundStatus()) {
            case ConnectivityManager.RESTRICT_BACKGROUND_STATUS_ENABLED:
                dataSaver = "已开启，本应用未获豁免"; break;
            case ConnectivityManager.RESTRICT_BACKGROUND_STATUS_WHITELISTED:
                dataSaver = "已开启，本应用已获豁免"; break;
            case ConnectivityManager.RESTRICT_BACKGROUND_STATUS_DISABLED:
                dataSaver = "未开启"; break;
            default: dataSaver = "尚未确认";
        }
        return "电池优化：" + (exempt ? "本应用已豁免" : "本应用尚未豁免")
            + "\n后台运行：" + restricted + "\n节省流量：" + dataSaver;
    }

    static Intent battery(Context context) {
        PowerManager power = context.getSystemService(PowerManager.class);
        if (power.isIgnoringBatteryOptimizations(context.getPackageName()))
            return new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
        return new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
            Uri.parse("package:" + context.getPackageName()));
    }

    static Intent application(Context context) {
        return new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.parse("package:" + context.getPackageName()));
    }
}
