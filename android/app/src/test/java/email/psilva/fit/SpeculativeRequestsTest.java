package email.psilva.fit;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.HashMap;
import java.util.Map;
import org.junit.Test;

/**
 * The regression test for issue #59.
 *
 * The 503 Cloudflare returned for its own refused prefetch was answered by
 * `BridgeWebViewClient` navigating the WebView to the offline page, because the
 * prefetch counts as a main-frame request. `ShellWebViewClient` asks this
 * question first; every case below is a header set the WebView actually hands
 * it.
 *
 * Runs on the JVM: `cd android && ./gradlew testDebugUnitTest`.
 */
public class SpeculativeRequestsTest {

    private static Map<String, String> headers(String... namesAndValues) {
        Map<String, String> headers = new HashMap<>();
        headers.put("Accept", "text/html");
        for (int index = 0; index < namesAndValues.length; index += 2) {
            headers.put(namesAndValues[index], namesAndValues[index + 1]);
        }
        return headers;
    }

    @Test
    public void speedBrainsPrefetchIsSpeculative() {
        // Exactly what the refused request in #59 carried; Cloudflare's 503 even
        // said `vary: sec-purpose`.
        assertTrue(SpeculativeRequests.isSpeculative(headers("Sec-Purpose", "prefetch")));
    }

    @Test
    public void anonymizedPrefetchIsSpeculative() {
        assertTrue(SpeculativeRequests.isSpeculative(headers("Sec-Purpose", "prefetch;anonymous-client-ip")));
    }

    @Test
    public void prerenderIsSpeculative() {
        assertTrue(SpeculativeRequests.isSpeculative(headers("Sec-Purpose", "prefetch;prerender")));
    }

    @Test
    public void theOlderPurposeHeaderIsSpeculative() {
        assertTrue(SpeculativeRequests.isSpeculative(headers("Purpose", "prefetch")));
    }

    @Test
    public void headerNamesAreMatchedWhateverTheirCase() {
        // `getRequestHeaders` returns names as they were sent, and nothing
        // promises which casing that is.
        assertTrue(SpeculativeRequests.isSpeculative(headers("sec-purpose", "PREFETCH")));
    }

    @Test
    public void aNavigationThePersonMadeIsNotSpeculative() {
        // The case that must keep the offline page: a real main-frame failure.
        assertFalse(SpeculativeRequests.isSpeculative(headers()));
    }

    @Test
    public void anUnrelatedPurposeValueIsNotSpeculative() {
        assertFalse(SpeculativeRequests.isSpeculative(headers("Sec-Purpose", "unrelated")));
    }

    @Test
    public void absentHeadersAreNotSpeculative() {
        // `getRequestHeaders` is documented to be able to return null.
        assertFalse(SpeculativeRequests.isSpeculative(null));
    }

    @Test
    public void aNullHeaderValueIsNotSpeculative() {
        Map<String, String> withNull = new HashMap<>();
        withNull.put("Sec-Purpose", null);
        assertFalse(SpeculativeRequests.isSpeculative(withNull));
    }
}
