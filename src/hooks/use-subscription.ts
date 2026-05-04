import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getPaddleEnvironment } from "@/lib/paddle";
import { useAuth } from "@/hooks/use-auth";

export type Subscription = {
  id: string;
  status: string;
  price_id: string;
  product_id: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  environment: string;
};

export function useSubscription() {
  const { user, loading: authLoading } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setSubscription(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const env = getPaddleEnvironment();

    const load = async () => {
      const { data } = await (supabase as any)
        .from("subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .eq("environment", env)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) {
        setSubscription((data as Subscription | null) ?? null);
        setLoading(false);
      }
    };

    load();

    const channel = supabase
      .channel(`subs-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "subscriptions",
          filter: `user_id=eq.${user.id}`,
        },
        () => load(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user, authLoading]);

  const isActive = (() => {
    if (!subscription) return false;
    const end = subscription.current_period_end
      ? new Date(subscription.current_period_end).getTime()
      : null;
    const future = end === null || end > Date.now();
    if (["active", "trialing", "past_due"].includes(subscription.status) && future) return true;
    if (subscription.status === "canceled" && end !== null && end > Date.now()) return true;
    return false;
  })();

  return { subscription, isActive, loading };
}
