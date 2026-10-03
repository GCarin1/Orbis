// The Orbis Android app (specs/android-app, ADR 0012): a WebView that shows the web app the user's hub
// serves, so the phone always runs the hub's own version. The first screen asks for the hub's address (and
// a pairing code, traded for the token); the app adds what a browser tab lacks: notifications while it is
// off screen, the phone's dictation and voice, files, Back, and text shared from other apps.
package app.orbis.android;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentValues;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.Settings;
import android.speech.RecognizerIntent;
import android.speech.tts.TextToSpeech;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public class MainActivity extends Activity {
    static final String CONNECT_PAGE = "file:///android_asset/connect.html";
    private static final String PREFS = "orbis";
    private static final String KEY_HUB = "hubUrl";
    private static final String KEY_RECENT = "recentHubs";
    private static final String KEY_KEEP = "keepConnected";
    private static final String KEY_ASKED = "askedNotifications";
    private static final int PICK_FILES = 1;
    private static final int DICTATE = 2;
    private static final int NOTIFICATIONS = 3;

    private WebView web;
    /** The hub's origin (scheme://host:port): pages there stay in the app, any other link opens outside. */
    private String hubOrigin;
    /** The page the connect screen led to: forget the way there once it shows, so Back does not return to it. */
    private boolean clearHistoryOnLoad;
    /** Whether the connect screen is showing: only it may point the app at another hub. */
    private volatile boolean onConnectPage;
    /** Whether the hub's page finished loading (what is handed to it waits until then). */
    private boolean hubReady;
    private final List<String> pendingScripts = new ArrayList<>();
    private ValueCallback<Uri[]> pendingFiles;
    private TextToSpeech tts;
    private boolean ttsReady;
    private String[] pendingSpeech;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Notifier.channels(this);
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
        if (prefs().getBoolean(KEY_KEEP, false)) KeepAliveService.start(this);
        if (state == null || web.restoreState(state) == null) {
            if (hub == null) showConnect(null, false);
            else open(hub);
        }
        handle(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handle(intent);
    }

    @Override
    protected void onResume() {
        super.onResume();
        Notifier.clearMessages(this);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onDestroy() {
        if (tts != null) tts.shutdown();
        // Without its page there is nothing left to keep connected.
        if (isFinishing()) KeepAliveService.stop(this);
        web.destroy();
        super.onDestroy();
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    private String savedHub() {
        return prefs().getString(KEY_HUB, null);
    }

    private List<String> recentHubs() {
        List<String> list = new ArrayList<>();
        try {
            JSONArray saved = new JSONArray(prefs().getString(KEY_RECENT, "[]"));
            for (int i = 0; i < saved.length(); i++) list.add(saved.getString(i));
        } catch (Exception ignored) {
            // a broken list is no list
        }
        return list;
    }

    /** Remember the hub (and the last few), then show its web app. */
    private void connectTo(Hub.Target target, String load) {
        prefs().edit().putString(KEY_HUB, target.base).putString(KEY_RECENT, new JSONArray(Hub.recent(recentHubs(), target.base, 5)).toString()).apply();
        open(load);
    }

    /** Show the hub's web app at `url` (which may end in #token=... for the web app to sign in). */
    private void open(String url) {
        hubOrigin = Hub.origin(url);
        clearHistoryOnLoad = true;
        web.loadUrl(url);
    }

    /** The first screen: the hub's address, the recent ones, and why the last try failed. */
    private void showConnect(String error, boolean certificate) {
        StringBuilder page = new StringBuilder(CONNECT_PAGE).append("?v=").append(Uri.encode(BuildConfig.VERSION_NAME));
        String hub = savedHub();
        if (hub != null) page.append("&hub=").append(Uri.encode(hub));
        page.append("&recent=").append(Uri.encode(new JSONArray(recentHubs()).toString()));
        if (error != null) page.append("&error=").append(Uri.encode(error));
        if (certificate) page.append("&cert=1");
        web.loadUrl(page.toString());
    }

    /** Hand a script to the hub's page once it is loaded (a notification's conversation, shared text). */
    private void toPage(String script) {
        if (hubReady) web.evaluateJavascript(script, null);
        else pendingScripts.add(script);
    }

    /** Call a hook of the web app, waiting a little for it: the page registers it once it has started. */
    private static String callHook(String hook, String argument) {
        return "(function f(n){if(window." + hook + ")window." + hook + "(" + argument + ");else if(n<50)setTimeout(function(){f(n+1)},200)})(0)";
    }

    /** A notification's tap, or text shared from another app. */
    private void handle(Intent intent) {
        if (intent == null) return;
        String conversation = intent.getStringExtra(Notifier.EXTRA_CONVERSATION);
        if (conversation != null) {
            intent.removeExtra(Notifier.EXTRA_CONVERSATION);
            toPage(callHook("__orbisOpenConversation", JSONObject.quote(conversation)));
        }
        if (Intent.ACTION_SEND.equals(intent.getAction()) && intent.getStringExtra(Intent.EXTRA_TEXT) != null) {
            String text = intent.getStringExtra(Intent.EXTRA_TEXT);
            intent.setAction(Intent.ACTION_MAIN); // handled once, not again after a rotation
            // A sign-in link (as Orbis-Celular.bat prints it) connects; any other text goes to a message box.
            Hub.Target link = Hub.signInLink(text);
            if (link != null) connectTo(link, link.load);
            else toPage(callHook("__orbisShare", JSONObject.quote(text)));
        }
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
        if (requestCode == DICTATE) {
            ArrayList<String> heard = data == null ? null : data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            String result = resultCode == RESULT_OK && heard != null && !heard.isEmpty() && !heard.get(0).trim().isEmpty()
                    ? "{\"text\":" + JSONObject.quote(heard.get(0)) + "}"
                    : resultCode == RESULT_OK ? "{\"error\":\"no-speech\"}" : "{\"error\":\"aborted\"}";
            web.evaluateJavascript("window.__orbisDictation&&window.__orbisDictation(" + result + ")", null);
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    private void openOutside(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, R.string.no_app_for_link, Toast.LENGTH_SHORT).show();
        }
    }

    private void askNotifications() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                && (!prefs().getBoolean(KEY_ASKED, false) || shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS))) {
            prefs().edit().putBoolean(KEY_ASKED, true).apply();
            requestPermissions(new String[] {Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATIONS);
            return;
        }
        // Refused for good, or turned off in the system: its settings page.
        Intent settings = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName())
                : new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()));
        try {
            startActivity(settings);
        } catch (ActivityNotFoundException ignored) {
            // no settings screen to open
        }
    }

    private void say(String text, String lang) {
        if (tts == null) {
            pendingSpeech = new String[] {text, lang};
            tts = new TextToSpeech(this, status -> {
                ttsReady = status == TextToSpeech.SUCCESS;
                if (ttsReady && pendingSpeech != null) say(pendingSpeech[0], pendingSpeech[1]);
                pendingSpeech = null;
            });
            return;
        }
        if (!ttsReady) {
            pendingSpeech = new String[] {text, lang};
            return;
        }
        tts.setLanguage(Locale.forLanguageTag(lang));
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "orbis");
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

    /** What the pages may ask of the app. Nothing reaches the phone's files, contacts or sensors. */
    private final class Bridge {
        /**
         * Connect to the hub at this address — from the connect screen only. With a pairing code, trade it for
         * the token first. Returns why the address is refused, "pending" while a code is traded, or "".
         */
        @JavascriptInterface
        public String connect(String address, String code) {
            if (!onConnectPage) return "invalid";
            Hub.Target target = Hub.parse(address);
            if (target.error != null) return target.error;
            if (Pairing.digits(code).isEmpty()) {
                runOnUiThread(() -> connectTo(target, target.load));
                return "";
            }
            new Thread(() -> {
                Pairing.Result r = Pairing.claim(target.base, code);
                runOnUiThread(() -> {
                    if (r.token != null) connectTo(target, target.base + "#token=" + Uri.encode(r.token));
                    else web.evaluateJavascript("window.onConnectResult&&window.onConnectResult(" + JSONObject.quote(r.error) + ")", null);
                });
            }, "orbis-pairing").start();
            return "pending";
        }

        /** The text on the phone's clipboard (a link copied from the computer), for the connect screen. */
        @JavascriptInterface
        public String clipboardText() {
            if (!onConnectPage) return "";
            ClipboardManager clipboard = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
            ClipData clip = clipboard == null ? null : clipboard.getPrimaryClip();
            if (clip == null || clip.getItemCount() == 0) return "";
            CharSequence text = clip.getItemAt(0).coerceToText(MainActivity.this);
            return text == null ? "" : text.toString();
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
            runOnUiThread(() -> showConnect(null, false));
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

        @JavascriptInterface
        public void notify(String tag, String title, String body, String conversationId) {
            Notifier.message(MainActivity.this, tag, title, body, conversationId);
        }

        @JavascriptInterface
        public boolean notificationsAllowed() {
            return Notifier.allowed(MainActivity.this);
        }

        @JavascriptInterface
        public void requestNotifications() {
            runOnUiThread(MainActivity.this::askNotifications);
        }

        @JavascriptInterface
        public boolean keepConnected() {
            return prefs().getBoolean(KEY_KEEP, false);
        }

        @JavascriptInterface
        public void setKeepConnected(boolean on) {
            prefs().edit().putBoolean(KEY_KEEP, on).apply();
            runOnUiThread(() -> {
                if (on) KeepAliveService.start(MainActivity.this);
                else KeepAliveService.stop(MainActivity.this);
            });
        }

        @JavascriptInterface
        public void openBatterySettings() {
            runOnUiThread(() -> {
                try {
                    startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
                } catch (ActivityNotFoundException e) {
                    startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName())));
                }
            });
        }

        /** The phone's speech recognition (its own screen); the words come back to window.__orbisDictation. */
        @JavascriptInterface
        public void dictate(String lang) {
            runOnUiThread(() -> {
                Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                        .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                        .putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang)
                        .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
                try {
                    startActivityForResult(intent, DICTATE);
                } catch (ActivityNotFoundException e) {
                    web.evaluateJavascript("window.__orbisDictation&&window.__orbisDictation({error:'service-not-allowed'})", null);
                }
            });
        }

        @JavascriptInterface
        public void speak(String text, String lang) {
            runOnUiThread(() -> say(text, lang));
        }

        @JavascriptInterface
        public void stopSpeaking() {
            runOnUiThread(() -> {
                pendingSpeech = null;
                if (tts != null) tts.stop();
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
        public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            onConnectPage = url != null && url.startsWith(CONNECT_PAGE);
            hubReady = false;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            if (hubOrigin == null || !hubOrigin.equals(Hub.origin(url))) return;
            if (clearHistoryOnLoad) {
                clearHistoryOnLoad = false;
                view.clearHistory();
            }
            hubReady = true;
            for (String script : pendingScripts) view.evaluateJavascript(script, null);
            pendingScripts.clear();
            // The first time a hub shows, ask once whether the app may notify (Android 13 and later).
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !prefs().getBoolean(KEY_ASKED, false) && !Notifier.allowed(MainActivity.this)) {
                askNotifications();
            }
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            // The hub did not answer (wrong address, computer off, another network): back to the connect screen.
            if (request.isForMainFrame() && !request.getUrl().toString().startsWith("file:")) {
                showConnect(request.getUrl().getHost() + ": " + error.getDescription(), false);
            }
        }

        @Override
        public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
            // An https hub whose certificate the phone does not trust: never load it anyway.
            handler.cancel();
            String host = Uri.parse(error.getUrl()).getHost();
            if (hubOrigin != null && hubOrigin.equals(Hub.origin(error.getUrl()))) showConnect(host, true);
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
            // No camera or microphone for the page (dictation goes through the phone's recognizer instead).
            request.deny();
        }
    }
}
