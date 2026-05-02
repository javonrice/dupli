// Patches global fetch (browser-only) so requests to TanStack Start server
// functions automatically include the current Supabase access token. This is
// required for any createServerFn that uses requireSupabaseAuth middleware.
import { supabase } from "./client";

let installed = false;

export function installSupabaseFetchAuth() {
  if (installed) return;
  if (typeof window === "undefined") return;
  installed = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      // Only attach for same-origin server-function calls.
      const isServerFn =
        url.startsWith("/_serverFn") ||
        url.includes("/_serverFn/") ||
        url.startsWith(window.location.origin + "/_serverFn");

      if (!isServerFn) return originalFetch(input, init);

      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return originalFetch(input, init);

      const headers = new Headers(
        init?.headers ??
          (input instanceof Request ? input.headers : undefined),
      );
      if (!headers.has("authorization")) {
        headers.set("authorization", `Bearer ${token}`);
      }
      return originalFetch(input, { ...init, headers });
    } catch {
      return originalFetch(input, init);
    }
  };
}
