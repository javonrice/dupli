import { useServerFn } from "@tanstack/react-start";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Loader2,
  Upload,
  Download,
  RefreshCw,
  ImageIcon,
  X,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { scanProduct, type DupeAnalysis } from "@/server/scan.functions";
import { fetchImageAsDataUrl } from "@/server/image-proxy.functions";
import { ShareCard } from "@/components/share-card";
import { CarouselPhotoSlide } from "./carousel-photo-slide";
import { AppStoreCtaCard } from "./app-store-cta-card";
import { fileToDataUrl, downscaleImage } from "@/lib/image-utils";

const SLOTS = 5;
const OVERLAY_TEXT = "Scanning to find dupes so you don't have to";

type PhotoSlot = {
  id: string;
  file: File;
  previewUrl: string; // downscaled data URL
};

type ScanResult = {
  analysis: DupeAnalysis;
  originalImg: string | null;
  dupeImg: string | null;
};

type SlideKind =
  | { kind: "photo"; key: string; previewUrl: string; overlay?: string }
  | { kind: "share"; key: string; scan: ScanResult }
  | { kind: "cta"; key: string };

type SlideOutput = {
  key: string;
  label: string;
  dataUrl: string | null;
  error: string | null;
};

export function PhotoCarouselGenerator() {
  const scan = useServerFn(scanProduct);
  const proxyImage = useServerFn(fetchImageAsDataUrl);

  const [slots, setSlots] = useState<(PhotoSlot | null)[]>(
    Array(SLOTS).fill(null),
  );
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slides, setSlides] = useState<SlideKind[] | null>(null);
  const [outputs, setOutputs] = useState<SlideOutput[]>([]);

  // refs keyed by slide key, set by render container
  const slideRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const fileInputs = useRef<(HTMLInputElement | null)[]>([]);

  const allFilled = slots.every((s) => s !== null);
  const filledCount = slots.filter((s) => s !== null).length;

  const handlePick = useCallback(
    async (idx: number, file: File | null) => {
      if (!file) return;
      setError(null);
      try {
        const raw = await fileToDataUrl(file);
        const small = await downscaleImage(raw, 1280);
        setSlots((prev) => {
          const next = [...prev];
          next[idx] = {
            id: `${Date.now()}-${idx}`,
            file,
            previewUrl: small,
          };
          return next;
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't read file");
      }
    },
    [],
  );

  const clearSlot = useCallback((idx: number) => {
    setSlots((prev) => {
      const next = [...prev];
      next[idx] = null;
      return next;
    });
    const inp = fileInputs.current[idx];
    if (inp) inp.value = "";
  }, []);

  const reset = useCallback(() => {
    setSlots(Array(SLOTS).fill(null));
    setSlides(null);
    setOutputs([]);
    setError(null);
    setProgress(null);
    fileInputs.current.forEach((inp) => {
      if (inp) inp.value = "";
    });
  }, []);

  // --- Rasterize a slide ref to PNG ---
  const rasterize = useCallback(async (node: HTMLDivElement): Promise<string> => {
    // Wait for all <img> inside to finish decoding so the snapshot includes them.
    const imgs = Array.from(node.querySelectorAll("img"));
    await Promise.all(
      imgs.map(async (img) => {
        if (img.complete && img.naturalWidth > 0) return;
        try {
          await img.decode();
        } catch {
          await new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
          });
        }
      }),
    );
    const { toPng } = await import("html-to-image");
    // Prime then capture (matches the share-page double-pass to avoid empty <img> on first frame).
    await toPng(node, { cacheBust: false, pixelRatio: 1, width: 1080, height: 1350 });
    return toPng(node, {
      cacheBust: false,
      pixelRatio: 1,
      width: 1080,
      height: 1350,
    });
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!allFilled || busy) return;
    setBusy(true);
    setError(null);
    setOutputs([]);
    setSlides(null);
    try {
      const photos = slots.filter((s): s is PhotoSlot => s !== null);

      // 1) Scan all 5 photos sequentially so the user sees progress.
      const scans: (ScanResult | { error: string })[] = [];
      for (let i = 0; i < photos.length; i++) {
        setProgress(`Scanning ${i + 1}/${photos.length}…`);
        const { result, error: scanErr } = await scan({
          data: { imageDataUrl: photos[i].previewUrl },
        });
        if (scanErr || !result) {
          scans.push({ error: scanErr ?? "Scan failed" });
          continue;
        }

        // Pre-fetch product images as data URLs so the off-screen ShareCard
        // can rasterize without CORS / decode timing issues.
        setProgress(`Loading product images ${i + 1}/${photos.length}…`);
        const loadOne = async (url?: string | null): Promise<string | null> => {
          if (!url) return null;
          if (url.startsWith("data:")) return url;
          try {
            const r = await proxyImage({ data: { url } });
            return r.dataUrl;
          } catch {
            return null;
          }
        };
        const [originalImg, dupeImg] = await Promise.all([
          loadOne(result.original.imageUrl ?? photos[i].previewUrl),
          loadOne(result.dupe?.imageUrl),
        ]);
        scans.push({
          analysis: result,
          originalImg: originalImg ?? photos[i].previewUrl,
          dupeImg,
        });
      }

      // 2) Build the slide manifest. Skip share cards for failed scans
      //    but still include the photo slide so the carousel isn't broken.
      const built: SlideKind[] = [];
      photos.forEach((p, i) => {
        built.push({
          kind: "photo",
          key: `photo-${i}`,
          previewUrl: p.previewUrl,
          overlay: i === 0 ? OVERLAY_TEXT : undefined,
        });
        const s = scans[i];
        if (s && "analysis" in s) {
          built.push({ kind: "share", key: `share-${i}`, scan: s });
        }
      });
      built.push({ kind: "cta", key: "cta" });

      setSlides(built);

      // 3) Wait a tick so React commits the off-screen render tree,
      //    then rasterize sequentially.
      await new Promise((r) => setTimeout(r, 50));

      const results: SlideOutput[] = [];
      for (let i = 0; i < built.length; i++) {
        const slide = built[i];
        setProgress(`Rendering slide ${i + 1}/${built.length}…`);
        const node = slideRefs.current[slide.key];
        const label = slideLabelFor(slide, i);
        if (!node) {
          results.push({
            key: slide.key,
            label,
            dataUrl: null,
            error: "Slide node missing",
          });
          continue;
        }
        try {
          const dataUrl = await rasterize(node);
          results.push({ key: slide.key, label, dataUrl, error: null });
        } catch (e) {
          results.push({
            key: slide.key,
            label,
            dataUrl: null,
            error: e instanceof Error ? e.message : "Render failed",
          });
        }
        setOutputs([...results]);
      }
      setProgress(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, [allFilled, busy, slots, scan, proxyImage, rasterize]);

  const downloadOne = useCallback((o: SlideOutput, idx: number) => {
    if (!o.dataUrl) return;
    const a = document.createElement("a");
    a.href = o.dataUrl;
    a.download = `dupli-photo-carousel-${String(idx + 1).padStart(2, "0")}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, []);

  // ---- UI ----
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Photo Carousel
          </p>
          <h2 className="font-display text-2xl font-bold tracking-tight">
            Scan-and-Share Carousel
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload 5 product photos. We add a scanning hook to the first one,
            run each through our dupe finder, drop in branded share cards, and
            end with an App Store CTA. 11 ready-to-post slides.
          </p>
        </div>
        <div className="flex gap-2">
          {(slides || filledCount > 0) && (
            <Button variant="outline" onClick={reset} disabled={busy}>
              <X className="mr-2 h-4 w-4" />
              Reset
            </Button>
          )}
          <Button
            onClick={handleGenerate}
            disabled={!allFilled || busy}
            size="lg"
          >
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {progress ?? "Working…"}
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate carousel
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Upload slots */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {slots.map((slot, i) => (
          <div
            key={i}
            className="relative aspect-[4/5] overflow-hidden rounded-xl border border-dashed border-border bg-muted/30"
          >
            <input
              ref={(el) => {
                fileInputs.current[i] = el;
              }}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handlePick(i, e.target.files?.[0] ?? null)}
            />
            {slot ? (
              <>
                <img
                  src={slot.previewUrl}
                  alt={`Photo ${i + 1}`}
                  className="h-full w-full object-cover"
                />
                <button
                  onClick={() => clearSlot(i)}
                  disabled={busy}
                  className="absolute right-1.5 top-1.5 rounded-full bg-black/70 p-1 text-white hover:bg-black disabled:opacity-50"
                  aria-label="Remove photo"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <div className="absolute bottom-1.5 left-1.5 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                  #{i + 1}
                </div>
              </>
            ) : (
              <button
                onClick={() => fileInputs.current[i]?.click()}
                disabled={busy}
                className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
              >
                <Upload className="h-5 w-5" />
                <span className="text-xs font-semibold">Photo #{i + 1}</span>
              </button>
            )}
          </div>
        ))}
      </div>

      {!allFilled && (
        <p className="mt-3 text-xs text-muted-foreground">
          {filledCount}/{SLOTS} photos uploaded. Add{" "}
          {SLOTS - filledCount} more to enable generation.
        </p>
      )}

      {error && (
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">Failed</p>
            <p className="mt-1 break-words text-xs opacity-90">{error}</p>
          </div>
        </div>
      )}

      {/* Output grid */}
      {slides && (
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Slides ({outputs.filter((o) => o.dataUrl).length}/{slides.length})
            </h3>
            {busy && progress && (
              <span className="text-xs text-muted-foreground">{progress}</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {slides.map((slide, i) => {
              const o = outputs[i];
              return (
                <div
                  key={slide.key}
                  className="overflow-hidden rounded-xl border border-border bg-card"
                >
                  <div className="aspect-[4/5] w-full bg-muted/40">
                    {o?.dataUrl ? (
                      <img
                        src={o.dataUrl}
                        alt={`Slide ${i + 1}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                        {o?.error ? (
                          <div className="px-3 text-center text-[10px] text-destructive">
                            {o.error}
                          </div>
                        ) : busy ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <ImageIcon className="h-5 w-5" />
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs">
                    <span className="truncate font-semibold">
                      {i + 1}. {slideLabelFor(slide, i)}
                    </span>
                    {o?.dataUrl ? (
                      <button
                        onClick={() => downloadOne(o, i)}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label="Download slide"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                    ) : o?.error ? (
                      <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Off-screen render tree for html-to-image. Positioned far off-screen
          but still laid out so refs resolve and images load. */}
      {slides && (
        <div
          aria-hidden
          style={{
            position: "fixed",
            left: -100000,
            top: 0,
            width: 1080,
            pointerEvents: "none",
            opacity: 0,
          }}
        >
          {slides.map((slide) => (
            <div
              key={slide.key}
              style={{ width: 1080, height: 1350, marginBottom: 20 }}
            >
              <OffscreenSlide
                slide={slide}
                refSetter={(el) => {
                  slideRefs.current[slide.key] = el;
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function slideLabelFor(slide: SlideKind, idx: number): string {
  if (slide.kind === "photo") return idx === 0 ? "Hook" : "Photo";
  if (slide.kind === "share") return "Share card";
  return "App Store CTA";
}

function OffscreenSlide({
  slide,
  refSetter,
}: {
  slide: SlideKind;
  refSetter: (el: HTMLDivElement | null) => void;
}) {
  if (slide.kind === "photo") {
    return (
      <CarouselPhotoSlide
        ref={refSetter}
        imageUrl={slide.previewUrl}
        overlayText={slide.overlay ?? null}
      />
    );
  }
  if (slide.kind === "share") {
    return (
      <ShareCard
        ref={refSetter}
        analysis={slide.scan.analysis}
        originalImage={slide.scan.originalImg}
        dupeImage={slide.scan.dupeImg}
      />
    );
  }
  return <AppStoreCtaCard ref={refSetter} />;
}
