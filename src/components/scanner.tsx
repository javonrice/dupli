import { useCallback, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link, useNavigate } from "@tanstack/react-router";
import { Camera, Images, Loader2, ScanLine, X, ShoppingBag, ExternalLink, RotateCw, Bookmark, Share2 } from "lucide-react";
import { scanProduct, type DupeAnalysis, type DupeSuggestion } from "@/server/scan.functions";
import { saveScan, setSaved } from "@/server/scans.functions";
import { DupeCard } from "@/components/dupe-card";
import { IOSScreen } from "@/components/ios-screen";
import { useHideTabBar } from "@/lib/tab-bar-visibility";
import { googleShoppingLink } from "@/lib/retailer-links";
import wordmark from "@/assets/dupli-wordmark.png";

type Stage = "idle" | "scanning" | "results";

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function downscaleImage(dataUrl: string, maxDim = 1024): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(dataUrl);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export function Scanner() {
  const scan = useServerFn(scanProduct);
  const persistScan = useServerFn(saveScan);
  const toggleSaved = useServerFn(setSaved);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const persistPromiseRef = useRef<Promise<{ id: string | null }> | null>(null);
  const navigate = useNavigate();
  const [preparingShare, setPreparingShare] = useState(false);

  const [stage, setStage] = useState<Stage>("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<DupeAnalysis | null>(null);
  const [scanId, setScanId] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [savingBookmark, setSavingBookmark] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStage("idle");
    setPreview(null);
    setAnalysis(null);
    setScanId(null);
    setIsSaved(false);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
    if (cameraRef.current) cameraRef.current.value = "";
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      const raw = await fileToDataUrl(file);
      const small = await downscaleImage(raw, 1024);
      setPreview(small);
      setStage("scanning");

      const { result, error: err } = await scan({ data: { imageDataUrl: small } });
      if (err || !result) {
        setError(err ?? "Couldn't analyze the photo.");
        setStage("idle");
        setPreview(null);
        return;
      }
      setAnalysis(result);
      setStage("results");

      // Persist scan to history (best-effort, don't block UI).
      const p = persistScan({ data: { analysis: result, thumbnailDataUrl: small } });
      persistPromiseRef.current = p;
      p.then((r) => {
        if (r.id) setScanId(r.id);
      }).catch((e) => console.warn("Failed to persist scan", e));
    },
    [scan, persistScan],
  );

  const handleShare = useCallback(async () => {
    if (preparingShare) return;
    if (scanId) {
      navigate({ to: "/scan/$id/share", params: { id: scanId } });
      return;
    }
    setPreparingShare(true);
    try {
      const r = await (persistPromiseRef.current ?? Promise.resolve({ id: null as string | null }));
      if (r?.id) {
        navigate({ to: "/scan/$id/share", params: { id: r.id } });
      } else {
        console.warn("Cannot share: scan not persisted");
      }
    } catch (e) {
      console.warn("Failed to prepare share", e);
    } finally {
      setPreparingShare(false);
    }
  }, [scanId, preparingShare, navigate]);

  const handleToggleSave = useCallback(async () => {
    if (!scanId || savingBookmark) return;
    const next = !isSaved;
    setIsSaved(next);
    setSavingBookmark(true);
    try {
      await toggleSaved({ data: { scanId, saved: next } });
    } catch (e) {
      console.warn("Failed to toggle save", e);
      setIsSaved(!next); // revert
    } finally {
      setSavingBookmark(false);
    }
  }, [scanId, isSaved, savingBookmark, toggleSaved]);

  return (
    <>
      {/* Hidden file inputs — shared across screens */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />

      {stage === "idle" && (
        <HomeScreen
          error={error}
          onCamera={() => cameraRef.current?.click()}
          onLibrary={() => fileRef.current?.click()}
        />
      )}

      {stage === "scanning" && <ScanningScreen preview={preview} />}

      {stage === "results" && analysis && (
        <ResultsScreen
          analysis={analysis}
          preview={preview}
          scanId={scanId}
          isSaved={isSaved}
          canSave={!!scanId}
          onToggleSave={handleToggleSave}
          onReset={reset}
          onShare={handleShare}
          preparingShare={preparingShare}
        />
      )}
    </>
  );
}

/* ---------------- Home (Camera-style, no scroll) ---------------- */

