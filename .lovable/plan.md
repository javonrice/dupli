# iOS in-app webview: swap Google for Apple Sign In

Google OAuth fails in BuildNatively's WKWebView with `disallowed_useragent`. Apple Sign In works inside WKWebView, so on iOS in-app browsers we hide the Google button and show "Continue with Apple" instead. Email/password stays available everywhere as a fallback.

## Detection

Add a small helper in `src/routes/login.tsx`:

```ts
const isIOSWebView = () => {
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  if (!isIOS) return false;
  // Real Safari includes "Safari/"; WKWebView wrappers (BuildNatively,
  // Capacitor, etc.) do not. Chrome/Firefox/Edge on iOS use CriOS/FxiOS/EdgiOS.
  const isSafari = /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return !isSafari;
};
```

Compute once at render time.

## UI changes in `src/routes/login.tsx`

- Generalize `handleGoogle` → `handleOAuth(provider: "google" | "apple")`.
- In the social button slot:
  - If `isIOSWebView` → render **Continue with Apple** (black button, Apple logo).
  - Otherwise → render **Continue with Google** (existing button).
- Email/password form is unchanged and remains the universal fallback.
- Add a small Apple logo SVG component next to the existing Google glyph.

## Backend

- Apple Sign In is enabled in Lovable Cloud via `configure_social_auth(["apple"])`. Managed credentials work out of the box — no Apple Developer setup needed.
- Google stays enabled (web users keep using it).

## Files to edit

- `src/routes/login.tsx` — detection helper, generalized handler, conditional button, Apple SVG.

## Backend tool to run

- `configure_social_auth` with `providers: ["apple"]` (keeps Google + email enabled).

No DB or routing changes.
