// specs/android-app — the hub's address as typed, and the files the app saves.
package app.orbis.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

public class HubTest {
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
}
