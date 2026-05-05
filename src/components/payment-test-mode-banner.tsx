import { useEffect, useState } from "react";

const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;

export function PaymentTestModeBanner() {
  // Render only after mount to avoid SSR/CSR text-node hydration mismatches
  // (the banner text is otherwise stable but its whitespace splits differ
  // between the server HTML and the client tree).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  if (!clientToken?.startsWith("pk_test_")) return null;
  return (
    <div className="w-full bg-orange-100 border-b border-orange-300 px-4 py-2 text-center text-xs text-orange-800">
      Test mode — use card 4242 4242 4242 4242. No real charges.{" "}
      <a
        href="https://docs.lovable.dev/features/payments#test-and-live-environments"
        target="_blank"
        rel="noopener noreferrer"
        className="underline font-medium"
      >
        Learn more
      </a>
    </div>
  );
}
