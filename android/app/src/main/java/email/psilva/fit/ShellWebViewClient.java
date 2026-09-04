package email.psilva.fit;

import android.util.Log;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

/**
 * The shell's WebViewClient: Capacitor's, minus the one behavior that lets a
 * request nobody made replace the running app.
 *
 * `BridgeWebViewClient` answers any main-frame failure by navigating the
 * WebView to `server.errorPath` -- the "we can't connect" page:
 *
 *     String errorPath = bridge.getErrorUrl();
 *     if (errorPath != null && request.isForMainFrame()) view.loadUrl(errorPath);
 *
 * A speculative prefetch is a main-frame request, so a prefetch the person
 * never asked for -- for a page the app had already rendered -- tore down the
 * app. Cloudflare Speed Brain made that constant by prefetching on pointerdown
 * and then refusing its own prefetch with a 503 (issue #59); before that it was
 * the intermittent cold-start failure in #54. Both callbacks are overridden
 * because either can carry it: a refused prefetch arrives as an HTTP status, a
 * prefetch to an unreachable host as a network error.
 *
 * Suppression here means doing nothing at all, which is what a browser does
 * with a failed speculation. It deliberately does not notify Capacitor's
 * `WebViewListener`s either: nothing the person did failed, so there is nothing
 * to report. (`Bridge.getWebViewListeners` is package-private in any case, so
 * `super` is the only way to reach them and it is inseparable from the
 * navigation.)
 *
 * Everything else keeps Capacitor's behavior. A real main-frame failure --
 * a cold start against a stopped server, an edge 502 during a deploy -- still
 * shows the offline page, because there the WebView has nothing else to show
 * and the page offers a retry.
 */
public class ShellWebViewClient extends BridgeWebViewClient {

    private static final String TAG = "FitShell";

    public ShellWebViewClient(Bridge bridge) {
        super(bridge);
    }

    @Override
    public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
        if (isIgnorable(request)) {
            return;
        }
        super.onReceivedError(view, request, error);
    }

    @Override
    public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
        if (isIgnorable(request)) {
            return;
        }
        super.onReceivedHttpError(view, request, errorResponse);
    }

    private static boolean isIgnorable(WebResourceRequest request) {
        if (request == null || !SpeculativeRequests.isSpeculative(request.getRequestHeaders())) {
            return false;
        }
        Log.i(TAG, "Ignoring a failed speculative request: " + request.getUrl());
        return true;
    }
}
