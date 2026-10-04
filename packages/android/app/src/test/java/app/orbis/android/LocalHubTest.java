// specs/android-app — the hub on this phone (ADR 0018): its address, the app's own token, the command that
// installs Orbis in Termux, what Termux runs, whether the hub answers with the app's token, and why a run
// in Termux ended.
package app.orbis.android;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;

import org.junit.Test;

public class LocalHubTest {
    @Test
    public void theHubOnThisPhoneIsKnownByItsAddress() {
        assertTrue(LocalHub.isLocal("http://127.0.0.1:7420/"));
        assertTrue(LocalHub.isLocal("http://localhost:7420/#token=x"));
        assertFalse(LocalHub.isLocal("http://192.168.0.10:7420/"));
        assertFalse(LocalHub.isLocal("http://127.0.0.1:8080/"));
        assertFalse(LocalHub.isLocal(null));
        assertEquals("http://127.0.0.1:7420/#token=abc", LocalHub.signedIn("abc"));
        assertEquals("http://127.0.0.1:7420/", Hub.parse(LocalHub.BASE).base);
    }

    @Test
    public void theAppMakesItsOwnLongRandomToken() {
        SecureRandom random = new SecureRandom();
        String a = LocalHub.newToken(random);
        String b = LocalHub.newToken(random);
        assertTrue(a.matches("[0-9a-f]{64}"));
        assertNotEquals(a, b);
    }

    @Test
    public void termuxInstallsFromTheAppsRepositoryAndRunsTheScriptThroughBash() {
        assertEquals(
                "curl -fsSLo orbis-termux.sh https://raw.githubusercontent.com/someone/Orbis/HEAD/scripts/android/orbis-termux.sh && bash orbis-termux.sh",
                LocalHub.installCommand("someone/Orbis"));
        assertArrayEquals(new String[] {"/data/data/com.termux/files/usr/bin/orbis-phone", "serve", "--token-stdin"}, LocalHub.serveArguments());
        assertEquals("/data/data/com.termux/files/usr/bin/bash", LocalHub.BASH);
    }

    @Test
    public void theTokenOfTheLinkTermuxHandsOverIsTheAppsOwn() {
        assertEquals("abc123", LocalHub.tokenOf("http://127.0.0.1:7420/#token=abc123"));
        assertEquals("abc123", LocalHub.tokenOf("Orbis: http://127.0.0.1:7420/#token=abc123&x=1"));
        assertNull(LocalHub.tokenOf("http://192.168.0.10:7420/#token=abc123"));
        assertNull(LocalHub.tokenOf("http://127.0.0.1:7420/"));
        assertNull(LocalHub.tokenOf(null));
    }

    @Test
    public void theDiagnosisStatesTheFactsThatKeepThePermissionAway() {
        assertEquals(
                "termux=0.118.3 from=org.fdroid.fdroid declares=no requested=yes granted=no android=34 device=Google Pixel 8",
                LocalHub.diagnosis("0.118.3", "org.fdroid.fdroid", false, true, false, 34, "Google Pixel 8"));
        assertEquals(
                "termux=? from=? declares=yes requested=no granted=yes android=24 device=x",
                LocalHub.diagnosis(null, null, true, false, true, 24, "x"));
    }

    /** A stand-in hub on a free port: 200 to `Bearer good`, 401 to any other token. */
    private static ServerSocket standInHub() throws Exception {
        ServerSocket server = new ServerSocket(0, 10, InetAddress.getByName("127.0.0.1"));
        Thread thread = new Thread(() -> {
            while (!server.isClosed()) {
                try (Socket socket = server.accept()) {
                    BufferedReader in = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
                    boolean ok = false;
                    for (String line; (line = in.readLine()) != null && !line.isEmpty(); ) {
                        if (line.equalsIgnoreCase("Authorization: Bearer good")) ok = true;
                    }
                    OutputStream out = socket.getOutputStream();
                    out.write(((ok ? "HTTP/1.1 200 OK" : "HTTP/1.1 401 Unauthorized") + "\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.UTF_8));
                    out.flush();
                } catch (Exception ignored) {
                    // closed
                }
            }
        });
        thread.setDaemon(true);
        thread.start();
        return server;
    }

    @Test
    public void theProbeSaysWhetherTheHubAnswersAndTakesTheToken() throws Exception {
        try (ServerSocket server = standInHub()) {
            String base = "http://127.0.0.1:" + server.getLocalPort() + "/";
            assertEquals("up", LocalHub.probe(base, "good", 2000));
            assertEquals("other", LocalHub.probe(base, "old", 2000));
        }
        assertEquals("down", LocalHub.probe("http://127.0.0.1:1/", "good", 500));
    }

    @Test
    public void termuxsAnswerSaysWhyTheRunEnded() {
        assertNull(LocalHub.failure(0, "▸ Orbis is already running on http://127.0.0.1:7420", ""));
        assertEquals("not-installed", LocalHub.failure(127, "bash: /data/data/com.termux/files/usr/bin/orbis-phone: No such file or directory", ""));
        assertEquals("not-installed", LocalHub.failure(1, "orbis-phone: Orbis is not installed on this phone: run bash orbis-termux.sh", ""));
        assertEquals("external-apps", LocalHub.failure(-1, "", "RUN_COMMAND requires allow-external-apps property to be set to true"));
        assertEquals("stopped", LocalHub.failure(143, "Error: listen EADDRINUSE", ""));
        assertEquals("…cdef", LocalHub.tail("  abcdef  ", 4));
        assertEquals("ab", LocalHub.tail("ab", 4));
        assertEquals("", LocalHub.tail(null, 4));
    }
}
