import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getScan, getPublicScan, setSaved } from "@/server/scans.functions";
import { ResultsScreen } from "@/components/scanner";
import type { DupeAnalysis } from "@/server/scan.functions";

export const Route = createFileRoute("/_app/scan/$id/")({
  component: ScanDetailPage,
  head: () => ({
    meta: [{ title: "Scan — Dupli" }],
  }),
});

function ScanDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const fetchScan = useServerFn(getScan);
  const fetchPublicScan = useServerFn(getPublicScan);
  const toggleSaved = useServerFn(setSaved);

  const [analysis, setAnalysis] = useState<DupeAnalysis | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [savingBookmark, setSavingBookmark] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchScan({ data: { id } })
      .then(async (r) => {
        if (cancelled) return;
        if (r.scan) {
          setAnalysis(r.scan.analysis);
          setPreview(r.scan.thumbnail_data_url ?? r.scan.original_image_url ?? null);
          setIsSaved(r.isSaved);
          setIsOwner(true);
          return;
        }
        // Not the owner (or not signed in) — fall back to the public read so
        // save-sourced trending taps can still view the scan detail.
        const p = await fetchPublicScan({ data: { id } });
        if (cancelled) return;
        if (p.error || !p.scan) {
          setError(p.error ?? "Scan not found");
          return;
        }
        setAnalysis(p.scan.analysis);
        setPreview(p.scan.thumbnail_data_url ?? p.scan.original_image_url ?? null);
        setIsOwner(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load scan");
      });
    return () => {
      cancelled = true;
    };
  }, [id, fetchScan, fetchPublicScan]);

  const handleToggleSave = useCallback(async () => {
    if (savingBookmark) return;
    const next = !isSaved;
    setIsSaved(next);
    setSavingBookmark(true);
    try {
      await toggleSaved({ data: { scanId: id, saved: next } });
    } catch {
      setIsSaved(!next);
    } finally {
      setSavingBookmark(false);
    }
  }, [id, isSaved, savingBookmark, toggleSaved]);

  const goBack = useCallback(() => {
    if (window.history.length > 1) window.history.back();
    else navigate({ to: "/saved" });
  }, [navigate]);

  if (error) {
    return (
      <div className="flex min-h-screen-safe flex-col items-center justify-center bg-background px-6 text-center">
        <p className="text-[14px] text-muted-foreground">{error}</p>
        <button
          onClick={goBack}
          className="tap mt-4 inline-flex h-10 items-center justify-center rounded-[12px] bg-foreground px-4 text-[13px] font-semibold text-background"
        >
          Go back
        </button>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="flex min-h-screen-safe items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <ResultsScreen
      analysis={analysis}
      preview={preview}
      scanId={id}
      isSaved={isSaved}
      canSave
      onToggleSave={handleToggleSave}
      onReset={goBack}
    />
  );
}
