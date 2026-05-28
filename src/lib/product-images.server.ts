import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BUCKET = "product-images";

const BROWSER_HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
  Referer: "https://www.skinsort.com/",
};

function extFromContentType(ct: string | null): string {
  if (!ct) return "jpg";
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif")) return "gif";
  if (ct.includes("avif")) return "avif";
  return "jpg";
}

/**
 * Ensures the given product's image is cached in our own storage bucket.
 * - If `cached_image_url` is already set on the row, returns it.
 * - Otherwise fetches the source image (with browser-like headers to get
 *   past CDNs that 403 generic clients), uploads to our bucket, stores the
 *   public URL on the product row, and returns it.
 *
 * Idempotent and safe to call from any server flow.
 */
export async function ensureCachedProductImage(
  productId: string,
): Promise<string> {
  const { data: product, error } = await supabaseAdmin
    .from("products")
    .select("id, brand_slug, product_slug, image_url, cached_image_url")
    .eq("id", productId)
    .single();

  if (error) {
    throw new Error(`ensureCachedProductImage: ${error.message}`);
  }
  if (product.cached_image_url) return product.cached_image_url;
  if (!product.image_url) {
    throw new Error(`Product ${productId} has no image_url to cache`);
  }

  async function tryFetch(url: string) {
    try {
      const r = await fetch(url, { headers: BROWSER_HEADERS });
      if (r.ok) return r;
      console.warn(`[ensureCachedProductImage] ${r.status} for ${url}`);
      return null;
    } catch (e) {
      console.warn(`[ensureCachedProductImage] fetch threw for ${url}`, e);
      return null;
    }
  }

  // Some CDNs (e.g. skinsort storage) 403 our server IP regardless of headers.
  // Fall back to the wsrv.nl image proxy, which fetches from a different edge.
  const proxied = `https://wsrv.nl/?url=${encodeURIComponent(product.image_url)}&n=-1`;
  const srcRes =
    (await tryFetch(product.image_url)) ?? (await tryFetch(proxied));

  if (!srcRes) {
    // Give up gracefully: return the original URL so callers don't crash.
    // (fal.ai / other consumers may still fail, but we don't take down the flow.)
    console.error(
      `[ensureCachedProductImage] all fetch attempts failed for product ${productId}, returning original URL`,
    );
    return product.image_url;
  }

  const contentType = srcRes.headers.get("content-type") ?? "image/jpeg";
  const ext = extFromContentType(contentType);
  const buf = await srcRes.arrayBuffer();

  const path = `${product.brand_slug}/${product.product_slug}.${ext}`;
  const { error: upErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, buf, {
      contentType,
      upsert: true,
      cacheControl: "31536000",
    });
  if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);

  const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
  const publicUrl = pub.publicUrl;

  await supabaseAdmin
    .from("products")
    .update({ cached_image_url: publicUrl })
    .eq("id", productId);

  return publicUrl;
}
