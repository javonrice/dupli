## Goal

Make Dupli feel indistinguishable from a hand-built iOS native app when installed to the home screen — proper safe areas, fixed (non-scrolling) screens where iOS would have them, SF Symbols-style iconography, iOS-native button/sheet/transition idioms, and a real PWA install path.

## What changes for the user

**Three "screens" instead of one long page**, each behaving like an iOS view controller:

```text
[ Home / Capture ]   →   [ Scanning ]   →   [ Results ]
   fixed, no scroll       fixed, no scroll      scrollable
   big shutter button     full-screen modal     standard list
```

- **Home**: full-viewport, no scroll. Centered viewfinder, large primary "shutter" button, ghost "Photo Library" button — exactly the layout pattern of Camera.app / Apple's Visual Look Up.
- **Scanning**: full-screen modal overlay with an animated ScanLine sweep over the captured photo (like iOS Visual Look Up's shimmer) — also non-scrolling.
- **Results**: scrollable (this is the only screen iOS would let scroll, like a Detail view). iOS-style large title ("Your Dupe"), back chevron in the top-left, sticky bottom action bar with "Shop on Google" as a primary pill.

All screens respect iOS safe areas (notch / Dynamic Island top, home indicator bottom).

## Technical changes

### 1. PWA install (manifest already shipped) + viewport-fit
- `index.html` / root `head`: add `viewport-fit=cover` to the existing viewport meta so safe-area insets resolve. Keep `apple-mobile-web-app-capable=yes` (already set).
- Manifest already ships `display: standalone` — no service worker, per the project's PWA guidance (avoids preview iframe issues).

### 2. Safe-area CSS tokens (`src/styles.css`)
- Add CSS variables wrapping `env(safe-area-inset-*)` with fallbacks, exposed as Tailwind-friendly utility classes:
  - `.pt-safe`, `.pb-safe`, `.pl-safe`, `.pr-safe`
  - `.min-h-screen-safe` → `min-height: 100dvh` (dynamic viewport, accounts for iOS URL bar)
  - `.h-screen-safe` → `height: 100dvh`
- Add `overscroll-behavior: none` and `touch-action: manipulation` on `body` to kill rubber-band scroll on the home/scanning screens.
- Add `-webkit-tap-highlight-color: transparent` globally.

### 3. Scanner state machine → 3 distinct screen components
Refactor `src/components/scanner.tsx`:
- Split into `<HomeScreen />`, `<ScanningScreen />` (fullscreen modal), `<ResultsScreen />`.
- Home + Scanning use `h-screen-safe` and `overflow-hidden` (no scroll).
- Results uses normal scrolling but with safe-area-aware sticky header and bottom CTA bar.
- Stage transitions get a 200ms iOS-flavored cross-fade + slight scale (matches push-from-right / modal-up feel without a router change).

### 4. iOS-style chrome
- **Header (`src/components/app-header.tsx`)**: shorter, true 44pt-equivalent height, `pt-safe`, hairline bottom border at 0.5px (`border-b-[0.5px]`), no shadow. The wordmark stays but smaller — iOS large-title pattern means the brand mark lives small in the nav bar and the "screen title" lives below.
- **New `<IOSScreen />` wrapper component** in `src/components/ios-screen.tsx`: provides the standard iOS view structure (large title, optional back button, content area, optional bottom toolbar) so screens stay consistent.

### 5. Icon swap to SF-Symbols-equivalent
Replace lucide icons with the closest SF-Symbols-equivalent lucide variants (lucide already ships SF-aligned shapes — we just pick the right ones and standardize stroke width):
- `Camera` → `Camera` at `strokeWidth={1.5}` (SF uses thinner strokes)
- `ImageUp` → `Images` (matches SF `photo.on.rectangle`)
- `X` → `X` at `strokeWidth={2}` in a tinted circle (matches iOS close button)
- `RotateCcw` → `RotateCw` (iOS uses clockwise refresh)
- `ScanLine` → keep, it maps to SF `viewfinder`
- `ChevronLeft` for back button (matches iOS `chevron.backward`)
- All icons standardized to `strokeWidth={1.75}` and slightly larger sizes, matching SF Symbol weight: Regular.
- The shutter button on Home becomes a large 72px circular button (iOS Camera shutter shape) with a thin outer ring.

### 6. iOS-style buttons
- Pill buttons get `active:scale-[0.97]` + `transition-transform duration-100` for the iOS press feedback.
- Replace `hover:` styles with `active:` on touch devices (hover doesn't apply on iOS).
- Sticky bottom action bar on Results screen uses backdrop-blur + `pb-safe` so it sits above the home indicator.

### 7. Results screen polish
- Sticky top bar: back chevron (returns to Home) + small "Dupli" wordmark, with a hairline border.
- Sticky bottom bar: "Shop on Google" primary pill (full-width, 50px tall, iOS button height) — moved out of the card and into the screen chrome where iOS would put a primary action.
- Card layout inside stays as-is (already looks editorial).

## Out of scope (intentionally)

- No service worker / offline support — Lovable PWA guidance explicitly warns against it in the preview iframe. Installable via manifest only.
- No native-feeling page transitions via a router (would require restructuring routes); stage cross-fades are sufficient.
- No haptics (`navigator.vibrate` is unreliable on iOS Safari and doesn't fire in standalone PWAs).
