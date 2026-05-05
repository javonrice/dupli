# Mobile audit — fix clipping & overflow on small phones

## Audit method

Walked every screen at 390×843 (target) and 320×568 (iPhone SE worst case), and read source for every route in `src/routes/` and `src/routes/_app/`. The previous polish pass already fixed onboarding fit at 390. New issues only show at 320×568 and on tight bottom-bar layouts.

## What's already fine

Auth, paywall (X removed), home/Discovery, History, Saved, Profile, scan-detail, product-detail, community-detail, tab bar — all use `IOSScreen` / `OnboardingShell` correctly with safe-area insets, `pb-tabbar`/`TabBarSpacer`, sticky toolbars, and `truncate` on text. No clipping at 390×843. No changes needed.

## Issues to fix

### 1. Welcome screen clips on iPhone SE (320×568)

Confirmed with a screenshot: the rating row ("4.8 · 12,000+ shoppers") gets covered by the fixed CTA. The hero `h-[52vh]` (≈295px) + wordmark + h1 + body + stars is too tall.

`src/routes/onboarding.index.tsx`:
- Hero container `h-[52vh] min-h-[320px]` → `h-[44vh] min-h-[240px] max-h-[440px]`. Adding `max-h` prevents the hero from over-growing on tall phones too.
- h1 `text-[26px]` → `text-[24px] sm:text-[26px]`, `mt-4` → `mt-3 sm:mt-4`.
- subhead `mt-2` stays, but tighten via `text-[13.5px] sm:text-[14px]`.
- stars row `mt-5` → `mt-4 sm:mt-5`.

### 2. Landing page header crowds at narrow widths

`src/routes/landing.tsx` header: wordmark + Privacy + Terms + "Sign in" pill all on one row at `px-6`. At 320px the Sign in pill collides with the nav links. Fix: hide the inline Privacy/Terms links at `<sm` (`hidden sm:flex` on the nav text links wrapper, keep the Sign in CTA always visible). Hero `text-5xl` → `text-4xl sm:text-5xl md:text-6xl` so the headline doesn't visually overwhelm a 320px screen.

### 3. ResultsScreen bottom bar can overflow with long merchant names

`src/components/scanner.tsx` lines 132–190: bottom toolbar contains a "Share this dupe" pill (shrink-0) + a "Buy at {merchant} · ${price}" link (flex-1). On narrow viewports + long merchant names ("Sephora Collection · $24.99") the inner text wraps to two lines and the 50px-tall button shows clipped baselines.

Fix: wrap the inner text content in a `min-w-0` flex container with `truncate`, and keep `shrink-0` only on the icons. Concretely change the inner `<span className="flex items-center gap-1.5">` to `<span className="flex min-w-0 items-center gap-1.5 truncate">` and the surrounding `<a>` to add `min-w-0`. Same treatment for the fallback `Shop at {label}` branch.

### 4. Sticky-bottom safety on `min-h-screen-safe` lists

`History`, `Saved`, `Profile` use `flex min-h-screen-safe flex-col` with a `<TabBarSpacer />` below the scroll content. That works as long as the page actually scrolls. Verified on read: the spacer is rendered as a sibling of `flex-1`, so on short content the spacer sits at the natural bottom — no clipping. No change.

## Files changed

- `src/routes/onboarding.index.tsx` — welcome hero responsive heights and type sizes
- `src/routes/landing.tsx` — collapse header nav on narrow viewports, smaller hero text on `<sm`
- `src/components/scanner.tsx` — `min-w-0` + `truncate` on bottom-bar Buy/Shop button text

No new dependencies. No backend/DB changes. No design-token changes. ~10 lines of CSS class adjustments total.
