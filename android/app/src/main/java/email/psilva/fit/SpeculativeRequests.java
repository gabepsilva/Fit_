package email.psilva.fit;

import java.util.Locale;
import java.util.Map;

/**
 * Whether a WebView request was made by the browser on its own rather than by
 * the person using the app.
 *
 * Chromium may prefetch a page it thinks will be opened next -- Cloudflare's
 * Speed Brain injects a speculation ruleset that does exactly this, at
 * `conservative` eagerness, so it fires on every pointerdown. Such a request
 * carries `Sec-Purpose: prefetch` (`Purpose: prefetch` from the older
 * `<link rel=prefetch>` path), and it is classified as a main-frame request
 * because it speculates a navigation.
 *
 * That classification is the whole problem this answers: a failure on one of
 * these is not a failure of anything the person asked for, and a browser
 * discards it silently. Only a native shell that reacts to main-frame failures
 * is hurt by it. See issue #59.
 *
 * The header names are matched case-insensitively because
 * `WebResourceRequest.getRequestHeaders` returns them as they were sent, and
 * the values with `contains` because they are lists: a prerender arrives as
 * `prefetch;prerender`, and an anonymized prefetch as
 * `prefetch;anonymous-client-ip`.
 */
public final class SpeculativeRequests {

    private SpeculativeRequests() {}

    private static final String SEC_PURPOSE = "sec-purpose";
    private static final String PURPOSE = "purpose";

    public static boolean isSpeculative(Map<String, String> requestHeaders) {
        if (requestHeaders == null) {
            return false;
        }

        for (Map.Entry<String, String> header : requestHeaders.entrySet()) {
            String name = header.getKey();
            String value = header.getValue();
            if (name == null || value == null) {
                continue;
            }

            name = name.toLowerCase(Locale.ROOT);
            if (!SEC_PURPOSE.equals(name) && !PURPOSE.equals(name)) {
                continue;
            }

            value = value.toLowerCase(Locale.ROOT);
            if (value.contains("prefetch") || value.contains("prerender")) {
                return true;
            }
        }

        return false;
    }
}
