# Screen color picker

The page uses the browser-owned EyeDropper API only. It feature-detects both the constructor and secure context, calls `open({ signal })` directly in the user's click handler, and accepts only a six-digit sRGB hex result. There is no screenshot/media-stream fallback, background sampling, screen coordinate collection, or automatic persistence.

Esc, the Cancel button, a 30-second deadline and navigation abort the operation. Repeated starts are blocked while the previous request is pending; canceled/late results are ignored. Starting again clears the previous value. Copying is an independent explicit action with stale-feedback protection.

The native browser picker owns screen coordinates, negative monitor origins, DPI scaling and its visible selection UI. The app does not multiply CSS coordinates by devicePixelRatio. This delegates coordinate correctness to the runtime; it is not a claim that mixed-DPI/multi-monitor WebView2 behavior has been tested. Unsupported runtimes explicitly show unavailability. The color is sRGB, not alpha, HDR data or a calibrated physical display measurement.

Reference: [Chrome's EyeDropper API documentation](https://developer.chrome.com/docs/capabilities/web-apis/eyedropper) explains user activation, single-pixel selection, cancellation and the sRGBHex result. The [API specification](https://wicg.github.io/eyedropper-api/) defines AbortSignal and security restrictions.

`scripts/check-screen-color.cjs` uses mocks for supported/unsupported and insecure environments, synchronous exceptions, repeated starts, normal selection, cancellation, timeout, invalid results, denial and navigation. No actual screen pixels were sampled. Native UI, Windows WebView2 support, clipboard and multi-monitor/DPI acceptance remain unverified; the local cloud browser route is blocked and was not bypassed.
