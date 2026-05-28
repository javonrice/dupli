## Updated plan

You’re right: if SkinSort marked it as a dupe, we should treat it as usable inventory instead of gating everything behind 70%+ match.

## What I found

- Current strict filters only leave **5 usable cached pairs**, which is why you keep seeing the same products.
- Without the 70% match filter, SkinSort has **109,264 dupe pairs**.
- If we allow normal product images when cached images are missing, there are **4,944 priced cheaper dupe pairs** and about **4,901 fresh product-level options** after excluding recently used products.

## Implementation plan

1. **Use all SkinSort dupes, not just 70%+**
   - Remove the `.gte("overall_match", 70)` restriction from the UGC reel picker.
   - Treat missing/low match scores as acceptable because SkinSort already classified the relationship as a dupe.

2. **Avoid products we’ve already touched**
   - Exclude recently used `original_product_id` and `dupe_product_id`, not just exact pair combinations.
   - This means every click should select four products that haven’t appeared recently.

3. **Use more of the product catalog**
   - Prefer `cached_image_url`, but fall back to `image_url` if needed.
   - Keep price checks and positive savings for the reel, because the voiceover needs a real “save $X” claim.

4. **Remove the repeat-prone fallback**
   - Don’t fall back to the same recent products unless there are genuinely fewer than four eligible fresh products.
   - If inventory is somehow exhausted, show a clear error explaining that fresh usable inventory is low.

5. **Fix the script JSON error**
   - Make `writeScript()` resilient to bad AI formatting.
   - Add a deterministic fallback script so the reel can still generate even if the AI returns non-JSON text.

## Files to update

- `src/lib/dashboard.functions.ts`
- `src/lib/reel-voiceover.server.ts`
- Possibly `src/components/dashboard/ugc-generator.tsx` only if we need a clearer user-facing error message