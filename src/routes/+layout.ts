/**
 * There is no Node inside the WebView, so the Capacitor build ships as a plain
 * SPA. The web build keeps server rendering exactly as before: this is the only
 * place the two targets diverge, and `VITE_CAPACITOR` is what separates them.
 */
export const ssr = !import.meta.env.VITE_CAPACITOR;
export const prerender = false;
