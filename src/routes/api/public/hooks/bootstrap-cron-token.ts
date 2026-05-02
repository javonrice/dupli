// One-shot endpoint: copies the worker env INGESTION_TOKEN into Postgres
// vault.secrets so pg_cron can read it for the Authorization header.
// Token-protected with the same secret. Idempotent — safe to call repeatedly.

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/hooks/bootstrap-cron-token")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.replace(/^Bearer\s+/i, "");
        const expected = process.env.INGESTION_TOKEN;
        if (!expected || token !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
          });
        }

        // Use a SQL function (created by migration) that wraps vault access.
        // Cast to any to avoid generated-types lag for this newly added RPC.
        const { data, error } = await (supabaseAdmin.rpc as any)(
          "set_ingestion_token_secret",
          { p_token: expected },
        );

        if (error) {
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }

        return new Response(
          JSON.stringify({ ok: true, secret_id: data }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
