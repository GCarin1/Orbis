// The hub's address as the user types it, made into what the app loads (plain Java, tested on the JVM).
package app.orbis.android;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

final class Hub {
    /** The hub's port when the address names none (orbis serve's default). */
    static final int DEFAULT_PORT = 7420;

    private Hub() {}

    /** What an address becomes: the hub to remember, the page to load (with its #token=...), or why not. */
    static final class Target {
        final String base;
        final String load;
        /** "empty", "scheme", "host" or "invalid"; null when the address is good. */
        final String error;

        private Target(String base, String load, String error) {
            this.base = base;
            this.load = load;
            this.error = error;
        }
    }

    private static Target error(String why) {
        return new Target(null, null, why);
    }

    /**
     * "192.168.0.10" → http://192.168.0.10:7420/; "http://pc.local:7420/#token=abc" keeps its port and hands
     * the token to the web app; an https address behind a proxy keeps its own port.
     */
    static Target parse(String address) {
        String text = address == null ? "" : address.trim();
        if (text.isEmpty()) return error("empty");
        boolean bare = !text.matches("(?i)^[a-z][a-z0-9+.-]*://.*");
        if (bare) text = "http://" + text;
        String scheme = text.substring(0, text.indexOf("://")).toLowerCase(Locale.ROOT);
        if (!scheme.equals("http") && !scheme.equals("https")) return error("scheme");
        String rest = text.substring(text.indexOf("://") + 3);
        if (rest.isEmpty() || "/?#".indexOf(rest.charAt(0)) >= 0) return error("host");
        URI uri;
        try {
            uri = new URI(text);
        } catch (URISyntaxException e) {
            return error("invalid");
        }
        String host = uri.getHost();
        if (host == null || host.isEmpty()) return error("host");
        int port = uri.getPort();
        if (port == -1 && bare) port = DEFAULT_PORT;
        String path = uri.getRawPath() == null || uri.getRawPath().isEmpty() ? "/" : uri.getRawPath();
        String base = scheme + "://" + host + (port == -1 ? "" : ":" + port) + path;
        String fragment = uri.getRawFragment();
        return new Target(base, fragment == null ? base : base + "#" + fragment, null);
    }

    /** scheme://host:port of a URL (the default port written out), or null for anything but http(s). */
    static String origin(String url) {
        if (url == null) return null;
        try {
            URI uri = new URI(url);
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            if (!scheme.equals("http") && !scheme.equals("https") || uri.getHost() == null) return null;
            int port = uri.getPort() != -1 ? uri.getPort() : scheme.equals("https") ? 443 : 80;
            return scheme + "://" + uri.getHost().toLowerCase(Locale.ROOT) + ":" + port;
        } catch (URISyntaxException e) {
            return null;
        }
    }

    /** A link to a hub that signs in (…#token=…) inside shared text, as the hub's launcher prints it; else null. */
    static Target signInLink(String text) {
        if (text == null) return null;
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("https?://\\S+#token=\\S+", java.util.regex.Pattern.CASE_INSENSITIVE).matcher(text);
        if (!m.find()) return null;
        Target t = parse(m.group());
        return t.error == null ? t : null;
    }

    /** The hubs to offer on the connect screen: this one first, then the others, at most `max`. */
    static java.util.List<String> recent(java.util.List<String> before, String hub, int max) {
        java.util.List<String> list = new java.util.ArrayList<>();
        list.add(hub);
        for (String h : before) if (!h.equals(hub) && list.size() < max) list.add(h);
        return list;
    }

    /** A file name safe for Downloads: no folders, no control characters, never empty. */
    static String safeFileName(String name) {
        String clean = name == null ? "" : name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]+", "-").trim();
        clean = clean.replaceAll("^[.-]+", "");
        return clean.isEmpty() ? "orbis.txt" : clean;
    }
}