function HomeScreen({
  onCamera,
  onLibrary,
  error,
}: {
  onCamera: () => void;
  onLibrary: () => void;
  error: string | null;
}) {
  return (
    <IOSScreen
      title=""
      trailing={
        <img src={wordmark} alt="Dupli" className="h-9 w-auto sm:h-12" width={887} height={414} />
      }
      fixed
    >
      <div className="flex flex-1 flex-col items-center px-6 pb-3 pt-3">
        {/* Hero copy */}
        <div className="shrink-0 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground sm:text-[11px]">
            AI Dupe Finder
          </p>
          <h1 className="mt-1.5 font-display text-[24px] font-bold leading-[1.05] tracking-tight sm:text-[34px]">
            Snap any product.
          </h1>
          <p className="font-display text-[24px] font-bold italic leading-[1.05] tracking-tight text-muted-foreground sm:text-[34px]">
            Find the dupe.
          </p>
        </div>

        {/* Viewfinder — fills available space, shrinks freely on small screens */}
        <div className="relative my-3 w-full max-w-[260px] min-h-[120px] flex-1 overflow-hidden">
          <div className="absolute inset-0 rounded-[28px] border border-border bg-secondary/40" />
          <div className="absolute left-3 top-3 h-7 w-7 rounded-tl-[20px] border-l-[3px] border-t-[3px] border-foreground/50" />
          <div className="absolute right-3 top-3 h-7 w-7 rounded-tr-[20px] border-r-[3px] border-t-[3px] border-foreground/50" />
          <div className="absolute bottom-3 left-3 h-7 w-7 rounded-bl-[20px] border-b-[3px] border-l-[3px] border-foreground/50" />
          <div className="absolute bottom-3 right-3 h-7 w-7 rounded-br-[20px] border-b-[3px] border-r-[3px] border-foreground/50" />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
            <ScanLine className="h-8 w-8 text-foreground/30" strokeWidth={1.5} />
            <p className="text-[12px] leading-snug text-muted-foreground sm:text-[13px]">
              Center the product. Good lighting helps.
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-2 w-full shrink-0 rounded-[14px] border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-center text-[13px] text-destructive">
            {error}
          </div>
        )}

        {/* Capture controls — pinned to bottom, never clipped */}
        <div className="flex w-full shrink-0 flex-col gap-2">
          <button
            onClick={onCamera}
            className="tap flex h-[48px] w-full items-center justify-center gap-2 rounded-[14px] bg-foreground text-[15px] font-semibold text-background sm:h-[52px]"
          >
            <Camera className="h-[18px] w-[18px]" strokeWidth={2} />
            Take Photo
          </button>
          <button
            onClick={onLibrary}
            className="tap flex h-[48px] w-full items-center justify-center gap-2 rounded-[14px] bg-secondary text-[15px] font-semibold text-foreground sm:h-[52px]"
          >
            <Images className="h-[18px] w-[18px]" strokeWidth={2} />
            Choose from Library
          </button>
        </div>
      </div>
    </IOSScreen>
  );
}

/* ---------------- Scanning (full-screen modal, no scroll) ---------------- */

