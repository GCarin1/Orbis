package app.orbis.android;

import android.app.Activity;
import android.os.Bundle;
import android.util.TypedValue;
import android.widget.ScrollView;
import android.widget.TextView;

/**
 * Why Orbis reads health data (specs/android-app): Health Connect opens this from its permission screen and its
 * settings, and only shows the permissions of an app that has one.
 */
public class HealthPrivacyActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setTitle(R.string.health_privacy_title);
        TextView text = new TextView(this);
        int pad = (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, 20, getResources().getDisplayMetrics());
        text.setPadding(pad, pad, pad, pad);
        text.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        text.setText(R.string.health_privacy);
        ScrollView scroll = new ScrollView(this);
        scroll.addView(text);
        setContentView(scroll);
    }
}
