package com.eleckoi.app;

import android.app.*;
import android.content.Context;
import android.graphics.drawable.Icon;
import android.service.notification.StatusBarNotification;
import java.util.*;

/** Keeps the newest unread reply as the message group's overview. */
final class ReplyNotificationGroup {
    static final String KEY="eleckoi.activity";
    private static final int SUMMARY=43;
    static String replySortKey(long time) {
        return "0.reply."+String.format(Locale.ROOT,"%019d",Long.MAX_VALUE-time);
    }
    static Notification.Builder reply(Notification.Builder builder,long time) {
        return builder.setGroup(KEY).setSortKey(replySortKey(time)).setGroupAlertBehavior(Notification.GROUP_ALERT_CHILDREN);
    }
    static void posted(Context context, String tag, Notification incoming) {
        Map<String,Notification> replies=current(context);
        replies.put(tag,incoming);
        update(context,replies.values());
    }
    static void refresh(Context context) { update(context,current(context).values()); }
    static void clear(Context context) { context.getSystemService(NotificationManager.class).cancel(SUMMARY); }
    private static Map<String,Notification> current(Context context) {
        Map<String,Notification> replies=new HashMap<>();
        for (StatusBarNotification active:context.getSystemService(NotificationManager.class).getActiveNotifications())
            if (active.getId()==42 && ReplyNotifications.CHANNEL.equals(active.getNotification().getChannelId()))
                replies.put(active.getTag(),active.getNotification());
        return replies;
    }
    private static void update(Context context, Collection<Notification> replies) {
        NotificationManager manager=context.getSystemService(NotificationManager.class);
        if (replies.isEmpty() || !ReplyNotifications.enabled(context) || !manager.areNotificationsEnabled()) { manager.cancel(SUMMARY); return; }
        Notification latest=Collections.max(replies,Comparator.comparingLong(notification->notification.when));
        CharSequence title=latest.extras.getCharSequence(Notification.EXTRA_TITLE);
        CharSequence text=latest.extras.getCharSequence(Notification.EXTRA_TEXT);
        Notification.Builder builder=new Notification.Builder(context,ReplyNotifications.CHANNEL)
            .setSmallIcon(android.R.drawable.stat_notify_chat).setContentTitle(title).setContentText(text)
            .setStyle(new Notification.BigTextStyle().bigText(text)).setContentIntent(latest.contentIntent)
            .setWhen(latest.when).setShowWhen(true).setGroup(KEY).setGroupSummary(true)
            .setGroupAlertBehavior(Notification.GROUP_ALERT_CHILDREN).setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_MESSAGE).setVisibility(Notification.VISIBILITY_PRIVATE)
            .setAutoCancel(true);
        Icon icon=latest.getLargeIcon(); if (icon!=null) builder.setLargeIcon(icon);
        try { manager.notify(SUMMARY,builder.build()); }
        catch (SecurityException error) { android.util.Log.w("ElecKoiUnifiedHost","Reply overview blocked by system notification permission"); }
    }
}
