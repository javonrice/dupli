// Camera/library capture flow extracted from <Scanner /> so it can be triggered
// from anywhere (e.g. the Discovery Hub FAB). Returns refs for the file inputs
// plus the current stage so callers can render the scanning + results screens.

import { useCallback, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { scanProduct, type DupeAnalysis } from "@/server/scan.functions";
import { saveScan, setSaved } from "@/server/scans.functions";

export type ScanStage = "idle" | "scanning" | "results";

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

export function useScanFlow() {
  const scan = useServerFn(scanProduct);
  const persistScan = useServerFn(saveScan);
  const toggleSaved = useServerFn(setSaved);
  const navigate = useNavigate();

  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const persistPromiseRef = useRef<Promise<{ id: string | null }> | null>(null);

  const [stage, setStage] = useState<ScanStage>("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<DupeAnalysis | null>(null);
  const [scanId, setScanId] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [savingBookmark, setSavingBookmark] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preparingShare, setPreparingShare] = useState(false);

  const reset = useCallback(() => {
    setStage("idle");
    setPreview(null);
    setAnalysis(null);
    setScanId(null);
    setIsSaved(false);
    setError(null);
    if (cameraRef.current) cameraRef.current.value = "";
    if (libraryRef.current) libraryRef.current.value = "";
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

      const p = persistScan({ data: { analysis: result, thumbnailDataUrl: small } });
      persistPromiseRef.current = p;
      p.then((r) => {
        if (r.id) setScanId(r.id);
      }).catch((e) => console.warn("Failed to persist scan", e));
    },
    [scan, persistScan],
  );

  const openCamera = useCallback(() => cameraRef.current?.click(), []);
  const openLibrary = useCallback(() => libraryRef.current?.click(), []);

  const handleShare = useCallback(
    async (dupeIdx?: number) => {
      if (preparingShare) return;
      const search = dupeIdx && dupeIdx > 0 ? { dupe: dupeIdx } : undefined;
      if (scanId) {
        navigate({ to: "/scan/$id/share", params: { id: scanId }, search });
        return;
      }
      setPreparingShare(true);
      try {
        const r = await (persistPromiseRef.current ??
          Promise.resolve({ id: null as string | null }));
        if (r?.id) {
          navigate({ to: "/scan/$id/share", params: { id: r.id }, search });
        } else {
          console.warn("Cannot share: scan not persisted");
        }
      } catch (e) {
        console.warn("Failed to prepare share", e);
      } finally {
        setPreparingShare(false);
      }
    },
    [scanId, preparingShare, navigate],
  );

  const handleToggleSave = useCallback(async () => {
    if (!scanId || savingBookmark) return;
    const next = !isSaved;
    setIsSaved(next);
    setSavingBookmark(true);
    try {
      await toggleSaved({ data: { scanId, saved: next } });
    } catch (e) {
      console.warn("Failed to toggle save", e);
      setIsSaved(!next);
    } finally {
      setSavingBookmark(false);
    }
  }, [scanId, isSaved, savingBookmark, toggleSaved]);

  return {
    cameraRef,
    libraryRef,
    stage,
    preview,
    analysis,
    scanId,
    isSaved,
    error,
    preparingShare,
    canSave: !!scanId,
    handleFile,
    openCamera,
    openLibrary,
    reset,
    handleShare,
    handleToggleSave,
  };
}
