// The Orbis Android app (specs/android-app, ADR 0012, ADR 0018): a WebView that shows the web app the hub
// serves, so the phone always runs the hub's own version. The hub runs on this phone, inside Termux: the app
// starts it, with a token of its own, and opens it signed in — no computer, no pairing (LocalHub). Another
// Orbis (a computer, a server) stays a choice on the first screen. The app adds what a browser tab lacks:
// notifications while it is off screen, the phone's dictation and voice, files, Back, and shared text.
package app.orbis.android;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.PendingIntent;
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

import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicInteger;

public class MainActivity extends Activity {
    static final String CONNECT_PAGE = "file:///android_asset/connect.html";
    private static final String PREFS = "orbis";
    private static final String KEY_HUB = "hubUrl";
    private static final String KEY_RECENT = "recentHubs";
    private static final String KEY_KEEP = "keepConnected";
    private static final String KEY_ASKED = "askedNotifications";
    /** The token of the hub on this phone, made by the app and handed to it on each start. */
    private static final String KEY_LOCAL_TOKEN = "localToken";
    private static final int PICK_FILES = 1;
    private static final int DICTATE = 2;
    private static final int NOTIFICATIONS = 3;
    private static final int TERMUX_PERMISSION = 4;
    /** How long a start may take: the first one, under proot on a slow phone, takes a while. */
    private static final int LOCAL_START_SECONDS = 180;

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
    /** Each start of the hub on this phone; a newer one (or Termux saying it failed) ends the wait of the older. */
    private final AtomicInteger localAttempt = new AtomicInteger();

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
        if (keepConnected()) KeepAliveService.start(this);
        TermuxResult.listener = this::onTermuxResult;
        if (state == null || web.restoreState(state) == null) {
            if (hub == null) showConnect(null, false, false);
            // The hub on this phone: the first screen starts it (or finds it running) and opens it.
            else if (LocalHub.isLocal(hub)) showConnect(null, false, true);
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
        if (TermuxResult.listener != null) TermuxResult.listener = null;
        localAttempt.incrementAndGet();
        if (tts != null) tts.shutdown();
        // Without its page there is nothing left to keep connected.
        if (isFinishing()) KeepAliveService.stop(this);
        web.destroy();
        super.onDestroy();
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    /** Whether the page stays connected with the app in the background (a foreground service). */
    private boolean keepConnected() {
        return prefs().getBoolean(KEY_KEEP, Hub.KEEP_CONNECTED_DEFAULT);
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

    /** Trade a pairing code for the token, then connect; the connect screen hears why a code was refused. */
    private void pair(Hub.Target target, String code) {
        new Thread(() -> {
            Pairing.Result r = Pairing.claim(target.base, code);
            runOnUiThread(() -> {
                if (r.token != null) connectTo(target, target.base + "#token=" + Uri.encode(r.token));
                else if (onConnectPage) web.evaluateJavascript("window.onConnectResult&&window.onConnectResult(" + JSONObject.quote(r.error) + ")", null);
                else Toast.makeText(MainActivity.this, r.error.equals("code") ? R.string.pair_code_refused : R.string.pair_failed, Toast.LENGTH_LONG).show();
            });
        }, "orbis-pairing").start();
    }

    /**
     * Google Play's code scanner: its own camera screen, so the app asks for no camera permission. The connect
     * screen gets what was read, or why nothing was ("cancelled", or "unavailable" without Google Play).
     */
    private void scanQr() {
        GmsBarcodeScannerOptions options = new GmsBarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build();
        GmsBarcodeScanning.getClient(this, options)
                .startScan()
                .addOnSuccessListener(code -> scanned(code.getRawValue(), null))
                .addOnCanceledListener(() -> scanned(null, "cancelled"))
                .addOnFailureListener(e -> scanned(null, "unavailable"));
    }

    private void scanned(String text, String error) {
        if (!onConnectPage) return;
        String args = (text == null ? "null" : JSONObject.quote(text)) + "," + (error == null ? "null" : JSONObject.quote(error));
        web.evaluateJavascript("window.onScanned&&window.onScanned(" + args + ")", null);
    }

    /** Show the hub's web app at `url` (which may end in #token=... for the web app to sign in). */
    private void open(String url) {
        hubOrigin = Hub.origin(url);
        clearHistoryOnLoad = true;
        web.loadUrl(url);
    }

    /**
     * The first screen: Orbis on this phone (started at once when `startLocal`), or another Orbis's address,
     * the recent ones, and why the last try failed.
     */
    private void showConnect(String error, boolean certificate, boolean startLocal) {
        StringBuilder page = new StringBuilder(CONNECT_PAGE).append("?v=").append(Uri.encode(BuildConfig.VERSION_NAME));
        String hub = savedHub();
        if (hub != null && !LocalHub.isLocal(hub)) page.append("&hub=").append(Uri.encode(hub));
        List<String> others = new ArrayList<>();
        for (String h : recentHubs()) if (!LocalHub.isLocal(h)) others.add(h);
        page.append("&recent=").append(Uri.encode(new JSONArray(others).toString()));
        if (error != null) page.append("&error=").append(Uri.encode(error));
        if (certificate) page.append("&cert=1");
        if (startLocal) page.append("&local=start");
        web.loadUrl(page.toString());
    }

    // ---- The hub on this phone (Termux) ----

    private String localToken() {
        String token = prefs().getString(KEY_LOCAL_TOKEN, null);
        if (token == null) {
            token = LocalHub.newToken(new SecureRandom());
            prefs().edit().putString(KEY_LOCAL_TOKEN, token).apply();
        }
        return token;
    }

    private boolean termuxInstalled() {
        try {
            getPackageManager().getPackageInfo(LocalHub.TERMUX, 0);
            return true;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }

    private boolean termuxAllowed() {
        return checkSelfPermission(LocalHub.PERMISSION) == PackageManager.PERMISSION_GRANTED;
    }

    /** What the system says about Termux and its permission, for the screen that cannot get it granted. */
    @SuppressWarnings("deprecation")
    private String diagnosis() {
        String version = null;
        String installer = null;
        boolean declared = true;
        boolean requested = false;
        try {
            version = getPackageManager().getPackageInfo(LocalHub.TERMUX, 0).versionName;
            installer = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                    ? getPackageManager().getInstallSourceInfo(LocalHub.TERMUX).getInstallingPackageName()
                    : getPackageManager().getInstallerPackageName(LocalHub.TERMUX);
        } catch (PackageManager.NameNotFoundException ignored) {
            // not installed: the screen says so
        }
        try {
            getPackageManager().getPermissionInfo(LocalHub.PERMISSION, 0);
        } catch (PackageManager.NameNotFoundException e) {
            declared = false;
        }
        try {
            String[] asked = getPackageManager().getPackageInfo(getPackageName(), PackageManager.GET_PERMISSIONS).requestedPermissions;
            if (asked != null) for (String name : asked) if (LocalHub.PERMISSION.equals(name)) requested = true;
        } catch (PackageManager.NameNotFoundException ignored) {
            // cannot happen: this app is installed
        }
        return LocalHub.diagnosis(version, installer, declared, requested, termuxAllowed(), Build.VERSION.SDK_INT, Build.MANUFACTURER + " " + Build.MODEL);
    }

    /** "no-termux", "no-permission" or "ready": what the first screen shows before anything is tried. */
    private String localState() {
        if (!termuxInstalled()) return "no-termux";
        return termuxAllowed() ? "ready" : "no-permission";
    }

    /** Tell the first screen how the start goes: "starting" (seconds so far), a failure, or why not. */
    private void toLocal(String state, String detail) {
        if (!onConnectPage) return;
        web.evaluateJavascript("window.onLocal&&window.onLocal(" + JSONObject.quote(state) + "," + (detail == null ? "null" : JSONObject.quote(detail)) + ")", null);
    }

    /** Ask Termux to run the hub (`orbis-phone serve`), handing it the app's token on stdin. */
    private void runServe(String token, int attempt) {
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0);
        PendingIntent result = PendingIntent.getBroadcast(this, attempt, new Intent(this, TermuxResult.class).putExtra(TermuxResult.EXTRA_ATTEMPT, attempt), flags);
        Intent intent = new Intent(LocalHub.RUN_COMMAND)
                .setClassName(LocalHub.TERMUX, LocalHub.RUN_COMMAND_SERVICE)
                .putExtra("com.termux.RUN_COMMAND_PATH", LocalHub.BASH)
                .putExtra("com.termux.RUN_COMMAND_ARGUMENTS", LocalHub.serveArguments())
                .putExtra("com.termux.RUN_COMMAND_STDIN", token + "\n")
                .putExtra("com.termux.RUN_COMMAND_WORKDIR", LocalHub.TERMUX_HOME)
                .putExtra("com.termux.RUN_COMMAND_BACKGROUND", true)
                .putExtra("com.termux.RUN_COMMAND_COMMAND_LABEL", "Orbis")
                .putExtra("com.termux.RUN_COMMAND_COMMAND_DESCRIPTION", getString(R.string.local_running))
                .putExtra("com.termux.RUN_COMMAND_PENDING_INTENT", result);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(intent);
        else startService(intent);
    }

    /** Start the hub on this phone (or find it running), wait until it answers, then open it signed in. */
    private void startLocal() {
        int attempt = localAttempt.incrementAndGet();
        if (!termuxInstalled()) {
            toLocal("no-termux", null);
            return;
        }
        String token = localToken();
        if (!termuxAllowed()) {
            // Started from Termux (`orbis-phone open`) it needs no permission: straight in. Otherwise ask for it.
            new Thread(() -> {
                boolean up = "up".equals(LocalHub.probe(LocalHub.BASE, token, 1500));
                runOnUiThread(() -> {
                    if (up) connectTo(Hub.parse(LocalHub.BASE), LocalHub.signedIn(token));
                    else requestPermissions(new String[] {LocalHub.PERMISSION}, TERMUX_PERMISSION);
                });
            }, "orbis-local-probe").start();
            return;
        }
        toLocal("starting", "0");
        new Thread(() -> {
            // Already running with this token (the app was only closed): straight in.
            String state = LocalHub.probe(LocalHub.BASE, token, 1500);
            if (!"up".equals(state)) {
                runOnUiThread(() -> {
                    try {
                        runServe(token, attempt);
                    } catch (SecurityException e) {
                        localAttempt.incrementAndGet();
                        toLocal("no-permission", null);
                    } catch (RuntimeException e) {
                        localAttempt.incrementAndGet();
                        toLocal("stopped", String.valueOf(e.getMessage()));
                    }
                });
                for (int seconds = 1; seconds <= LOCAL_START_SECONDS && localAttempt.get() == attempt; seconds++) {
                    try {
                        Thread.sleep(1000);
                    } catch (InterruptedException e) {
                        return;
                    }
                    state = LocalHub.probe(LocalHub.BASE, token, 1500);
                    if ("up".equals(state)) break;
                    String shown = String.valueOf(seconds);
                    runOnUiThread(() -> {
                        if (localAttempt.get() == attempt) toLocal("starting", shown);
                    });
                }
            }
            if (localAttempt.get() != attempt) return;
            if ("up".equals(state)) runOnUiThread(() -> connectTo(Hub.parse(LocalHub.BASE), LocalHub.signedIn(token)));
            else runOnUiThread(() -> toLocal("timeout", null));
        }, "orbis-local-hub").start();
    }

    /** Termux's answer when the command ended: a start that failed, or a hub that stopped. */
    private void onTermuxResult(int attempt, int exitCode, String stderr, String errmsg) {
        String why = LocalHub.failure(exitCode, stderr, errmsg);
        // Nothing went wrong (it was already running), or an older run ended (a restart with a new token).
        if (why == null || attempt != localAttempt.get()) return;
        String detail = LocalHub.tail((stderr + "\n" + errmsg).trim(), 600);
        runOnUiThread(() -> {
            localAttempt.incrementAndGet();
            if (onConnectPage) toLocal(why, detail);
            else if (LocalHub.isLocal(savedHub())) Toast.makeText(this, getString(R.string.local_stopped, detail), Toast.LENGTH_LONG).show();
        });
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode != TERMUX_PERMISSION) return;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) startLocal();
        else toLocal("no-permission", diagnosis());
    }

