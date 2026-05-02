## Problem

The vendor backfill is **completely stalled**. Out of 46,689 dupe products, only **100 have vendor prices** — the queue has 46,589 vendor jobs sitting in `pending` and hasn't moved in ~25 minutes.

Root cause confirmed in worker logs: the pg_cron job has been firing every minute but every single call returns **401 Unauthorized**.

```
[19:13:01] POST .../run-ingestion → 401
[19:12:00] POST .../run-ingestion → 401
[19:11:00] POST .../run-ingestion → 401
... (every minute since the cron was set up)
```

The cron SQL reads the auth token from Postgres `vault.secrets`:
```sql
'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'INGESTION_TOKEN')
```

But `INGESTION_TOKEN` only exists as a Worker env secret — there's no row in the vault with that name. The subselect returns NULL, the header becomes the literal string `"Bearer "`, and the endpoint correctly rejects it. Every cron tick has been a no-op.

So the parser fix and the inline-concurrency drain code are both fine — they've just never been allowed to run.

## Fix (3 small steps)

### 1. Put the ingestion token into the Postgres vault

Migration that inserts/updates the same token value (read at migration time from the worker env via a one-time hardcoded value isn't ideal — instead we'll have you provide it once). Approach:

- Migration creates the vault entry from a parameter we pass in, OR
- Simpler: change the cron to call a new SECURITY DEFINER function that uses a token stored in a regular `app_config` table (single-row, RLS-locked, no anon access).

Cleanest option: store the token in `vault.secrets` via `vault.create_secret('<token>', 'INGESTION_TOKEN')`. We'll do this in a migration where the literal token value is the existing `INGESTION_TOKEN` value — we'll pull it from the Worker env on first call. To avoid asking the user, the migration will:

a. Create the vault entry only if missing (so it's idempotent / safe to re-run).
b. Use a one-shot bootstrap server endpoint `/api/public/hooks/bootstrap-cron-token` (token-protected by the same Worker env `INGESTION_TOKEN`) that, when called, writes the token into the vault using `supabaseAdmin`. We invoke it once after deploy, then it's done.

This avoids hardcoding the secret into a SQL migration file.

### 2. Make the cron simpler & more aggressive

Once the vault entry exists the existing cron command will work, but I'll also:
- Bump `batch` from 30 → **100** per cron tick.
- Add a second cron entry that fires the same drain (same minute) so we get **multiple parallel drains per minute** even before the self-cascade kicks in.
- Self-cascade inside the worker remains as-is and will now actually fire (it uses the env token directly, not the vault).

### 3. Manually kick the cascade once

After (1) and (2), call `/api/public/hooks/run-ingestion` once with the correct bearer to start the cascade immediately rather than waiting for the next minute boundary.

## Expected throughput after the fix

- 100 vendor jobs per drain × 20 concurrency = ~5s per drain (Skinsort fetch + 1 upsert each)
- Self-cascade keeps drains running back-to-back as long as the queue has work
- 46,589 jobs ÷ ~20 jobs/sec sustained ≈ **~40 minutes** to fully drain
- pg_cron fires every minute as a safety net in case any cascade dies

## Files to change

- `supabase/migrations/<new>.sql` — update the cron job to use batch=100 (and add a second twin job for parallelism). Vault bootstrap stays out of SQL.
- `src/routes/api/public/hooks/bootstrap-cron-token.ts` — new one-shot endpoint that copies the env `INGESTION_TOKEN` into `vault.secrets`. Token-protected with the same secret.
- After deploy: invoke bootstrap once, then invoke `run-ingestion` once to start the cascade.

## Verification

- Worker logs go from `→ 401` to `→ 200` on cron ticks
- `SELECT count(*) FROM ingestion_queue WHERE status='done' AND mode='vendors'` climbs every few seconds
- `SELECT count(*) FROM products WHERE lowest_price_usd IS NOT NULL` climbs in lockstep
- Done when `pending` count for `mode='vendors'` hits 0
