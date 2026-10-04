// The hub on this phone (specs/android-app, ADR 0018): Orbis runs inside Termux, in a Debian made by
// proot-distro (scripts/android/orbis-termux.sh), and the app starts it through Termux's RUN_COMMAND. The
// app owns the hub's token and hands it over on each start, so the user never types or pairs anything.
// Plain Java, tested on the JVM; MainActivity does the Android part.
package app.orbis.android;

import android.annotation.SuppressLint;

import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.SecureRandom;

// Termux's own paths: fixed by Termux, not this app's files.
@SuppressLint("SdCardPath")
final class LocalHub {
    static final String TERMUX = "com.termux";
    static final String RUN_COMMAND_SERVICE = "com.termux.app.RunCommandService";
    static final String RUN_COMMAND = "com.termux.RUN_COMMAND";
    /** Granted by the user ("Run commands in Termux environment"); Termux also needs allow-external-apps. */
    static final String PERMISSION = "com.termux.permission.RUN_COMMAND";
    static final String TERMUX_HOME = "/data/data/com.termux/files/home";
    static final String BASH = "/data/data/com.termux/files/usr/bin/bash";
    /** Written by the install script; runs the script in the Orbis checkout inside Debian. */
    static final String SCRIPT = "/data/data/com.termux/files/usr/bin/orbis-phone";
    /** Where to get Termux: F-Droid's build (Google Play's is an old one RUN_COMMAND does not serve). */
    static final String TERMUX_DOWNLOAD = "https://f-droid.org/packages/com.termux/";
    static final int PORT = Hub.DEFAULT_PORT;
    /** The hub listens on this phone only. */
    static final String BASE = "http://127.0.0.1:" + PORT + "/";

    private LocalHub() {}

    /** Whether a saved hub is the one on this phone. */
    static boolean isLocal(String hub) {
        String origin = Hub.origin(hub);
        return origin != null && (origin.equals("http://127.0.0.1:" + PORT) || origin.equals("http://localhost:" + PORT));
    }

    /** A new token for the hub on this phone: 32 random bytes in hex (java.util.Base64 needs Android 8). */
    static String newToken(SecureRandom random) {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        StringBuilder hex = new StringBuilder(64);
        for (byte b : bytes) hex.append(Character.forDigit((b >> 4) & 0xf, 16)).append(Character.forDigit(b & 0xf, 16));
        return hex.toString();
    }

    /** What to paste in Termux once: download the install script of this app's repository and run it. */
    static String installCommand(String repository) {
        return "curl -fsSLo orbis-termux.sh https://raw.githubusercontent.com/" + repository
                + "/HEAD/scripts/android/orbis-termux.sh && bash orbis-termux.sh";
    }

    /** The command Termux runs: the script, through bash (so a missing script is a clear exit 127). */
    static String[] serveArguments() {
        return new String[] {SCRIPT, "serve", "--token-stdin"};
    }

    /** The page the app loads once the hub answers: the web app, signed in with the app's token. */
    static String signedIn(String token) {
        return BASE + "#token=" + token;
    }

    /** "up" (answers and takes the token), "other" (answers, another token), or "down". */
    static String probe(String base, String token, int timeoutMs) {
        HttpURLConnection http = null;
        try {
            http = (HttpURLConnection) new URL(base + "api/v1/voice").openConnection();
            http.setConnectTimeout(timeoutMs);
            http.setReadTimeout(timeoutMs);
            http.setRequestProperty("Authorization", "Bearer " + token);
            int status = http.getResponseCode();
            return status == 200 ? "up" : status == 401 ? "other" : "down";
        } catch (IOException e) {
            return "down";
        } finally {
            if (http != null) http.disconnect();
        }
    }

    /**
     * Why Termux's run ended, for the connect screen: "not-installed" (no orbis-phone yet), "external-apps"
     * (Termux refuses commands from other apps), "stopped" (the hub ended; the last lines say why), or null
     * when nothing went wrong (the hub was already running).
     */
    static String failure(int exitCode, String stderr, String errmsg) {
        String err = errmsg == null ? "" : errmsg;
        if (err.contains("allow-external-apps")) return "external-apps";
        if (exitCode == 127 || (stderr != null && stderr.contains("orbis-phone: No such file"))) return "not-installed";
        if (stderr != null && stderr.contains("Orbis is not installed")) return "not-installed";
        if (exitCode == 0 && err.isEmpty()) return null;
        return "stopped";
    }

    /** The last lines of what the hub printed, at most `max` characters. */
    static String tail(String text, int max) {
        if (text == null) return "";
        String trimmed = text.trim();
        return trimmed.length() <= max ? trimmed : "…" + trimmed.substring(trimmed.length() - max);
    }
}
