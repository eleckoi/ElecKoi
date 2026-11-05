package com.eleckoi.app;

import android.app.*;
import android.content.*;
import java.net.*;
import java.nio.file.Files;
import org.json.JSONObject;

/** DUMP-protected development checks; never submits a conversation or changes permissions. */
public final class NotificationPresentationProbeReceiver extends BroadcastReceiver {
    private static final String TAG="eleckoi.presentation-probe";
    private static volatile String report="not started";
    private static volatile Thread worker;
    @Override public void onReceive(Context context,Intent intent) {
        String operation=intent.getStringExtra("operation");
        NotificationManager manager=context.getSystemService(NotificationManager.class);
        if ("status".equals(operation)) { setResultData(report); return; }
        if ("background".equals(operation)) {
            if (worker!=null && worker.isAlive()) { setResultCode(1); setResultData("Probe already running"); return; }
            try {
                if (!BackgroundRunProtection.enabled(context) || !android.provider.Settings.canDrawOverlays(context))
                    throw new IllegalStateException("Overlay preference and permission are required; unchanged");
                JSONObject state=new JSONObject(new String(Files.readAllBytes(new RuntimePaths(context).state.toPath()),java.nio.charset.StandardCharsets.UTF_8));
                if (!"ready".equals(state.getString("phase")) || state.getInt("androidPid")!=android.os.Process.myPid())
                    throw new IllegalStateException("Current Host is not ready");
                URL health=new URL(state.getString("healthUrl"));
                if (!"127.0.0.1".equals(health.getHost()) && !"localhost".equals(health.getHost())) throw new IllegalStateException("Host health origin is not local");
                long hostPid=state.getLong("hostPid"), started=android.os.SystemClock.elapsedRealtime();
                report="running; samples=0; hostPid="+hostPid;
                worker=new Thread(()->{
                    try {
                        for (int count=1;count<=12;count++) {
                            Thread.sleep(5000);
                            HttpURLConnection connection=(HttpURLConnection)health.openConnection();
                            connection.setConnectTimeout(4000); connection.setReadTimeout(4000);
                            try { if (connection.getResponseCode()!=200) throw new IllegalStateException("Host health request failed"); }
                            finally { connection.disconnect(); }
                            report="running; samples="+count+"; hostPid="+hostPid+"; elapsedMs="+(android.os.SystemClock.elapsedRealtime()-started);
                        }
                        report="completed; "+report;
                    } catch (Exception error) { report="failed; "+error.getClass().getSimpleName(); }
                },"background-probe");
                worker.start(); setResultData(report);
            } catch (Exception error) { setResultCode(1); setResultData(error.getMessage()); }
            return;
        }
        if ("clear".equals(operation)) {
            manager.cancel(TAG,42); ReplyNotificationGroup.refresh(context);
            setResultData("Presentation probe notification cleared"); return;
        }
        if ("inspect".equals(operation)) {
            boolean runtime=false,reply=false,summary=false;
            for (android.service.notification.StatusBarNotification active:manager.getActiveNotifications()) {
                if (active.getId()==41) runtime=true;
                if (TAG.equals(active.getTag()) && active.getId()==42) reply=true;
                if (active.getTag()==null && active.getId()==43) summary=true;
            }
            setResultCode(!runtime && reply && summary?0:1);
            setResultData("runtimeNotification="+runtime+"; reply="+reply+"; summary="+summary); return;
        }
        if (!manager.areNotificationsEnabled() || !ReplyNotifications.enabled(context)) {
            setResultCode(1); setResultData("Notification preferences or permission disabled; unchanged"); return;
        }
        ReplyNotifications.ensureChannel(context);
        PendingIntent open=PendingIntent.getActivity(context,99,new Intent(context,MainActivity.class),PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        long time=System.currentTimeMillis();
        Notification reply=ReplyNotificationGroup.reply(new Notification.Builder(context,ReplyNotifications.CHANNEL)
            .setSmallIcon(android.R.drawable.stat_notify_chat).setContentTitle("通知展示测试")
            .setContentText("仅检查完成提醒，不创建后台运行通知。")
            .setStyle(new Notification.MessagingStyle("你").addMessage("仅检查完成提醒，不创建后台运行通知。",time,"通知展示测试"))
            .setWhen(time).setContentIntent(open).setAutoCancel(true),time).build();
        manager.notify(TAG,42,reply); ReplyNotificationGroup.posted(context,TAG,reply);
        setResultData("Presentation probe notification posted");
    }
}
