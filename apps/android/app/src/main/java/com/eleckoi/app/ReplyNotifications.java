package com.eleckoi.app;

import android.app.*;
import android.content.*;
import android.graphics.*;
import android.graphics.drawable.Icon;
import android.os.*;
import org.json.JSONObject;
import java.net.URL;
import java.util.function.Consumer;

/** Platform presentation and preferences; conversation data remains owned by the Host. */
final class ReplyNotifications implements AutoCloseable {
    static final String CHANNEL="reply-completed";
    private static final String PREFERENCES="reply-notifications";
    private final ElecKoiApplication app;
    private final HostReplyMonitor monitor;
    private final Handler main=new Handler(Looper.getMainLooper());
    private volatile boolean closed;

    static void ensureChannel(Context context) {
        NotificationChannel channel=new NotificationChannel(CHANNEL,"回复完成",NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("后台回复完成时显示角色头像与回复内容");
        context.getSystemService(NotificationManager.class).createNotificationChannel(channel);
    }
    static boolean enabled(Context context) {
        return context.getSharedPreferences(PREFERENCES,Context.MODE_PRIVATE).getBoolean("enabled",true);
    }
    static String status(Context context) throws Exception {
        ensureChannel(context);
        NotificationManager manager=context.getSystemService(NotificationManager.class);
        return new JSONObject().put("enabled",enabled(context)).put("allowed",manager.areNotificationsEnabled()
            && manager.getNotificationChannel(CHANNEL).getImportance()!=NotificationManager.IMPORTANCE_NONE).toString();
    }
    static String setEnabled(Context context, boolean value) throws Exception {
        context.getSharedPreferences(PREFERENCES,Context.MODE_PRIVATE).edit().putBoolean("enabled",value).apply();
        if (!value) {
            NotificationManager manager=context.getSystemService(NotificationManager.class);
            for (android.service.notification.StatusBarNotification active:manager.getActiveNotifications())
                if (active.getId()==42 && CHANNEL.equals(active.getNotification().getChannelId())) manager.cancel(active.getTag(),42);
            ReplyNotificationGroup.clear(context);
        }
        return status(context);
    }
    ReplyNotifications(ElecKoiApplication app, URL ready, String cookie, Consumer<String> diagnostic) throws Exception {
        this.app=app; ensureChannel(app);
        monitor=new HostReplyMonitor(ready,cookie,new HostReplyMonitor.Receiver() {
            public void completed(String id, String name, String avatar, ReplyCompletionState.Reply reply) { show(id,name,avatar,reply,diagnostic); }
        },diagnostic);
        monitor.start();
    }
    private void show(String id, String name, String avatar, ReplyCompletionState.Reply reply, Consumer<String> diagnostic) {
        if (closed || app.visible() || !enabled(app)) {
            diagnostic.accept("Reply alert suppressed: "+(closed?"observer closed":app.visible()?"app visible":"alerts disabled")); return;
        }
        Bitmap picture=null;
        if (!avatar.isEmpty()) try {
            byte[] bytes=monitor.avatar(avatar);
            BitmapFactory.Options options=new BitmapFactory.Options(); options.inJustDecodeBounds=true;
            BitmapFactory.decodeByteArray(bytes,0,bytes.length,options);
            options.inSampleSize=1;
            while (Math.max(options.outWidth,options.outHeight)/options.inSampleSize>384) options.inSampleSize*=2;
            options.inJustDecodeBounds=false; picture=BitmapFactory.decodeByteArray(bytes,0,bytes.length,options);
            if (picture==null) diagnostic.accept("Reply avatar could not be decoded");
        } catch (Exception error) { diagnostic.accept("Reply avatar could not be loaded"); }
        if (picture==null) picture=BitmapFactory.decodeResource(app.getResources(),R.drawable.eleckoi_app_icon);
        Bitmap icon=picture;
        main.post(() -> {
            if (closed || app.visible() || !enabled(app)) { diagnostic.accept("Reply alert suppressed before delivery"); return; }
            NotificationManager manager=app.getSystemService(NotificationManager.class);
            if (!manager.areNotificationsEnabled()) { diagnostic.accept("Reply alert blocked by system notification settings"); return; }
            PendingIntent open=PendingIntent.getActivity(app,4,new Intent(app,MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            PendingIntent dismissed=PendingIntent.getBroadcast(app,0,new Intent(app,ReplyNotificationDismissReceiver.class),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            Notification.MessagingStyle style;
            if (Build.VERSION.SDK_INT>=28) {
                Person sender=new Person.Builder().setName(name.isEmpty()?"ElecKoi":name).setKey(id).setBot(true).setIcon(Icon.createWithBitmap(icon)).build();
                style=new Notification.MessagingStyle(new Person.Builder().setName("你").build())
                    .addMessage(reply.text,reply.time,sender);
            } else style=new Notification.MessagingStyle("你").addMessage(reply.text,reply.time,name);
            Notification.Builder builder=new Notification.Builder(app,CHANNEL).setSmallIcon(android.R.drawable.stat_notify_chat)
                .setLargeIcon(icon).setContentTitle(name).setContentText(reply.text).setStyle(style)
                .setCategory(Notification.CATEGORY_MESSAGE).setVisibility(Notification.VISIBILITY_PRIVATE)
                .setDeleteIntent(dismissed).setWhen(reply.time).setContentIntent(open).setAutoCancel(true);
            Notification notification=ReplyNotificationGroup.reply(builder,reply.time).build();
            try {
                String tag="reply:"+id;
                manager.notify(tag,42,notification); ReplyNotificationGroup.posted(app,tag,notification);
                diagnostic.accept("Reply alert posted");
            }
            catch (SecurityException error) { diagnostic.accept("Reply notification permission unavailable"); }
        });
    }
    @Override public void close() { closed=true; main.removeCallbacksAndMessages(null); monitor.close(); }
}
