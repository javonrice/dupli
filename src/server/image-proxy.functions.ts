// Tiny server proxy that fetches an external image and returns it as a data URL.
// Used by the share card so html-to-image can render third-party product
// photos without CORS-tainting the canvas.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const fetchImageAsDataUrl = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ url: z.string().url() }).parse(data))
  .handler(async ({ data }): Promise<{ dataUrl: string | null; error: string | null }> => {
    try {
      const res = await fetch(data.url, {
        headers: {
          // Some image hosts 403 without a UA.
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          accept: "image/*,*/*;q=0.8",
        },
      });
      if (!res.ok) return { dataUrl: null, error: `HTTP ${res.status}` };
      const contentType = res.headers.get("content-type") ?? "image/jpeg";
      if (!contentType.startsWith("image/")) {
        return { dataUrl: null, error: `Not an image: ${contentType}` };
      }
      const buf = new Uint8Array(await res.arrayBuffer());
      // btoa needs a binary string; chunk to avoid call-stack limits.
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < buf.length; i += chunk) {
        binary += String.fromCharCode(...buf.subarray(i, i + chunk));
      }
      const base64 = btoa(binary);
      return { dataUrl: `data:${contentType};base64,${base64}`, error: null };
    } catch (e) {
      return { dataUrl: null, error: e instanceof Error ? e.message : "Fetch failed" };
    }
  });
