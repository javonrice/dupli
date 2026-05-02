// Server functions for persisting + reading scans and saved scans.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database, Json } from "@/integrations/supabase/types";
import type { DupeAnalysis } from "@/server/scan.functions";

type ScanInsert = Database["public"]["Tables"]["scans"]["Insert"];

const SaveScanInput = z.object({
  analysis: z.unknown(),
  thumbnailDataUrl: z.string().nullable().optional(),
});

export type ScanRow = {
  id: string;
  user_id: string;
  original_brand: string;
  original_product_name: string;
  original_image_url: string | null;
  dupe_brand: string | null;
  dupe_product_name: string | null;
  dupe_image_url: string | null;
  match_score: number | null;
  verdict: string | null;
  thumbnail_data_url: string | null;
  analysis: DupeAnalysis;
  created_at: string;
};

export const saveScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => SaveScanInput.parse(data))
  .handler(async ({ data, context }): Promise<{ id: string | null; error: string | null }> => {
    const { supabase, userId } = context;
    const a = data.analysis as DupeAnalysis;
    if (!a?.original?.brand) {
      return { id: null, error: "Invalid analysis payload" };
    }

    const insertRow: ScanInsert = {
      user_id: userId,
      original_brand: a.original.brand,
      original_product_name: a.original.productName,
      original_image_url: a.original.imageUrl ?? null,
      dupe_brand: a.dupe?.brand ?? null,
      dupe_product_name: a.dupe?.productName ?? null,
      dupe_image_url: a.dupe?.imageUrl ?? null,
      match_score: a.matchScore ?? null,
      verdict: a.verdict ?? null,
      thumbnail_data_url: data.thumbnailDataUrl ?? null,
      analysis: a as unknown as Json,
    };

    const { data: row, error } = await supabase
      .from("scans")
      .insert(insertRow)
      .select("id")
      .single();

    if (error) {
      console.error("saveScan failed", error);
      return { id: null, error: error.message };
    }
    return { id: row.id, error: null };
  });

export const listScans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ scans: ScanRow[]; error: string | null }> => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("scans")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      return { scans: [], error: error.message };
    }
    return { scans: (data ?? []) as ScanRow[], error: null };
  });

export const deleteScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; error: string | null }> => {
    const { supabase } = context;
    const { error } = await supabase.from("scans").delete().eq("id", data.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, error: null };
  });

export const setSaved = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ scanId: z.string().uuid(), saved: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; error: string | null }> => {
    const { supabase, userId } = context;
    if (data.saved) {
      const { error } = await supabase
        .from("saved_scans")
        .upsert(
          { user_id: userId, scan_id: data.scanId },
          { onConflict: "user_id,scan_id", ignoreDuplicates: true },
        );
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await supabase
        .from("saved_scans")
        .delete()
        .eq("scan_id", data.scanId);
      if (error) return { ok: false, error: error.message };
    }
    return { ok: true, error: null };
  });

export const listSaved = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{ scans: ScanRow[]; savedIds: string[]; error: string | null }> => {
      const { supabase } = context;
      const { data, error } = await supabase
        .from("saved_scans")
        .select("scan_id, created_at, scans!inner(*)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) {
        return { scans: [], savedIds: [], error: error.message };
      }
      const scans = (data ?? [])
        .map((r) => (r as unknown as { scans: ScanRow }).scans)
        .filter(Boolean);
      return {
        scans,
        savedIds: scans.map((s) => s.id),
        error: null,
      };
    },
  );

export const listSavedIds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ids: string[]; error: string | null }> => {
    const { supabase } = context;
    const { data, error } = await supabase.from("saved_scans").select("scan_id");
    if (error) return { ids: [], error: error.message };
    return { ids: (data ?? []).map((r) => r.scan_id as string), error: null };
  });
