
ALTER TABLE public.subscriptions ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS customer_email text;
CREATE INDEX IF NOT EXISTS idx_subscriptions_customer_email ON public.subscriptions (lower(customer_email));
CREATE INDEX IF NOT EXISTS idx_subscriptions_paddle_customer_id ON public.subscriptions (paddle_customer_id);

-- Claim any unclaimed subscriptions whose customer_email matches the caller's auth email.
CREATE OR REPLACE FUNCTION public.claim_subscriptions_for_current_user()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_count integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 0;
  END IF;
  SELECT lower(email) INTO v_email FROM auth.users WHERE id = v_uid;
  IF v_email IS NULL THEN
    RETURN 0;
  END IF;
  WITH updated AS (
    UPDATE public.subscriptions
       SET user_id = v_uid, updated_at = now()
     WHERE user_id IS NULL
       AND lower(customer_email) = v_email
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM updated;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_subscriptions_for_current_user() FROM public;
GRANT EXECUTE ON FUNCTION public.claim_subscriptions_for_current_user() TO authenticated;
