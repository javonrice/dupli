import { createFileRoute } from "@tanstack/react-router";

function sanitizeFilename(value: string | null): string {
  const cleaned = (value || "dupli-reel.mp4").replace(/[^a-zA-Z0-9._-]/g, "-");
  return cleaned.endsWith(".mp4") ? cleaned : `${cleaned}.mp4`;
}

function isAllowedRemotionUrl(url: URL): boolean {
  return (
    url.protocol === "https:" &&
    url.hostname.endsWith("amazonaws.com") &&
    url.href.includes("remotionlambda-") &&
    url.pathname.endsWith(".mp4")
  );
}

export const Route = createFileRoute("/api/download-video")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestUrl = new URL(request.url);
        const rawUrl = requestUrl.searchParams.get("url");
        const filename = sanitizeFilename(requestUrl.searchParams.get("filename"));

        if (!rawUrl || rawUrl.length > 2048) {
          return new Response("Missing video URL", { status: 400 });
        }

        let videoUrl: URL;
        try {
          videoUrl = new URL(rawUrl);
        } catch {
          return new Response("Invalid video URL", { status: 400 });
        }

        if (!isAllowedRemotionUrl(videoUrl)) {
          return new Response("Video URL is not allowed", { status: 400 });
        }

        const upstream = await fetch(videoUrl);
        if (!upstream.ok || !upstream.body) {
          return new Response("Video is not ready", { status: upstream.status || 502 });
        }

        return new Response(upstream.body, {
          status: 200,
          headers: {
            "Content-Type": upstream.headers.get("Content-Type") || "video/mp4",
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});