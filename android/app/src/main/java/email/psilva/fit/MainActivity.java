package email.psilva.fit;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /**
     * Swap in the shell's own WebViewClient.
     *
     * `Bridge.setWebViewClient` is the supported seam for this and it is the
     * only one: the stock client is constructed inside `Bridge`, and the
     * behavior being replaced -- navigating to the offline page on a
     * main-frame failure -- is not configurable. `super.onCreate` builds the
     * bridge, so the field is populated by the time this runs, and swapping the
     * client after a load has started is safe: the WebView consults the current
     * client on each callback.
     */
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        bridge.setWebViewClient(new ShellWebViewClient(bridge));
    }
}
