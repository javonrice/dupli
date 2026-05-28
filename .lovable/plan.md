## Plan

1. **Fix pair selection so it excludes recent generations**
   - Update `pickRandomDupePairs` to read `dashboard_generations` from the recent window before picking.
   - Remove any candidate whose `original_product_id + dupe_product_id` was already generated recently.
   - Only fall back to older/recent pairs if there truly are not enough fresh usable pairs.

2. **Improve randomness beyond the current top-500 ceiling**
   - The current query orders by best match and limits to 500, which can keep pulling from the same high-score pool.
   - Change selection to sample from a wider eligible pool so every click can access more of the dupe database while still requiring usable images, prices, positive savings, and a solid match score.

3. **Prevent duplicates inside the same 4-pair reel**
   - Keep enforcing four distinct dupe pairs.
   - Avoid reusing the same original product in a single video when possible, so the reel feels varied.

4. **Make generation tracking reliable**
   - Record the selected four pairs after picking.
   - If the recent-tracking insert fails, surface a clear error instead of silently allowing repeats.

5. **Verify the fix**
   - Query the database to confirm there are enough usable fresh combinations.
   - Run the pair picker multiple times and confirm each generated batch returns four different pairs from the previous batch.