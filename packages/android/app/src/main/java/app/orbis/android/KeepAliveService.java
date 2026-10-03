// Keeps the app's process (and the page's live connection to the hub) running while the app is in the
// background, so notifications keep coming (specs/android-app). On only when the user turns it on; it
// shows a lasting notification, as Android asks of a foreground service.
package app.orbis.android;

import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

public class KeepAliveService extends Service {
    static void start(Context c) {
        Intent intent = new Intent(c, KeepAliveService.class);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) c.startForegroundService(intent);
            else c.startService(intent);
        } catch (RuntimeException e) {
            // Android refuses a foreground service started from the background: the next start on screen does it.
        }
    }

    static void stop(Context c) {
        c.stopService(new Intent(c, KeepAliveService.class));
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(Notifier.CONNECTION_ID, Notifier.connection(this), ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(Notifier.CONNECTION_ID, Notifier.connection(this));
        }
        // Not restarted after the system ends it: the page it kept alive is gone with the process.
        return START_NOT_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // The user swiped the app away: the page is gone, nothing is left to keep connected.
        stopSelf();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
