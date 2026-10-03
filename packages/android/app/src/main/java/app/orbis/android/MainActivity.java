// The Orbis Android app (specs/android-app, ADR 0012): a WebView that shows the web app the user's hub
// serves, so the phone always runs the hub's own version. The first screen asks for the hub's address;
// the web app itself asks for the token (or takes it from a link ending in #token=...).
package app.orbis.android;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    static final String CONNECT_PAGE = "file:///android_asset/connect.html";
    private static final String PREFS = "orbis";
    private static final String KEY_HUB = "hubUrl";
    private static final int PICK_FILES = 1;

    private WebView web;
    /** The hub's origin (scheme://host:port): pages there stay in the app, any other link opens outside. */
    private String hubOrigin;
    /** The page the connect screen led to: forget the way there once it shows, so Back does not return to it. */
    private boolean clearHistoryOnLoad;
    private ValueCallback<Uri[]> pendingFiles;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        setContentView(web);

        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true); // the web app keeps its token and choices in localStorage
        settings.setAllowFileAccess(false); // the connect page is an asset, which this does not affect
        settings.setAllowContentAccess(false);
        settings.setSupportMultipleWindows(false); // target="_blank" links come through shouldOverrideUrlLoading
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setUserAgentString(settings.getUserAgentString() + " OrbisAndroid/" + BuildConfig.VERSION_NAME);

        web.addJavascriptInterface(new Bridge(), "orbisAndroid");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());

        String hub = savedHub();
        hubOrigin = hub == null ? null : Hub.origin(hub);
        if (state != null && web.restoreState(state) != null) return;
        if (hub == null) showConnect(null);
        else open(hub);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    private String savedHub() {
        return prefs().getString(KEY_HUB, null);
    }

    /** Show the hub's web app at `url` (which may end in #token=... for the web app to sign in). */
    private void open(String url) {
        hubOrigin = Hub.origin(url);
        clearHistoryOnLoad = true;
        web.loadUrl(url);
    }

    /** The first screen: the hub's address, and why the last try failed. */
    private void showConnect(String error) {
        StringBuilder page = new StringBuilder(CONNECT_PAGE).append("?v=").append(Uri.encode(BuildConfig.VERSION_NAME));
        String hub = savedHub();
        if (hub != null) page.append("&hub=").append(Uri.encode(hub));
        if (error != null) page.append("&error=").append(Uri.encode(error));
        web.loadUrl(page.toString());
    }

    @Override
    public void onBackPressed() {
        String current = web.getUrl();
        if (current != null && current.startsWith(CONNECT_PAGE)) {
            // Back from the connect screen returns to the hub when there is one.
            String hub = savedHub();
            if (hub != null) open(hub);
            else finish();
            return;
        }
        // The web app first closes what is open (a dialog, a panel, a conversation on a phone).
        web.evaluateJavascript("(function(){try{return window.__orbisBack?window.__orbisBack()===true:false}catch(e){return false}})()", handled -> {
            if ("true".equals(handled)) return;
            if (web.canGoBack()) web.goBack();
            else moveTaskToBack(true); // keep the page (and its live stream) for when the user comes back
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == PICK_FILES && pendingFiles != null) {
            pendingFiles.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            pendingFiles = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }

    private void openOutside(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, R.string.no_app_for_link, Toast.LENGTH_SHORT).show();
        }
    }

    /** Write a file the web app hands over (an exported chat, a bot template) to Downloads. */
    private String saveDownload(String name, String mime, String text) throws Exception {
        String file = Hub.safeFileName(name);
        byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, file);
            values.put(MediaStore.Downloads.MIME_TYPE, mime == null || mime.isEmpty() ? "text/plain" : mime);
            Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new IllegalStateException("no Downloads folder");
            try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                if (out == null) throw new IllegalStateException("cannot write " + file);
                out.write(bytes);
            }
            return Environment.DIRECTORY_DOWNLOADS + "/" + file;
        }
        // Before Android 10, the app's own Downloads folder (no storage permission needed).
        File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (dir == null) throw new IllegalStateException("no storage");
        File target = new File(dir, file);
        try (OutputStream out = new FileOutputStream(target)) {
            out.write(bytes);
        }
        return target.getAbsolutePath();
    }

    /** What the pages may ask of the app: connect to a hub, change it, save a file. Nothing more. */
    private final class Bridge {
        /** Connect to the hub at this address; returns why it is not an address, or "" when it loads. */
        @JavascriptInterface
        public String connect(String address) {
            Hub.Target target = Hub.parse(address);
            if (target.error != null) return target.error;
            prefs().edit().putString(KEY_HUB, target.base).apply();
            runOnUiThread(() -> open(target.load));
            return "";
        }

        @JavascriptInterface
        public String hubUrl() {
            String hub = savedHub();
            return hub == null ? "" : hub;
        }

        @JavascriptInterface
        public String version() {
            return BuildConfig.VERSION_NAME;
        }

        @JavascriptInterface
        public void changeHub() {
            runOnUiThread(() -> showConnect(null));
        }

        @JavascriptInterface
        public void saveText(String name, String mime, String text) {
            runOnUiThread(() -> {
                try {
                    Toast.makeText(MainActivity.this, getString(R.string.saved_to, saveDownload(name, mime, text)), Toast.LENGTH_LONG).show();
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, getString(R.string.save_failed, String.valueOf(e.getMessage())), Toast.LENGTH_LONG).show();
                }
            });
        }
    }

    private final class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            String url = uri.toString();
            if (url.startsWith("file:///android_asset/")) return false;
            if (hubOrigin != null && hubOrigin.equals(Hub.origin(url))) return false;
            // A link in a message (a site, a document, mailto:): the phone's browser or app opens it.
            openOutside(uri);
            return true;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            if (clearHistoryOnLoad && hubOrigin != null && hubOrigin.equals(Hub.origin(url))) {
                clearHistoryOnLoad = false;
                view.clearHistory();
            }
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            // The hub did not answer (wrong address, computer off, another network): back to the connect screen.
            if (request.isForMainFrame() && !request.getUrl().toString().startsWith("file:")) {
                showConnect(request.getUrl().getHost() + ": " + error.getDescription());
            }
        }
    }

    private final class Chrome extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            // A file input (a group's photo): the phone's picker.
            if (pendingFiles != null) pendingFiles.onReceiveValue(null);
            pendingFiles = callback;
            try {
                startActivityForResult(params.createIntent(), PICK_FILES);
            } catch (ActivityNotFoundException e) {
                pendingFiles = null;
                return false;
            }
            return true;
        }

        @Override
        public void onPermissionRequest(PermissionRequest request) {
            // No camera or microphone: a hub on plain http is not a secure origin for them anyway.
            request.deny();
        }
    }
}
