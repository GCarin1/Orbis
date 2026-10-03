// Trading a pairing code for the hub's token (specs/android-app, POST /api/v1/pairing/claim): the code the
// web app on the computer shows, so the user never types the token on the phone.
package app.orbis.android;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

final class Pairing {
    /** The token, or why not: "code" (wrong, used or expired), "busy" (too many tries), "unreachable", "http". */
    static final class Result {
        final String token;
        final String error;

        Result(String token, String error) {
            this.token = token;
            this.error = error;
        }
    }

    private Pairing() {}

    /** Only the digits of what was typed ("483 219", "483-219"). */
    static String digits(String code) {
        return code == null ? "" : code.replaceAll("\\D", "");
    }

    static Result claim(String hubBase, String code) {
        HttpURLConnection http = null;
        try {
            http = (HttpURLConnection) new URL(hubBase + "api/v1/pairing/claim").openConnection();
            http.setConnectTimeout(8000);
            http.setReadTimeout(8000);
            http.setRequestMethod("POST");
            http.setDoOutput(true);
            http.setRequestProperty("content-type", "application/json");
            byte[] body = new JSONObject().put("code", digits(code)).toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream out = http.getOutputStream()) {
                out.write(body);
            }
            int status = http.getResponseCode();
            if (status == 200) {
                String token = new JSONObject(read(http.getInputStream())).optString("token", "");
                return token.isEmpty() ? new Result(null, "http") : new Result(token, null);
            }
            if (status == 401) return new Result(null, "code");
            if (status == 429) return new Result(null, "busy");
            return new Result(null, "http");
        } catch (IOException e) {
            return new Result(null, "unreachable");
        } catch (Exception e) {
            return new Result(null, "http");
        } finally {
            if (http != null) http.disconnect();
        }
    }

    private static String read(InputStream in) throws IOException {
        try (InputStream stream = in; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            for (int n; (n = stream.read(buffer)) > 0; ) out.write(buffer, 0, n);
            return out.toString("UTF-8");
        }
    }
}
