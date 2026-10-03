// The phone's notifications (specs/android-app): one per conversation (the latest replaces the one
// before), a tap opens that conversation; and the lasting one of the keep-connected service.
package app.orbis.android;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import java.util.LinkedHashSet;
import java.util.Set;

final class Notifier {
    static final String EXTRA_CONVERSATION = "app.orbis.android.conversation";
    private static final String MESSAGES = "messages";
    private static final String CONNECTION = "connection";
    static final int CONNECTION_ID = 7420;
    private static final int MESSAGE_ID = 1;
    private static final int ACCENT = 0xFF3B82F6;

    /** The tags shown since the app was last on screen, cleared when it comes back. */
    private static final Set<String> shown = new LinkedHashSet<>();

    private Notifier() {}

    private static NotificationManager manager(Context c) {
        return (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
    }

    static void channels(Context c) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel messages = new NotificationChannel(MESSAGES, c.getString(R.string.channel_messages), NotificationManager.IMPORTANCE_HIGH);
        messages.setDescription(c.getString(R.string.channel_messages_help));
        NotificationChannel connection = new NotificationChannel(CONNECTION, c.getString(R.string.channel_connection), NotificationManager.IMPORTANCE_MIN);
        connection.setDescription(c.getString(R.string.channel_connection_help));
        connection.setShowBadge(false);
        manager(c).createNotificationChannel(messages);
        manager(c).createNotificationChannel(connection);
    }

    static boolean allowed(Context c) {
        return manager(c).areNotificationsEnabled();
    }

    @SuppressWarnings("deprecation")
    private static Notification.Builder builder(Context c, String channel) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ? new Notification.Builder(c, channel) : new Notification.Builder(c);
    }

    private static PendingIntent open(Context c, String conversationId, int request) {
        Intent intent = new Intent(c, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (conversationId != null && !conversationId.isEmpty()) intent.putExtra(EXTRA_CONVERSATION, conversationId);
        return PendingIntent.getActivity(c, request, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @SuppressWarnings("deprecation")
    static void message(Context c, String tag, String title, String body, String conversationId) {
        if (!allowed(c)) return;
        Notification.Builder b = builder(c, MESSAGES)
                .setSmallIcon(R.drawable.ic_stat_orbis)
                .setColor(ACCENT)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setCategory(Notification.CATEGORY_MESSAGE)
                .setAutoCancel(true)
                .setContentIntent(open(c, conversationId, tag.hashCode()));
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) b.setPriority(Notification.PRIORITY_HIGH).setDefaults(Notification.DEFAULT_ALL);
        manager(c).notify(tag, MESSAGE_ID, b.build());
        synchronized (shown) {
            shown.add(tag);
        }
    }

    /** The user is back in the app: what the notifications said is on screen now. */
    static void clearMessages(Context c) {
        synchronized (shown) {
            for (String tag : shown) manager(c).cancel(tag, MESSAGE_ID);
            shown.clear();
        }
    }

    @SuppressWarnings("deprecation")
    static Notification connection(Context c) {
        Notification.Builder b = builder(c, CONNECTION)
                .setSmallIcon(R.drawable.ic_stat_orbis)
                .setColor(ACCENT)
                .setContentTitle(c.getString(R.string.connection_title))
                .setContentText(c.getString(R.string.connection_text))
                .setOngoing(true)
                .setContentIntent(open(c, null, CONNECTION_ID));
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) b.setPriority(Notification.PRIORITY_MIN);
        return b.build();
    }
}
