CREATE OR REPLACE FUNCTION public.claim_subscriptions_by_customer_id(p_customer_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_count integer := 0;
BEGIN
  IF v_uid IS NULL OR p_customer_id IS NULL OR length(p_customer_id) = 0 THEN
    RETURN 0;
  END IF;
  WITH updated AS (
    UPDATE public.subscriptions
       SET user_id = v_uid, updated_at = now()
     WHERE user_id IS NULL
       AND paddle_customer_id = p_customer_id
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM updated;
  RETURN v_count;
END;
$$;