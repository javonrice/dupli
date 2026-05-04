import { useState } from "react";
import { initializePaddle, getPaddlePriceId } from "@/lib/paddle";

type CheckoutOptions = {
  priceId: string;
  customerEmail?: string;
  customData?: Record<string, string>;
  discountId?: string | null;
  successUrl?: string;
};

export function usePaddleCheckout() {
  const [loading, setLoading] = useState(false);

  const openCheckout = async (options: CheckoutOptions) => {
    setLoading(true);
    try {
      await initializePaddle();
      const paddlePriceId = await getPaddlePriceId(options.priceId);

      // Capture the Paddle customer id once checkout completes so anonymous
      // users can claim their subscription after creating an account, even
      // when Paddle returns an anonymized email (Apple Hide My Email, etc).
      try {
        window.Paddle.Update?.({
          eventCallback: (evt: any) => {
            if (evt?.name === "checkout.completed") {
              const cid = evt?.data?.customer?.id;
              const cemail = evt?.data?.customer?.email;
              if (cid) {
                try {
                  localStorage.setItem("dupli.paddle.customer_id", cid);
                } catch {}
              }
              if (cemail) {
                try {
                  localStorage.setItem("dupli.paddle.customer_email", cemail);
                } catch {}
              }
            }
          },
        });
      } catch {
        /* ignore — eventCallback is best-effort */
      }

      window.Paddle.Checkout.open({
        items: [{ priceId: paddlePriceId, quantity: 1 }],
        customer: options.customerEmail ? { email: options.customerEmail } : undefined,
        customData: options.customData,
        discountId: options.discountId ?? undefined,
        settings: {
          displayMode: "overlay",
          successUrl:
            options.successUrl || `${window.location.origin}/app?checkout=success`,
          allowLogout: false,
          variant: "one-page",
        },
      });
    } finally {
      setLoading(false);
    }
  };

  return { openCheckout, loading };
}
