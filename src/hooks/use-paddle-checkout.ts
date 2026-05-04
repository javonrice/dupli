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

      // (eventCallback for checkout.completed is registered in initializePaddle.)


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
