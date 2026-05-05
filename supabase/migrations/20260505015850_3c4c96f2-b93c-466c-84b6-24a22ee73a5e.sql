
INSERT INTO public.subscriptions (user_id, paddle_subscription_id, paddle_customer_id, product_id, price_id, status, current_period_end, environment)
VALUES ('56090598-a31e-4da2-bf5e-7419d55d4410', 'sub_qa_paid_live', 'ctm_qa_paid_live', 'dupli_pro', 'dupli_pro_yearly', 'active', now() + interval '365 days', 'live')
ON CONFLICT (paddle_subscription_id) DO UPDATE SET status='active', current_period_end = now() + interval '365 days';
