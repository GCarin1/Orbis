// What Termux answers when the command the app ran ends (RUN_COMMAND's pending intent): the hub on this
// phone stopped, or never started. Not exported: only the app's own pending intent, sent by Termux, gets here.
package app.orbis.android;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;

public class TermuxResult extends BroadcastReceiver {
    static final String EXTRA_ATTEMPT = "attempt";

    interface Listener {
        void onTermuxResult(int attempt, int exitCode, String stderr, String errmsg);
    }

    /** The activity on screen, if any. */
    static volatile Listener listener;

    @Override
    public void onReceive(Context context, Intent intent) {
        Bundle result = intent.getBundleExtra("result");
        Listener current = listener;
        if (result == null || current == null) return;
        current.onTermuxResult(
                intent.getIntExtra(EXTRA_ATTEMPT, -1), result.getInt("exitCode", -1), result.getString("stderr", ""), result.getString("errmsg", ""));
    }
}
