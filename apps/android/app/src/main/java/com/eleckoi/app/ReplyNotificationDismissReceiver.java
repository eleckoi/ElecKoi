package com.eleckoi.app;

import android.content.*;

/** Rebuilds the app overview after the user dismisses an individual reply. */
public final class ReplyNotificationDismissReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) { ReplyNotificationGroup.refresh(context); }
}
