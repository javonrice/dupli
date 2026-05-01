## Problem

The dupe image isn't showing up. Server logs from the last hour show no calls to `findProductImage`, and even if it did run, scraping `google.com/search?tbm=isch` from a server is unreliable — Google serves a consent interstitial / heavily obfuscated HTML to non-browser clients, so the regex finds nothing and we silently return `undefined`.

## Fix

Replace the Google Images scrape with **DuckDuckGo's image search**, which has a lightweight JSON endpoint (`duckduckgo.com/i.js`) that's well-suited to server-side calls and doesn't need an API key.

Two-step lookup:
1. `GET https://duckduckgo.com/?q=<query>&iax=images&ia=images` to grab the required `vqd` token from the HTML.
2. `GET https://duckduckgo.com/i.js?q=<query>&vqd=<token>&o=json` to get a JSON list of image results — pick the first `image` URL.

Also add `console.log` lines so we can see in server logs exactly what's happening (lookup query, token success, found URL, or which step failed).

## Changes

**`src/server/scan.functions.ts`** — rewrite `findProductImage`:
- Build query as `${brand} ${productName}`.
- Fetch the DDG HTML page with a desktop User-Agent to extract the `vqd` token via regex.
- Call the DDG image JSON endpoint with that token + `Referer: https://duckduckgo.com/`.
- Return the first result's `image` URL (or `undefined` on any failure).
- Add `console.log` / `console.warn` at each step for debuggability.

No frontend changes required — the dupe card already handles `imageUrl` and gracefully hides on load error.

## Fallback if DDG also fails

If logs show DDG getting blocked too, the next move is wiring up the **Firecrawl connector** (already documented in our context) and using its `search` API with `scrapeOptions`, which handles bot protection for us. I'll only add that if the simpler DDG approach doesn't work.
