import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { createCheckoutSession } from "@/server/payments.functions";

export interface StripeEmbeddedCheckoutProps {
  priceId: string;
  customerEmail?: string;
  userId?: string;
  returnUrl?: string;
}

export function StripeEmbeddedCheckout({
  priceId,
  customerEmail,
  userId,
  returnUrl,
}: StripeEmbeddedCheckoutProps) {
  const fetchClientSecret = async (): Promise<string> => {
    const secret = await createCheckoutSession({
      data: {
        priceId,
        customerEmail,
        userId,
        returnUrl: returnUrl || `${window.location.origin}/checkout/success`,
        environment: getStripeEnvironment(),
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
