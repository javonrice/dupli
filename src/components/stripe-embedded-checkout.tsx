import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
import { getStripe } from "@/lib/stripe";
import { getClientStripeEnv } from "@/lib/stripe-env";
import { createCheckoutSession } from "@/server/payments.functions";

export interface StripeEmbeddedCheckoutProps {
  priceId: string;
  customerEmail?: string;
  userId: string;
  returnUrl?: string;
}

export function StripeEmbeddedCheckout({
  priceId,
  customerEmail,
  userId,
  returnUrl,
}: StripeEmbeddedCheckoutProps) {
  const fetchClientSecret = async (): Promise<string> => {
    if (!userId) {
      throw new Error("Sign in required to start checkout");
    }
    const secret = await createCheckoutSession({
      data: {
        priceId,
        customerEmail,
        userId,
        returnUrl: returnUrl || `${window.location.origin}/checkout/success`,
        environment: getClientStripeEnv(),
      },
    });
    if (!secret) throw new Error("Failed to create checkout session");
    return secret;
  };

  return (
    <div id="checkout">
      <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