function ScanningScreen({ preview }: { preview: string | null }) {
  return (
    <div className="fixed inset-0 z-50 flex h-screen-safe flex-col bg-background">
      <div className="pt-safe" />
      <div className="relative flex-1 overflow-hidden">
        {preview && (
          <img
            src={preview}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        {/* Scrim */}
        <div className="absolute inset-0 bg-foreground/40 backdrop-blur-[2px]" />
        {/* Sweeping scan line */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] animate-[ios-scan_2.2s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-background to-transparent shadow-[0_0_24px_rgba(255,255,255,0.55)]" />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-background" strokeWidth={2} />
          <p className="font-display text-[17px] font-semibold text-background">
            Finding the dupe…
          </p>
          <p className="text-[13px] text-background/80">
            Reading the label and scanning ingredients.
          </p>
        </div>
      </div>
      <div className="pb-safe" />
      <style>{`
        @keyframes ios-scan {
          0%   { transform: translateY(0); opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { transform: translateY(100vh); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

/* ---------------- Results (scrollable Detail view) ---------------- */

export function ResultsScreen({
  analysis,
  preview,
  scanId,
  onReset,
  isSaved,
  canSave,
  onToggleSave,
  onShare,
  preparingShare,
}: {
  analysis: DupeAnalysis;
  preview: string | null;
  scanId?: string | null;
  onReset: () => void;
  isSaved: boolean;
  canSave: boolean;
  onToggleSave: () => void | Promise<void>;
  onShare?: () => void | Promise<void>;
  preparingShare?: boolean;
}) {
  // Hide the bottom tab bar while results are shown for extra spacing.
  useHideTabBar();

  const dupe = analysis.dupe;
  const link = dupe ? googleShoppingLink(dupe.brand, dupe.productName) : null;

  return (
    <IOSScreen
      title="Result"
      back={{ onClick: onReset }}
      fullHeight
      trailing={
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleSave}
            disabled={!canSave}
            aria-label={isSaved ? "Remove from saved" : "Save"}
            aria-pressed={isSaved}
            className={
              isSaved
                ? "tap flex h-9 w-9 items-center justify-center rounded-full bg-foreground text-background disabled:opacity-40"
                : "tap flex h-9 w-9 items-center justify-center rounded-full bg-secondary/60 text-foreground disabled:opacity-40"
            }
          >
            <Bookmark
              className="h-[18px] w-[18px]"
              strokeWidth={2}
              fill={isSaved ? "currentColor" : "none"}
            />
          </button>
          <button
            onClick={onReset}
            aria-label="New scan"
            className="tap flex h-9 w-9 items-center justify-center rounded-full bg-secondary/60 text-foreground"
          >
            <RotateCw className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      }
      bottomBar={
        <div className="flex items-stretch gap-2">
          {dupe &&
            (scanId ? (
              <Link
                to="/scan/$id/share"
                params={{ id: scanId }}
                aria-label="Share this dupe as image"
                className="tap flex h-[50px] shrink-0 items-center justify-center gap-1.5 rounded-[14px] border border-border bg-card px-4 text-[13px] font-semibold text-foreground"
              >
                <Share2 className="h-[16px] w-[16px]" strokeWidth={2.25} />
                Share this dupe
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => onShare?.()}
                disabled={preparingShare}
                aria-label="Share this dupe as image"
                className="tap flex h-[50px] shrink-0 items-center justify-center gap-1.5 rounded-[14px] border border-border bg-card px-4 text-[13px] font-semibold text-foreground disabled:opacity-60"
              >
                {preparingShare ? (
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.25} />
                ) : (
                  <Share2 className="h-[16px] w-[16px]" strokeWidth={2.25} />
                )}
                Share this dupe
              </button>
            ))}
          {link ? (
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="tap flex h-[50px] flex-1 items-center justify-center gap-2 rounded-[14px] bg-foreground text-[15px] font-semibold text-background"
            >
              <ShoppingBag className="h-[18px] w-[18px]" strokeWidth={2} />
              Shop on Google
              <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
            </a>
          ) : (
            <button
              onClick={onReset}
              className="tap flex h-[50px] flex-1 items-center justify-center rounded-[14px] bg-foreground text-[15px] font-semibold text-background"
            >
              Scan another product
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-4 px-4 pb-6 pt-3">
        {preview && (
          <div className="flex items-center gap-3 rounded-[16px] border border-border bg-card p-3 shadow-soft">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[12px] border border-border bg-secondary/40">
              <img
                src={preview}
                alt="Your scan"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Your scan
              </div>
              <p className="mt-0.5 truncate font-display text-[15px] font-semibold text-foreground">
                {analysis.original.productName}
              </p>
              <p className="truncate text-[12px] text-muted-foreground">
                {analysis.original.brand}
              </p>
            </div>
            <button
              onClick={onReset}
              className="tap flex h-9 items-center justify-center gap-1.5 rounded-full bg-secondary px-3 text-[12px] font-semibold text-foreground"
            >
              <RotateCw className="h-3.5 w-3.5" strokeWidth={2.25} />
              New scan
            </button>
          </div>
        )}
        <DupeCard analysis={analysis} />
      </div>
    </IOSScreen>
  );
}

/* close-button atom kept for potential future overlays */
export function IOSCloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Close"
      className="tap flex h-8 w-8 items-center justify-center rounded-full bg-foreground/10 text-foreground backdrop-blur"
    >
      <X className="h-4 w-4" strokeWidth={2.5} />
    </button>
  );
}
