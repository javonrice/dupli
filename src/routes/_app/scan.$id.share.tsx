import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { Loader2, Share2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getScan } from "@/server/scans.functions";
import { fetchImageAsDataUrl } from "@/server/image-proxy.functions";
import { ShareCard } from "@/components/share-card";
import { IOSScreen } from "@/components/ios-screen";
import { useHideTabBar } from "@/lib/tab-bar-visibility";
import { selectDupe } from "@/lib/select-dupe";
import type { DupeAnalysis } from "@/server/scan.functions";

export const Route = createFileRoute("/_app/scan/$id/share")({
  component: SharePage,
  // ?dupe=<idx> picks an alternate from the "Also could be a dupe" rail.
  validateSearch: (s) => z.object({ dupe: z.coerce.number().int().min(0).optional() }).parse(s),
  head: () => ({
    meta: [{ title: "Share dupe — Dupli" }],
  }),
});

function SharePage() {
  useHideTabBar();
  const { id } = Route.useParams();
  const { dupe: dupeIdx } = Route.useSearch();
  const navigate = useNavigate();
  const fetchScan = useServerFn(getScan);
  const proxyImage = useServerFn(fetchImageAsDataUrl);

  const [rawAnalysis, setRawAnalysis] = useState<DupeAnalysis | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [originalImg, setOriginalImg] = useState<string | null>(null);
  const [dupeImg, setDupeImg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Apply the optional ?dupe=<idx> selection so sharing an alternate from the
  // "Also could be a dupe" rail puts THAT product on the share card.
  const analysis = useMemo<DupeAnalysis | null>(
    () => (rawAnalysis ? selectDupe(rawAnalysis, dupeIdx ?? 0) : null),
    [rawAnalysis, dupeIdx],
  );

  const dataUrlToFile = async (dataUrl: string, filename: string): Promise<File> => {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    return new File([blob], filename, { type: blob.type || "image/png" });
  };

  const cardRef = useRef<HTMLDivElement | null>(null);

  // Load the scan.
  useEffect(() => {
    let cancelled = false;
    fetchScan({ data: { id } })
      .then((r) => {
        if (cancelled) return;
        if (r.error || !r.scan) {
          setError(r.error ?? "Scan not found");
          return;
        }
        setRawAnalysis(r.scan.analysis);
        setPreview(r.scan.thumbnail_data_url ?? r.scan.original_image_url ?? null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load scan");
      });
    return () => {
      cancelled = true;
    };
  }, [id, fetchScan]);

  // Pre-fetch product images as data URLs so the export is instant.
  useEffect(() => {
    if (!analysis) return;
    let cancelled = false;
    const loadOne = async (url: string | undefined): Promise<string | null> => {
      if (!url) return null;
      if (url.startsWith("data:")) return url;
      try {
        const r = await proxyImage({ data: { url } });
        return r.dataUrl;
      } catch {
        return null;
      }
    };
    (async () => {
      const [orig, dup] = await Promise.all([
        loadOne(analysis.original.imageUrl ?? preview ?? undefined),
        loadOne(analysis.dupe?.imageUrl),
      ]);
      if (cancelled) return;
      setOriginalImg(orig ?? preview);
      setDupeImg(dup);
    })();
    return () => {
      cancelled = true;
    };
  }, [analysis, preview, proxyImage]);

  const handleDownload = useCallback(async () => {
    if (!analysis || downloading) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const node = cardRef.current;
      if (!node) throw new Error("Share card not ready");
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(node, {
        cacheBust: true,
        pixelRatio: 2,
        width: 1080,
        height: 1350,
      });
      const safeName =
        (analysis.dupe?.productName ?? analysis.original.productName)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 40) || "dupe";
      const filename = `dupli-${safeName}.png`;
      const file = await dataUrlToFile(dataUrl, filename);

      // Prefer the native share sheet (iOS/Android) so users can save to
      // Photos, AirDrop, Messages, etc. Falls back to download on desktop.
      const nav = navigator as Navigator & {
        canShare?: (data: { files?: File[] }) => boolean;
        share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
      };
      if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
        try {
          await nav.share({
            files: [file],
            title: "Dupli — found a dupe",
            text: `${analysis.dupe?.productName ?? "Dupe"} for ${analysis.original.productName}`,
          });
          return;
        } catch (err) {
          // User cancelled — silently exit. Anything else falls through to download.
          if ((err as Error)?.name === "AbortError") return;
        }
      }

      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      console.error("Share export failed", e);
      setDownloadError(e instanceof Error ? e.message : "Couldn't generate image");
    } finally {
      setDownloading(false);
    }
  }, [analysis, downloading]);

  // Always go to the result detail page, never `history.back()`. The scanner
  // resets its in-memory state when navigating to /share, so going back in
  // history would land on the empty camera screen instead of the result.
  const goBack = useCallback(() => {
    navigate({ to: "/scan/$id", params: { id } });
  }, [navigate, id]);

  if (error) {
    return (
      <IOSScreen title="Share" back={{ onClick: goBack }} fullHeight>
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <p className="text-[14px] text-muted-foreground">{error}</p>
        </div>
      </IOSScreen>
    );
  }

  if (!analysis) {
    return (
      <IOSScreen title="Share" back={{ onClick: goBack }} fullHeight>
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </IOSScreen>
    );
  }

  return (
    <IOSScreen
      title="Share dupe"
      back={{ onClick: goBack }}
      fullHeight
      bottomBar={
        <div className="flex flex-col gap-2">
          {downloadError && (
            <div className="text-center text-[11px] font-medium text-destructive">
              {downloadError}
            </div>
          )}
          <button
            onClick={handleDownload}
            disabled={downloading}
            aria-label="Share dupe image"
            className="tap flex h-[50px] w-full items-center justify-center gap-2 rounded-[14px] bg-foreground text-[15px] font-semibold text-background disabled:opacity-60"
          >
            {downloading ? (
              <Loader2 className="h-[18px] w-[18px] animate-spin" strokeWidth={2.25} />
            ) : (
              <Share2 className="h-[18px] w-[18px]" strokeWidth={2.25} />
            )}
            {downloading ? "Generating image…" : "Share image"}
          </button>
        </div>
      }
    >
      <div className="flex flex-1 flex-col items-center gap-3 px-4 pb-6 pt-3">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          <Share2 className="h-3.5 w-3.5" strokeWidth={2.25} />
          Preview
        </div>

        {/* Scaled preview wrapper. Shows the actual 1080x1350 share card,
            scaled down to fit the screen width. The unscaled card is what
            gets exported. */}
        <ScaledShareCard>
          <ShareCard
            ref={cardRef}
            analysis={analysis}
            originalImage={originalImg}
            dupeImage={dupeImg}
          />
        </ScaledShareCard>

        <p className="max-w-[28ch] text-center text-[12px] leading-snug text-muted-foreground">
          This is exactly what will be saved as a PNG to share on social.
        </p>
      </div>
    </IOSScreen>
  );
}

/**
 * Scales a fixed-size 1080×1350 child to fit its container width while
 * preserving aspect ratio. Uses CSS transform so the rendered child still
 * has its real pixel dimensions for html-to-image export.
 */
function ScaledShareCard({ children }: { children: React.ReactNode }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.3);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const compute = () => {
      const w = el.clientWidth;
      if (w > 0) setScale(w / 1080);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={wrapRef} className="w-full max-w-[420px]">
      <div
        style={{
          width: "100%",
          aspectRatio: "1080 / 1350",
          position: "relative",
          overflow: "hidden",
          borderRadius: 24,
          boxShadow: "0 30px 80px -20px rgba(0,0,0,0.18)",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 1080,
            height: 1350,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
