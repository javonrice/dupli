import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ProfileRow = {
  id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
};

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{
      profile: ProfileRow | null;
      counts: { scans: number; saved: number };
      error: string | null;
    }> => {
      const { supabase, userId } = context;
      const [profileRes, scansRes, savedRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("scans").select("id", { count: "exact", head: true }),
        supabase.from("saved_scans").select("id", { count: "exact", head: true }),
      ]);
      if (profileRes.error) {
        return {
          profile: null,
          counts: { scans: 0, saved: 0 },
          error: profileRes.error.message,
        };
      }
      return {
        profile: (profileRes.data ?? null) as ProfileRow | null,
        counts: {
          scans: scansRes.count ?? 0,
          saved: savedRes.count ?? 0,
        },
        error: null,
      };
    },
  );
