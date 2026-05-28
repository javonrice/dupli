import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { DupePair } from "@/lib/dupe-types";

export type SavedVideo = {
  id: string;
  storage_path: string;
  thumbnail_url: string | null;
  caption: string | null;
  hashtags: string[];
  original_brand: string | null;
  original_name: string | null;
  dupe_brand: string | null;
  dupe_name: string | null;
  pair_count: number;
  duration_sec: number | null;
  created_at: string;
};

export const listMyVideos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SavedVideo[]> => {
    const { data, error } = await context.supabase
      .from("user_videos")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []) as SavedVideo[];
  });

export const saveVideoRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      storagePath: string;
      thumbnailUrl: string | null;
      pairs: DupePair[];
      durationSec: number;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { generateCaption } = await import("@/lib/captions.server");
    const { caption, hashtags } = await generateCaption(data.pairs);
    const top = data.pairs[0];
    const { data: row, error } = await context.supabase
      .from("user_videos")
      .insert({
        user_id: context.userId,
        storage_path: data.storagePath,
        thumbnail_url: data.thumbnailUrl,
        caption,
        hashtags,
        original_brand: top?.original.brand ?? null,
        original_name: top?.original.name ?? null,
        dupe_brand: top?.dupe.brand ?? null,
        dupe_name: top?.dupe.name ?? null,
        pair_count: data.pairs.length,
        duration_sec: data.durationSec,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as SavedVideo;
  });

export const deleteMyVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("user_videos")
      .select("storage_path")
      .eq("id", data.id)
      .single();
    if (row?.storage_path) {
      await context.supabase.storage.from("user-videos").remove([row.storage_path]);
    }
    const { error } = await context.supabase
      .from("user_videos")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getVideoSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { storagePath: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: signed, error } = await context.supabase.storage
      .from("user-videos")
      .createSignedUrl(data.storagePath, 60 * 60);
    if (error || !signed) throw new Error(error?.message ?? "Sign failed");
    return { url: signed.signedUrl };
  });