    private void openAppSettings() {
        try {
            startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName())));
        } catch (ActivityNotFoundException ignored) {
            // no settings screen to open
        }
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
            // A sign-in link (as Orbis-Celular.bat prints it) or a pairing link (the computer's QR code)
            // connects; any other text goes to a message box.
            Hub.Target link = Hub.signInLink(text);
            Hub.Target pairing = link == null ? Hub.pairLink(text) : null;
            if (link != null) {
                // The hub on this phone, opened from Termux: its token becomes the app's, so the next start finds it.
                String local = LocalHub.tokenOf(text);
                if (local != null) prefs().edit().putString(KEY_LOCAL_TOKEN, local).apply();
                connectTo(link, link.load);
            } else if (pairing != null) pair(pairing, Hub.pairCode(pairing.load));
            else toPage(callHook("__orbisShare", JSONObject.quote(text)));
        }
    }

    @Override
    public void onBackPressed() {
        String current = web.getUrl();
        if (current != null && current.startsWith(CONNECT_PAGE)) {
            // Back from the connect screen returns to the hub when there is one.
            localAttempt.incrementAndGet();
            String hub = savedHub();
            if (hub != null && !LocalHub.isLocal(hub)) open(hub);
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
            pendingFiles.onReceiveValue(pickedFiles(resultCode, data));
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
    /** What the file picker gave: one file, or several when the page asked for many (files sent in a chat). */
    private static Uri[] pickedFiles(int resultCode, Intent data) {
        if (resultCode != RESULT_OK || data == null) return null;
        android.content.ClipData clip = data.getClipData();
        if (clip != null && clip.getItemCount() > 0) {
            Uri[] uris = new Uri[clip.getItemCount()];
            for (int i = 0; i < uris.length; i++) uris[i] = clip.getItemAt(i).getUri();
            return uris;
        }
        return WebChromeClient.FileChooserParams.parseResult(resultCode, data);
    }

    private String saveDownload(String name, String mime, String text) throws Exception {
        return saveDownload(name, mime, text.getBytes(StandardCharsets.UTF_8));
    }

    private String saveDownload(String name, String mime, byte[] bytes) throws Exception {
        String file = Hub.safeFileName(name);
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
            // A link from the computer's QR code carries its own code (…#pair=483219).
            String linkCode = Hub.pairCode(address);
            String pairing = Pairing.digits(code).isEmpty() && linkCode != null ? linkCode : code;
            if (Pairing.digits(pairing).isEmpty()) {
                runOnUiThread(() -> connectTo(target, target.load));
                return "";
            }
            pair(target, pairing);
            return "pending";
        }

        /** Read the computer's QR code with the phone's camera (Google Play's scanner) — from the connect screen only. */
        @JavascriptInterface
        public void scanQr() {
            if (onConnectPage) runOnUiThread(MainActivity.this::scanQr);
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
            runOnUiThread(() -> showConnect(null, false, false));
        }

        /** "no-termux", "no-permission" or "ready" — from the connect screen only. */
        @JavascriptInterface
        public String localState() {
            return onConnectPage ? MainActivity.this.localState() : "";
        }

        /** Start Orbis on this phone and open it; the screen hears how it goes on window.onLocal. */
        @JavascriptInterface
        public void startLocal() {
            if (onConnectPage) runOnUiThread(MainActivity.this::startLocal);
        }

        /** Stop waiting for the hub on this phone. */
        @JavascriptInterface
        public void stopWaiting() {
            localAttempt.incrementAndGet();
        }

        /** What to paste in Termux once, to install Orbis there. */
        @JavascriptInterface
        public String installCommand() {
            return LocalHub.installCommand(BuildConfig.ORBIS_REPO);
        }

        @JavascriptInterface
        public void copyInstallCommand() {
            if (!onConnectPage) return;
            runOnUiThread(() -> {
                ClipboardManager clipboard = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                if (clipboard == null) return;
                clipboard.setPrimaryClip(ClipData.newPlainText("Orbis", LocalHub.installCommand(BuildConfig.ORBIS_REPO)));
                Toast.makeText(MainActivity.this, R.string.command_copied, Toast.LENGTH_SHORT).show();
            });
        }

        /** Termux itself, to paste the command (or its download page when it is missing). */
        @JavascriptInterface
        public void openTermux() {
            if (!onConnectPage) return;
            runOnUiThread(() -> {
                Intent launch = getPackageManager().getLaunchIntentForPackage(LocalHub.TERMUX);
                if (launch != null) startActivity(launch);
                else openOutside(Uri.parse(LocalHub.TERMUX_DOWNLOAD));
            });
        }

        @JavascriptInterface
        public void getTermux() {
            if (onConnectPage) runOnUiThread(() -> openOutside(Uri.parse(LocalHub.TERMUX_DOWNLOAD)));
        }

        /** The app's settings, where the Termux permission is granted by hand once refused. */
        @JavascriptInterface
        public void openAppSettings() {
            if (onConnectPage) runOnUiThread(MainActivity.this::openAppSettings);
        }

        /**
         * The web app lost the hub on this phone (Android stopped Termux): start it again, quietly. Only for
         * the hub on this phone; the web app waits for it to answer as after any lost connection.
         */
        @JavascriptInterface
        public void ensureLocalHub() {
            runOnUiThread(() -> {
                if (!LocalHub.isLocal(savedHub()) || !termuxInstalled() || !termuxAllowed()) return;
                try {
                    runServe(localToken(), localAttempt.incrementAndGet());
                } catch (RuntimeException ignored) {
                    // the web app keeps saying it is reconnecting
                }
            });
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

        /** A file of a conversation (an image, a PDF) to Downloads; the page sends its bytes in base64. */
        @JavascriptInterface
        public void saveFile(String name, String mime, String base64) {
            runOnUiThread(() -> {
                try {
                    byte[] bytes = android.util.Base64.decode(base64, android.util.Base64.DEFAULT);
                    Toast.makeText(MainActivity.this, getString(R.string.saved_to, saveDownload(name, mime, bytes)), Toast.LENGTH_LONG).show();
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
            return MainActivity.this.keepConnected();
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
            // The hub did not answer: on this phone, start it again; elsewhere (a computer off, another
            // network), back to the connect screen, which says why.
            if (request.isForMainFrame() && !request.getUrl().toString().startsWith("file:")) {
                if (LocalHub.isLocal(request.getUrl().toString())) showConnect(null, false, true);
                else showConnect(request.getUrl().getHost() + ": " + error.getDescription(), false, false);
            }
        }

        @Override
        public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
            // An https hub whose certificate the phone does not trust: never load it anyway.
            handler.cancel();
            String host = Uri.parse(error.getUrl()).getHost();
            if (hubOrigin != null && hubOrigin.equals(Hub.origin(error.getUrl()))) showConnect(host, true, false);
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
