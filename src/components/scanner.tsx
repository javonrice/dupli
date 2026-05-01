import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Camera, ImageUp, Loader2, RotateCcw, X, ScanLine } from "lucide-react";
import { scanProduct, type ScanResult } from "@/server/scan.functions";
import { findDupeByAlias, type DupePair } from "@/data/catalog";
import { DupeCard } from "@/components/dupe-card";

type Stage = "idle" | "captured" | "scanning" | "results" | "no-match";

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
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [match, setMatch] = useState<DupePair | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStage("idle");
    setPreview(null);
    setScanResult(null);
    setMatch(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
    if (cameraRef.current) cameraRef.current.value = "";
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    const raw = await fileToDataUrl(file);
    const small = await downscaleImage(raw, 1024);
    setPreview(small);
    setStage("scanning");

    const { result, error: err } = await scan({ data: { imageDataUrl: small } });
    if (err || !result) {
      setError(err ?? "Couldn't analyze the photo.");
      setStage("captured");
      return;
    }
    setScanResult(result);
    const found =
      findDupeByAlias(`${result.brand ?? ""} ${result.productName} ${result.category ?? ""}`) ??
      findDupeByAlias(result.productName);
    setMatch(found);
    setStage(found ? "results" : "no-match");
  }, [scan]);

  useEffect(() => () => reset(), [reset]);

  if (stage === "results" && match) {
    return (
      <div className="space-y-5">
        <ScanSummary preview={preview} result={scanResult} onReset={reset} />
        <DupeCard pair={match} />
      </div>
    );
  }

  if (stage === "no-match") {
    return (
      <div className="space-y-5">
        <ScanSummary preview={preview} result={scanResult} onReset={reset} />
        <div className="rounded-3xl border border-border bg-card p-6 text-center shadow-soft">
          <h3 className="font-display text-lg font-semibold">No dupe in our library yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            We identified the product but don't have a dupe match for it yet. Our library grows every week.
          </p>
          <button
            onClick={reset}
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            <ScanLine className="h-4 w-4" />
            Scan another product
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Viewfinder */}
      <div className="relative aspect-[4/5] overflow-hidden rounded-3xl border border-border bg-secondary/40 shadow-soft">
        {preview ? (
          <img src={preview} alt="Captured product" className="h-full w-full object-cover" />
        ) : (
          <Viewfinder />
        )}
        {stage === "scanning" && <ScanningOverlay />}
        {preview && stage !== "scanning" && (
          <button
            onClick={reset}
            aria-label="Clear photo"
            className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-background/90 text-foreground shadow-soft backdrop-blur transition hover:bg-background"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="grid grid-cols-2 gap-3">
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
        <button
          onClick={() => cameraRef.current?.click()}
          disabled={stage === "scanning"}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-4 text-sm font-semibold text-primary-foreground shadow-soft transition hover:opacity-90 disabled:opacity-60"
        >
          <Camera className="h-4 w-4" />
          Take photo
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={stage === "scanning"}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 py-4 text-sm font-semibold text-foreground shadow-soft transition hover:bg-secondary/60 disabled:opacity-60"
        >
          <ImageUp className="h-4 w-4" />
          Upload
        </button>
      </div>

      {preview && stage === "captured" && !error && (
        <button
          onClick={reset}
          className="mx-auto flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
        >
          <RotateCcw className="h-3 w-3" />
          Try a different photo
        </button>
      )}
    </div>
  );
}

function Viewfinder() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="relative h-44 w-32">
        <div className="absolute left-0 top-0 h-6 w-6 border-l-2 border-t-2 border-foreground/40" />
        <div className="absolute right-0 top-0 h-6 w-6 border-r-2 border-t-2 border-foreground/40" />
        <div className="absolute bottom-0 left-0 h-6 w-6 border-b-2 border-l-2 border-foreground/40" />
        <div className="absolute bottom-0 right-0 h-6 w-6 border-b-2 border-r-2 border-foreground/40" />
        <div className="absolute inset-4 flex items-center justify-center rounded-md border border-dashed border-foreground/20">
          <ScanLine className="h-8 w-8 text-foreground/30" strokeWidth={1.5} />
        </div>
      </div>
      <p className="max-w-[16rem] text-sm text-muted-foreground">
        Center the product in frame. Good lighting helps us read the label.
      </p>
    </div>
  );
}

function ScanningOverlay() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/70 backdrop-blur-sm">
      <div className="absolute inset-x-6 top-1/2 h-px -translate-y-1/2 overflow-hidden">
        <div className="h-full w-full animate-pulse bg-foreground/40" />
      </div>
      <Loader2 className="h-6 w-6 animate-spin text-foreground" />
      <p className="font-display text-sm font-semibold tracking-wide">Reading the label…</p>
    </div>
  );
}

function ScanSummary({
  preview,
  result,
  onReset,
}: {
  preview: string | null;
  result: ScanResult | null;
  onReset: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-soft">
      {preview && (
        <img src={preview} alt="" className="h-16 w-16 flex-shrink-0 rounded-xl object-cover" />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Identified
        </div>
        <div className="truncate font-display text-sm font-semibold">
          {result?.productName ?? "Unknown product"}
        </div>
        {result?.brand && (
          <div className="truncate text-xs text-muted-foreground">{result.brand}</div>
        )}
      </div>
      <button
        onClick={onReset}
        className="flex-shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-secondary/60"
      >
        New scan
      </button>
    </div>
  );
}
