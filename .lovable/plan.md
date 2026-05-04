# Block non-beauty scans (e.g. orange juice)

Today the scanner accepts any image and asks the AI to find a beauty dupe. If you snap orange juice, a banana, or your laptop, the model still tries — it'll force a "beauty dupe" verdict on it. We want it to politely refuse anything outside our scope, while still accepting the full range of beauty AND personal care items.

## What counts as in-scope

Accept: skincare, makeup, haircare, fragrance, **body care (lotion, body wash, body butter, scrubs, deodorant)**, hand/foot care, oral care, nails, sun care, men's grooming, shaving, bath/shower products, baby personal care.

Reject: food, drinks (orange juice, soda, coffee), electronics, clothing, household cleaners, pets, screenshots, empty hands, etc.

## Approach

Two layers of defense, both in `src/server/scan.functions.ts`:

### 1. Tell the AI to gate the scan

Add `isBeautyProduct` (boolean) and `rejectionReason` (string) to the `analyze_dupe` tool schema. Add a Step 0 to the system prompt:

> Step 0: Confirm the image shows a real beauty OR personal-care product. In-scope examples: skincare, makeup, haircare, fragrance, body lotion, body wash, body butter, scrubs, deodorant, hand/foot cream, oral care, nails, sun care, men's grooming, shaving, bath products. Out of scope: food, drinks, electronics, clothing, household cleaners, pets, screenshots. If out of scope, set `isBeautyProduct: false`, write a one-sentence `rejectionReason` (e.g. "That looks like orange juice, not a beauty or personal-care product"), set `dupes: []`, `verdict: "No dupe found"`, and stop.

### 2. Enforce on the server

After parsing the tool call:
- If `isBeautyProduct === false`, return `{ result: null, error: rejectionReason || "That doesn't look like a beauty or personal-care product. Try lotion, makeup, skincare, etc." }` — skip the SkinSort merge, image lookups, and link resolution (saves latency + AI cost on bad scans).
- Belt-and-braces fallback: if the AI omits the flag but the detected `category` clearly isn't in scope (small denylist: food, beverage, drink, electronics, appliance, clothing, etc.), reject the same way.

### 3. UX

The existing `flow.error` already surfaces as a red banner in the Discovery Hub, and the scanner returns to idle. No UI changes needed.

## Files to edit

- `src/server/scan.functions.ts` — add Step 0 to the prompt, add `isBeautyProduct` + `rejectionReason` to the tool schema, short-circuit in the handler.

No DB or client changes.
