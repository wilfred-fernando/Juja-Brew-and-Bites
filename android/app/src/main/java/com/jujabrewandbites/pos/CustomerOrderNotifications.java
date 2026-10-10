package com.jujabrewandbites.pos;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.drawable.Icon;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import java.util.Map;

/** Builds the same order card for FCM background delivery and WebView realtime updates. */
public final class CustomerOrderNotifications {
    public static final String ALERT_CHANNEL = "customer-orders-audible";
    private static final String PROGRESS_CHANNEL = "customer-order-progress";
    private static final String PREFS = "juja-order-notifications";

    public static void createChannels(Context context) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        NotificationChannel progress = new NotificationChannel(PROGRESS_CHANNEL,
            "Order progress", NotificationManager.IMPORTANCE_LOW);
        progress.setDescription("Ongoing JUJA order tracking");
        progress.setSound(null, null);
        manager.createNotificationChannel(progress);
        NotificationChannel alerts = new NotificationChannel(ALERT_CHANNEL,
            "Customer Order Alerts", NotificationManager.IMPORTANCE_HIGH);
        alerts.setDescription("Ready for pickup, delivery and completion alerts");
        alerts.enableVibration(true);
        alerts.setSound(Uri.parse("android.resource://" + context.getPackageName() + "/raw/notification"),
            new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).build());
        manager.createNotificationChannel(alerts);
    }

    public static synchronized boolean show(Context context, Map<String, String> data) {
        String orderId = data.getOrDefault("web_order_id", "");
        if (orderId.isEmpty()) return false;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if ("false".equals(data.get("trackable"))) {
            manager.cancel("juja-order:" + orderId, orderId.hashCode());
            return true;
        }
        if (Build.VERSION.SDK_INT >= 24 && !manager.areNotificationsEnabled()) return false;
        createChannels(context);
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        // A customer's dismissal must not be undone by another background update.
        boolean dismissed = prefs.getBoolean(orderId + ":dismissed", false);
        String state = data.getOrDefault("status", "") + ":" + data.getOrDefault("delivery_status", "");
        String timestamp = data.getOrDefault("updated_at", "");
        String previousTime = prefs.getString(orderId + ":time", "");
        if (!timestamp.isEmpty() && !previousTime.isEmpty() && timestamp.compareTo(previousTime) < 0) return true;
        if (state.equals(prefs.getString(orderId + ":state", ""))) return true;
        boolean terminal = "true".equals(data.get("terminal"));
        boolean alert = "true".equals(data.get("alert"));
        if (dismissed && !alert) return true;
        int stage;
        try { stage = Math.max(0, Math.min(4, Integer.parseInt(data.getOrDefault("progress", "0")))); }
        catch (NumberFormatException ignored) { stage = 0; }
        int id = orderId.hashCode();
        Intent open = new Intent(context, MainActivity.class)
            .setAction("JUJA_ORDER_OPEN")
            .setData(Uri.parse("juja://order/" + Uri.encode(orderId)))
            .putExtra("juja_order_open", true)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent tap = PendingIntent.getActivity(context, id, open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Intent dismiss = new Intent(context, CustomerOrderDismissReceiver.class)
            .setData(Uri.parse("juja://dismiss/" + Uri.encode(orderId)))
            .putExtra("web_order_id", orderId);
        PendingIntent delete = PendingIntent.getBroadcast(context, id, dismiss,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        int icon = context.getResources().getIdentifier("ic_stat_juja_notification", "drawable", context.getPackageName());
        String label = data.getOrDefault("progress_label", "Received");
        String steps = "Received → Preparing → Ready / Delivery → Completed";
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26
            ? new Notification.Builder(context, alert ? ALERT_CHANNEL : PROGRESS_CHANNEL)
            : new Notification.Builder(context);
        builder.setSmallIcon(icon)
            .setColor(Color.rgb(8, 120, 48))
            .setContentTitle("JUJA · " + data.getOrDefault("order_label", "Your order"))
            .setContentText(label)
            .setSubText("Order tracking")
            .setContentIntent(tap)
            .setDeleteIntent(delete)
            .setOngoing(!terminal && !dismissed)
            .setAutoCancel(terminal || dismissed)
            .setShowWhen(false)
            .setCategory(Notification.CATEGORY_STATUS)
            .setPriority(alert ? Notification.PRIORITY_HIGH : Notification.PRIORITY_LOW)
            .setVisibility(Notification.VISIBILITY_PRIVATE)
            .setOnlyAlertOnce(false);
        if (Build.VERSION.SDK_INT < 26 && alert) builder.setDefaults(Notification.DEFAULT_SOUND | Notification.DEFAULT_VIBRATE);
        if (Build.VERSION.SDK_INT >= 36 && !terminal && !dismissed) {
            Notification.ProgressStyle style = new Notification.ProgressStyle()
                .setProgress(stage * 25)
                .setProgressTrackerIcon(Icon.createWithResource(context, icon));
            for (int i = 0; i < 4; i++) style.addProgressSegment(
                new Notification.ProgressStyle.Segment(25).setColor(Color.rgb(8, 120, 48)));
            android.os.Bundle extras = new android.os.Bundle();
            extras.putBoolean("android.requestPromotedOngoing", true);
            builder.setStyle(style).addExtras(extras).setShortCriticalText(label);
        } else {
            builder.setStyle(new Notification.BigTextStyle().bigText(
                data.getOrDefault("body", label) + "\n" + steps));
            if (!terminal) builder.setProgress(4, stage, false);
        }
        if (Build.VERSION.SDK_INT >= 26) builder.setTimeoutAfter(terminal ? 3600000 : 14400000);
        try {
            manager.notify("juja-order:" + orderId, id, builder.build());
            prefs.edit().putString(orderId + ":state", state).putString(orderId + ":time", timestamp).apply();
            return true;
        } catch (SecurityException ignored) { return false; }
    }

    public static void dismiss(Context context, String orderId) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean(orderId + ":dismissed", true).apply();
    }
}
