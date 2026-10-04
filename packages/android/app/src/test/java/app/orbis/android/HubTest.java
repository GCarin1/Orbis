// specs/android-app — the hub's address as typed, and the files the app saves.
package app.orbis.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class HubTest {
    @Test
    public void theAppStaysConnectedInTheBackgroundUntilTheUserTurnsItOff() {
        // Off, Android freezes the app within minutes and the bots' notifications stop coming.
        assertTrue(Hub.KEEP_CONNECTED_DEFAULT);
    }

    @Test
    public void aBareAddressIsTheHubOnItsDefaultPort() {
        Hub.Target t = Hub.parse("  192.168.0.10 ");
        assertNull(t.error);
        assertEquals("http://192.168.0.10:7420/", t.base);
        assertEquals("http://192.168.0.10:7420/", t.load);
    }

    @Test
    public void aFullAddressKeepsItsPortAndHandsTheTokenToTheWebApp() {
        Hub.Target t = Hub.parse("http://pc.local:8080/#token=abc123");
        assertEquals("http://pc.local:8080/", t.base);
        assertEquals("http://pc.local:8080/#token=abc123", t.load);
        Hub.Target https = Hub.parse("https://orbis.example.com");
        assertEquals("https://orbis.example.com/", https.base);
    }

    @Test
    public void notAnAddressSaysWhy() {
        assertEquals("empty", Hub.parse("   ").error);
        assertEquals("scheme", Hub.parse("ftp://pc.local").error);
        assertEquals("host", Hub.parse("http://").error);
        assertEquals("invalid", Hub.parse("http://pc local").error);
    }

    @Test
    public void theOriginWritesTheDefaultPortOut() {
        assertEquals("http://pc.local:80", Hub.origin("http://PC.local/a?b"));
        assertEquals("https://x.example.com:443", Hub.origin("https://x.example.com/"));
        assertEquals("http://192.168.0.10:7420", Hub.origin("http://192.168.0.10:7420/#token=t"));
        assertNull(Hub.origin("file:///android_asset/connect.html"));
        assertNull(Hub.origin("mailto:a@example.com"));
    }

    @Test
    public void savedFilesHaveSafeNames() {
        assertEquals("Time-de-lançamento.txt", Hub.safeFileName("Time-de-lançamento.txt"));
        assertEquals("a-b.txt", Hub.safeFileName("../a/b.txt"));
        assertEquals("orbis.txt", Hub.safeFileName("   "));
        assertEquals("ana.orbis.yaml", Hub.safeFileName("ana.orbis.yaml"));
    }

    @Test
    public void aSharedSignInLinkConnects() {
        Hub.Target t = Hub.signInLink("No celular, digite:\n  http://192.168.0.10:7420/#token=abc%20def\nobrigado");
        assertEquals("http://192.168.0.10:7420/", t.base);
        assertEquals("http://192.168.0.10:7420/#token=abc%20def", t.load);
        assertNull(Hub.signInLink("veja https://example.com/artigo"));
        assertNull(Hub.signInLink(null));
    }

    @Test
    public void theComputersQrCodeIsTheHubAndAPairingCode() {
        String link = "http://192.168.0.10:7420/#pair=483219";
        assertEquals("483219", Hub.pairCode(link));
        assertEquals("483219", Hub.pairCode("https://orbis.example.com/#x=1&pair=483219"));
        assertNull(Hub.pairCode("http://192.168.0.10:7420/#pair=4832"));
        assertNull(Hub.pairCode("http://192.168.0.10:7420/?pair=483219"));
        assertNull(Hub.pairCode(null));
        Hub.Target t = Hub.pairLink("Abra no celular: " + link);
        assertEquals("http://192.168.0.10:7420/", t.base);
        assertEquals("483219", Hub.pairCode(t.load));
        assertNull(Hub.pairLink("http://192.168.0.10:7420/#token=abc"));
        assertNull(Hub.pairLink("ftp://pc/#pair=483219"));
    }

    @Test
    public void recentHubsPutTheLastFirstWithoutRepeats() {
        java.util.List<String> before = java.util.Arrays.asList("http://a:7420/", "http://b:7420/", "http://c:7420/");
        assertEquals(java.util.Arrays.asList("http://b:7420/", "http://a:7420/", "http://c:7420/"), Hub.recent(before, "http://b:7420/", 5));
        assertEquals(java.util.Arrays.asList("http://d:7420/", "http://a:7420/"), Hub.recent(before, "http://d:7420/", 2));
    }

    @Test
    public void aPairingCodeIsItsDigits() {
        assertEquals("483219", Pairing.digits(" 483 219 "));
        assertEquals("483219", Pairing.digits("483-219"));
        assertEquals("", Pairing.digits(null));
    }
}
