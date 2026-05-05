import { useCallback, useState } from "react";
import {
  StripeEmbeddedCheckout,
  type StripeEmbeddedCheckoutProps,
} from "@/components/stripe-embedded-checkout";

export function useStripeCheckout() {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<StripeEmbeddedCheckoutProps | null>(null);

  const openCheckout = useCallback((opts: StripeEmbeddedCheckoutProps) => {
    setOptions(opts);
    setIsOpen(true);
  }, []);

  const closeCheckout = useCallback(() => {
    setIsOpen(false);
    setOptions(null);
  }, []);

  const checkoutElement =
    isOpen && options ? <StripeEmbeddedCheckout {...options} /> : null;

  return { openCheckout, closeCheckout, isOpen, checkoutElement };
}
