ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dupe_style text,
  ADD COLUMN IF NOT EXISTS projected_annual_savings integer,
  ADD COLUMN IF NOT EXISTS free_scans_used integer NOT NULL DEFAULT 0;

-- Backfill existing users so they don't get locked out of the app
UPDATE public.profiles
  SET onboarding_completed = true
  WHERE onboarding_completed = false;